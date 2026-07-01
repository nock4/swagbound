// Music placement audition / verification probe.
// Drives the dev server, spawns at each Act-1 music location (and triggers the
// battle/boss/victory/ending paths), reads the resolved music cue from
// __firstSceneDebug / __battleDebug, and records which approved .mp3 the WebAudio
// layer actually fetched. Proves Phase-7 music placement end-to-end.
//
// Usage: BASE=http://127.0.0.1:5174/ node scripts/music-audition-probe.mjs
// (point BASE at the running `pnpm --filter @eb/game dev` server)
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const mp3s = new Set();

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  page.on("response", (r) => { const u = r.url(); if (u.endsWith(".mp3")) mp3s.add(`${r.status()} ${u.split("/audio/")[1] ?? u}`); });
  return page;
}
const worldCue = (p) => p.evaluate(() => { const s = globalThis.__firstSceneDebug; return s ? { cue: s.musicCue ?? null, sector: s.currentSectorIndex ?? null, dlg: s.dialogueOpen } : null; });
const battleCue = (p) => p.evaluate(() => { const b = globalThis.__battleDebug; return b ? { cue: b.musicCue ?? null, phase: b.phase ?? null } : null; });
const dlgOpen = (p) => p.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
async function flush(p, n = 12) { for (let i = 0; i < n && (await dlgOpen(p)); i++) { await p.keyboard.press("KeyZ"); await p.waitForTimeout(210); } }
async function load(p, params) {
  await p.goto(`${BASE}?${params}`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1100);
}
const results = [];

// --- Overworld + 3 area spawns (read the resolved cue at the location) ---
for (const s of [
  { label: "overworld (sec 424)",      params: "nointro=1&spawn=2112,1760", expect: "overworld" },
  { label: "arcade (sec 421)",         params: "nointro=1&spawn=1320,1700", expect: "area:signal-arcade" },
  { label: "relay-yard (sec 391)",     params: "nointro=1&flags=signal:clique_cleared&spawn=1920,1600", expect: "area:signal-relay-yard" },
  { label: "north-threshold (sec 327)",params: "nointro=1&flags=signal:threshold_cleared&spawn=1920,1344", expect: "area:signal-north-threshold" }
]) {
  const p = await newPage(); await load(p, s.params);
  const c = await worldCue(p);
  results.push({ label: s.label, expect: s.expect, got: c?.cue, pass: c?.cue === s.expect });
  await p.close();
}

// --- intro: nate-young fetched during the cold-open sequence ---
{ const p = await newPage(); await load(p, ""); await p.waitForTimeout(400);
  results.push({ label: "intro (new-game open)", expect: "087 nate-young fetched", got: [...mp3s].some((m) => m.includes("087__nate-young")) ? "fetched" : "missing", pass: [...mp3s].some((m) => m.includes("087__nate-young")) }); await p.close(); }

// --- battle: force a normal encounter (group 2) ---
{ const p = await newPage(); await load(p, "nointro=1&spawn=2112,1760"); await flush(p);
  await p.evaluate(() => globalThis.__forceEncounter(2)); await p.waitForTimeout(2500);
  const b = await battleCue(p); results.push({ label: "battle (force group 2)", expect: "battle", got: b?.cue, pass: b?.cue === "battle" }); await p.close(); }

// --- boss: collide with the card-clique gate (448) from the south ---
{ const p = await newPage(); await load(p, "nointro=1&spawn=1512,1808"); await flush(p);
  let b = null;
  for (let i = 0; i < 16 && !b; i++) { await p.keyboard.down("ArrowUp"); await p.waitForTimeout(220); await p.keyboard.up("ArrowUp"); await p.waitForTimeout(110); if (await dlgOpen(p)) await flush(p); b = await battleCue(p); }
  results.push({ label: "boss (clique gate 448)", expect: "boss", got: b?.cue, pass: b?.cue === "boss" }); await p.close(); }

// --- victory: win the forced battle, BASH until victory-summary ---
{ const p = await newPage(); await load(p, "nointro=1&spawn=2112,1760"); await flush(p);
  await p.evaluate(() => globalThis.__forceEncounter(2)); await p.waitForTimeout(1500);
  let b = await battleCue(p);
  for (let i = 0; i < 60 && b && b.cue !== "victory"; i++) { await p.keyboard.press("KeyZ"); await p.waitForTimeout(250); b = await battleCue(p); if (!b) break; }
  results.push({ label: "victory (win group 2)", expect: "victory", got: b?.cue, pass: b?.cue === "victory" }); await p.close(); }

// --- ending: reach leave-signal-town (act1:complete) with threshold_cleared ---
{ const p = await newPage(); await load(p, "nointro=1&flags=signal:threshold_cleared&spawn=1920,1320"); await flush(p);
  let c = await worldCue(p);
  for (let i = 0; i < 8 && c?.cue !== "ending"; i++) { await p.keyboard.down("ArrowUp"); await p.waitForTimeout(300); await p.keyboard.up("ArrowUp"); await p.waitForTimeout(150); await flush(p); c = await worldCue(p); }
  results.push({ label: "ending (leave-signal-town)", expect: "ending", got: c?.cue, pass: c?.cue === "ending" }); await p.close(); }

console.log("\n========== MUSIC AUDITION RESULTS ==========");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.label}\n        expect=${r.expect}  got=${r.got}`);
console.log("\n--- approved .mp3 files fetched by the audio engine ---");
console.log([...mp3s].sort().join("\n") || "(none)");
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
await browser.close();
