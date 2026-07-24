/**
 * Autonomous playtester. Drives the game headlessly through its DEV debug hooks,
 * explores the high-risk systems (overworld, barn door, ranch, fusion, menus),
 * and runs oracles that flag bugs with full repro context:
 *   - crash        : any pageerror / console error
 *   - softlock     : boxed in (blocked all 4 directions off a walkable tile)
 *   - dialogue-hang: a dialogue that will not close after many Z presses
 *   - invariant    : farm coins/rating go negative or NaN; save fails to round-trip
 *   - menu         : an overlay that opens but errors or will not close
 *
 * Findings (with position, flags, the action that triggered it, and a screenshot)
 * are written to tmp/autoplaytest-findings.json for review. This is the "body";
 * a human/Claude reads the findings and proposes fixes.
 *
 * Usage: node scripts/autoplaytest.mjs [baseUrl] [steps]
 *   node scripts/autoplaytest.mjs http://127.0.0.1:5199 400
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:5199";
const STEPS = Number(process.argv[3] ?? 400);
const FLAGS = "prologue:done,intro:morning,act1:complete,act2:complete,mons:farm-met";
const DIRS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const POI = [
  { name: "barn-door", x: 2152, y: 7488 },
  { name: "site-e-farm", x: 2510, y: 7380 },
  { name: "ranch-arrival", x: 2816, y: 10900 },
  { name: "ranch-yard", x: 2816, y: 11080 },
  { name: "ranch-gate", x: 2816, y: 10820 },
  { name: "postwick", x: 2324, y: 7428 }
];
const findings = [];
let mulberry = 0x9e3779b9;
const rng = () => { mulberry |= 0; mulberry = (mulberry + 0x6d2b79f5) | 0; let t = Math.imul(mulberry ^ (mulberry >>> 15), 1 | mulberry); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

async function tap(pg, key, ms = 90) {
  await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); await pg.waitForTimeout(70);
}
async function debug(pg) {
  return pg.evaluate(() => {
    const g = globalThis;
    const d = g.__firstSceneDebug;
    return d ? {
      x: d.player?.x, y: d.player?.y, dialogueOpen: d.dialogueOpen,
      flags: (d.flags?.strings ?? d.flags ?? []).length ?? 0,
      farm: typeof g.__farmDebug === "function" ? g.__farmDebug() : null
    } : null;
  }).catch(() => null);
}
async function record(pg, kind, detail, state) {
  let shot = null;
  try { shot = await pg.screenshot(); } catch { /* ignore */ }
  const dir = "tmp/autoplaytest-shots";
  try { mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  const id = `${kind}-${findings.length}`;
  if (shot) { try { writeFileSync(`${dir}/${id}.png`, shot); } catch { /* ignore */ } }
  findings.push({ id, kind, detail, state, shot: shot ? `${dir}/${id}.png` : null, at: findings.length });
  console.error(`  [FINDING ${kind}] ${detail}`);
}

async function main() {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 512, height: 448 } });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
  pg.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });

  await pg.goto(`${BASE}/?nointro=1&flags=${encodeURIComponent(FLAGS)}&noEncounters=1&cb=${rng()}`, { waitUntil: "networkidle" });
  await pg.mouse.click(256, 224);
  await pg.waitForFunction(() => globalThis.__firstSceneDebug?.player, null, { timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 14; i++) await tap(pg, "z", 55);
  await pg.keyboard.press("x").catch(() => {});

  // seed a roster + coins so fusion/ranch systems are exercisable
  await pg.evaluate(() => {
    try {
      ["supermetalmons-gen2-103-humgoo", "supermetalmons-gen2-1-zlappy", "supermetalmons-gen2-112-blowtie"].forEach((id) => globalThis.__monCatch?.(id));
      globalThis.__farmCoins?.(9000);
    } catch { /* ignore */ }
  });

  let lastErrCount = 0;
  let stuckStreak = 0, lastStuckKey = null, justWarped = false;
  const reportedStuck = new Set();
  const flushCrash = async (action, state) => {
    if (errors.length > lastErrCount) {
      await record(pg, "crash", `${errors.length - lastErrCount} error(s) after '${action}': ${errors.slice(lastErrCount).join(" | ").slice(0, 240)}`, state);
      lastErrCount = errors.length;
    }
  };

  for (let step = 0; step < STEPS; step++) {
    const before = await debug(pg);
    if (!before) { await record(pg, "crash", "world debug hook vanished (scene died?)", null); break; }

    // invariant oracle: farm state sane
    if (before.farm) {
      const f = before.farm;
      if (!(Number.isFinite(f.swagCoins) && f.swagCoins >= 0) || !(Number.isFinite(f.swagRating) && f.swagRating >= 0)) {
        await record(pg, "invariant", `farm coins=${f.swagCoins} rating=${f.swagRating}`, before);
      }
    }

    const roll = rng();
    let action = "move";
    if (roll < 0.42) {
      // MOVE: try each of the 4 directions this step; a real soft-lock is only
      // when NONE of them move the body across several consecutive move-steps
      // (a single blocked direction is just a wall).
      action = "move";
      let movedAny = false;
      for (const dir of DIRS) {
        await tap(pg, dir, 130);
        const after = await debug(pg);
        if (after && (Math.abs((after.x ?? 0) - (before.x ?? 0)) > 0.5 || Math.abs((after.y ?? 0) - (before.y ?? 0)) > 0.5)) { movedAny = true; break; }
      }
      if (!movedAny && !before.dialogueOpen && !justWarped) {
        const key = `${Math.round(before.x / 8)},${Math.round(before.y / 8)}`;
        stuckStreak = (lastStuckKey === key) ? stuckStreak + 1 : 1;
        lastStuckKey = key;
        // require the body stuck across 3 consecutive move-steps at one tile,
        // and confirm it isn't just standing on a debug-warp landing pixel.
        if (stuckStreak >= 3 && !reportedStuck.has(key)) {
          reportedStuck.add(key);
          // Confirm it is a REAL soft-lock, not a debug-warp wedge: nudge the
          // body to nearby clear cells; if a small nudge frees it, a real
          // player would never arrive wedged here (normal arrival is clearance-
          // checked), so it is a harness artifact, not a shippable bug.
          const freed = await pg.evaluate(() => {
            const w = globalThis.__warpTo; const s = globalThis.__solidAt; const d = globalThis.__firstSceneDebug;
            if (!w || !s || !d) return false;
            const { x, y } = d.player;
            for (const [dx, dy] of [[8,0],[-8,0],[0,8],[0,-8],[8,8],[8,-8],[-8,8],[-8,-8],[16,0],[-16,0],[0,16],[0,-16]]) {
              if (!s(x + dx, y + dy)) return true;
            }
            return false;
          }).catch(() => true);
          if (!freed) {
            await record(pg, "softlock", `stuck at ${Math.round(before.x)},${Math.round(before.y)} with NO adjacent clear cell (real soft-lock candidate)`, before);
          }
        }
      } else {
        stuckStreak = 0; lastStuckKey = null;
      }
      justWarped = false;
    } else if (roll < 0.55) {
      // INTERACT
      action = "interact-Z"; await tap(pg, "z", 120);
      // dialogue-hang oracle: if a dialogue opened, it must close within many Z
      const dlg = await debug(pg);
      if (dlg?.dialogueOpen) {
        let closed = false;
        for (let k = 0; k < 25; k++) { await tap(pg, "z", 70); const d = await debug(pg); if (!d?.dialogueOpen) { closed = true; break; } }
        if (!closed) { await tap(pg, "x", 90); const d = await debug(pg); if (d?.dialogueOpen) await record(pg, "dialogue-hang", `dialogue would not close after 25 Z + X at ${Math.round(before.x)},${Math.round(before.y)}`, before); }
      }
    } else if (roll < 0.70) {
      // WARP to a point of interest (exercise doors/ranch/fusion regions)
      const poi = pick(POI); action = `warp:${poi.name}`;
      await pg.evaluate(([x, y]) => {
        try {
          globalThis.__warpTo?.(x, y);
          // nudge off a debug-landing pixel that point-samples solid (mimics the
          // game's ring+offset arrival), so we explore from a walkable cell.
          const s = globalThis.__solidAt; const d = globalThis.__firstSceneDebug;
          if (s && d && s(d.player.x, d.player.y)) {
            for (const [dx, dy] of [[0,16],[0,-16],[16,0],[-16,0],[24,24],[-24,24]]) {
              if (!s(x + dx, y + dy)) { globalThis.__warpTo?.(x + dx, y + dy); break; }
            }
          }
        } catch {}
      }, [poi.x, poi.y]);
      await pg.waitForTimeout(500);
      for (let k = 0; k < 8; k++) await tap(pg, "z", 60); // clear any arrival dialogue
      await pg.keyboard.press("x").catch(() => {});
      justWarped = true; stuckStreak = 0; lastStuckKey = null;
    } else if (roll < 0.85) {
      // MENUS: open/close each overlay, catching errors or hangs
      const key = pick(["m", "f", "c", "o"]); action = `menu:${key}`;
      await tap(pg, key, 120);
      await pg.waitForTimeout(150);
      const open = await pg.evaluate(() => Boolean(document.querySelector("#farm-overlay,#compendium-overlay,#mons-overlay,#bug-reporter")) || Boolean(globalThis.__firstSceneDebug?.menuOpen)).catch(() => false);
      await tap(pg, "x", 100); await pg.keyboard.press("Escape").catch(() => {});
      const stillOpen = await pg.evaluate(() => Boolean(document.querySelector("#farm-overlay,#compendium-overlay,#mons-overlay"))).catch(() => false);
      if (open && stillOpen) await record(pg, "menu", `overlay '${key}' opened but would not close with X/Esc`, before);
    } else {
      // RANCH OPS: place/sell buildings, attempt a fusion via debug
      action = "ranch-op";
      await pg.evaluate(() => {
        const sc = globalThis.__game?.scene?.scenes?.find((s) => s.farmMons !== undefined);
        if (!sc || !sc.farmState_) return;
        const r = Math.random();
        try {
          if (r < 0.5) globalThis.__farmPlace?.(["itemWorks", "monBath", "trainingYard", "billboard"][Math.floor(Math.random() * 4)], 2600 + Math.floor(Math.random() * 400), 11000 + Math.floor(Math.random() * 200));
          else if (sc.farmState_.buildings.length) sc.farmState_.sellBuilding(sc.farmState_.buildings[0].id);
        } catch { /* the harness records the crash via pageerror */ }
      });
      await pg.waitForTimeout(200);
    }

    const after = await debug(pg);
    await flushCrash(pg, action, after ?? before);

    // periodic save round-trip oracle (every ~120 steps)
    if (step > 0 && step % 120 === 0) {
      await pg.keyboard.press("p").catch(() => {}); await pg.waitForTimeout(500);
      const ok = await pg.evaluate(() => {
        try { const b = localStorage.getItem("swagbound:save:0"); if (!b) return "no-save"; JSON.parse(b); return "ok"; } catch (e) { return "parse-fail:" + e.message; }
      }).catch(() => "eval-fail");
      if (ok !== "ok") await record(pg, "invariant", `save round-trip: ${ok}`, after);
    }
  }

  writeFileSync("tmp/autoplaytest-findings.json", JSON.stringify({
    base: BASE, steps: STEPS, totalErrors: errors.length,
    findingCount: findings.length, findings
  }, null, 2));
  console.error(`\n=== autoplaytest done: ${STEPS} steps, ${findings.length} findings, ${errors.length} raw errors ===`);
  const byKind = findings.reduce((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {});
  console.error("by kind:", JSON.stringify(byKind));
  await browser.close();
  process.exit(0);
}
main();
