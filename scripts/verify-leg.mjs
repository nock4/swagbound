#!/usr/bin/env node
/**
 * Verifies the FINAL Act-1 progression link the autorun's legit wins don't reach: with the boss
 * flags pre-set (as if malady were beaten), walking into the leave-signal-town area must set
 * act1:complete. Uses ?flags= to inject the story flags + ?spawn= to start just south of the area.
 * Run: node scripts/verify-leg.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const FLAGS = "signal:clique_cleared,signal:route_open,signal:threshold_cleared";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const peek = () => p.evaluate(() => globalThis.__firstSceneDebug ?? null);
const hold = async (k, ms) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(90); };

await p.goto(`${BASE}?nointro=1&spawn=1928,1384&flags=${FLAGS}`, { waitUntil: "networkidle" });
await p.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(1200);
let s = await peek();
console.log(`spawn: ${JSON.stringify(s?.player)}  flags: [${(s?.flags ?? []).join(",")}]`);

// Walk north into the leave area (1888..1968, 1280..1320), advancing any reveal/exit dialogue.
for (let i = 0; i < 50; i++) {
  s = await peek();
  if ((s?.flags ?? []).includes("act1:complete")) break;
  if (s?.dialogueOpen) { await p.keyboard.press("z"); await p.waitForTimeout(260); continue; }
  if (!s?.player) { await p.waitForTimeout(150); continue; }
  // nudge sideways toward the area center x if we drift
  const dx = 1928 - s.player.x;
  await hold(Math.abs(dx) > 24 ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : "ArrowUp", 140);
}
s = await peek();
const done = (s?.flags ?? []).includes("act1:complete");
console.log(done ? "*** LEAVE LEG OK: act1:complete set ***" : `leg NOT complete — flags: [${(s?.flags ?? []).join(",")}]`);
console.log(`final player: ${JSON.stringify(s?.player)}`);
await p.screenshot({ path: ".codex/screenshots/act1-leg.png" });
await b.close();
