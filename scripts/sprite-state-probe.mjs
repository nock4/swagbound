// Phase-0 in-engine check for the hero visual-state render path: force each state via the debug hook
// and assert the resolver output + the applied generic approximation (no faithful art exists yet, so
// every state must take the approximation/fallback branch). Screenshots a couple for eyeballing.
//   node scripts/sprite-state-probe.mjs [base]
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://127.0.0.1:5173/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
await page.goto(`${BASE}?nointro=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__setPlayerVisualState === "function", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);

const force = (forced) => page.evaluate((f) => globalThis.__setPlayerVisualState(f), forced);
const read = () => page.evaluate(() => globalThis.__firstSceneDebug?.visualState ?? null);

// Drain the opening cold-signal cutscene: while it runs, update() returns early (no per-frame sprite
// sync, so teleport-spin can't cycle and overlays can't reposition) AND its dialogue box covers the
// player's head (masking overlay pixel-diffs). Clear it so the normal loop runs for the checks below.
for (let i = 0; i < 30; i++) {
  const busy = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen || globalThis.__firstSceneDebug?.inputLocked);
  if (!busy) break;
  await page.keyboard.press("z");
  await page.waitForTimeout(150);
}
await page.waitForTimeout(300);

const cases = [
  { name: "default (cleared)",      forced: {},                                  expect: { baseState: "default", alpha: 1, tint: null, scaleRatio: 1 } },
  { name: "tiny",                   forced: { status: { tiny: true } },          expect: { baseState: "tiny", scaleRatio: 0.55 } },
  { name: "dead (faithful sheet)",  forced: { event: "dead" },                   expect: { baseState: "dead", sheetSwapped: true } },
  { name: "tiny+ko -> tinyDead",    forced: { ko: true, status: { tiny: true } },expect: { baseState: "tinyDead", alpha: 0.5, scaleRatio: 0.55 } },
  { name: "diamondized (tint)",     forced: { status: { diamondized: true } },   expect: { baseState: "diamondized", tintSet: true } },
  { name: "invert palette",         forced: { invertPalette: true },             expect: { baseState: "default", invert: true } },
  { name: "teleport spin",          forced: { teleporting: true },               expect: { baseState: "default", teleport: true } },
  { name: "ladder (faithful sheet)", forced: { onLadder: true },                 expect: { baseState: "ladder", sheetSwapped: true, lock: true } },
  { name: "rope (faithful sheet)",  forced: { onRope: true },                    expect: { baseState: "rope", sheetSwapped: true, lock: true } },
  { name: "bike (faithful sheet)",  forced: { riding: "bike" },                  expect: { baseState: "bike", sheetSwapped: true } },
  { name: "mushroom overlay",       forced: { status: { mushroomized: true } },  expect: { baseState: "default", overlay: "mushroom" } }
];

await force({});
const baseScale = (await read())?.applied?.scale ?? 1;
let pass = 0, fail = 0;
for (const c of cases) {
  await force(c.forced);
  await page.waitForTimeout(120);
  const v = await read();
  const checks = [];
  const e = c.expect;
  if (e.baseState !== undefined) checks.push(["baseState", v?.baseState === e.baseState, v?.baseState]);
  if (e.alpha !== undefined) checks.push(["alpha", Math.abs((v?.applied?.alpha ?? 1) - e.alpha) < 0.01, v?.applied?.alpha]);
  if (e.scaleRatio !== undefined) checks.push(["scaleRatio", Math.abs((v?.applied?.scale ?? 0) / baseScale - e.scaleRatio) < 0.05, ((v?.applied?.scale ?? 0) / baseScale).toFixed(2)]);
  if (e.tint === null) checks.push(["noTint", v?.applied?.tint === null, v?.applied?.tint]);
  if (e.tintSet) checks.push(["tintSet", typeof v?.applied?.tint === "number", v?.applied?.tint]);
  if (e.sheetSwapped) checks.push(["sheetSwapped", v?.sheetSwapped === true, v?.sheetSwapped]);
  if (e.invert) checks.push(["invert", v?.transforms?.invertPalette === true, v?.transforms?.invertPalette]);
  if (e.teleport) checks.push(["teleport", v?.transforms?.teleportSpin === true, v?.transforms?.teleportSpin]);
  if (e.lock) checks.push(["lock", v?.lockAnimation === true, v?.lockAnimation]);
  if (e.overlay) checks.push(["overlay", (v?.overlays ?? []).includes(e.overlay), v?.overlays]);
  const ok = checks.every((x) => x[1]);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  ${checks.filter((x) => !x[1]).map((x) => `${x[0]}=${JSON.stringify(x[2])}`).join(" ") || ""}`);
}
// PIXEL-DIFF is only meaningful for GEOMETRY/ALPHA here: the headless renderer does not composite
// WebGL color ops (setTint AND ColorMatrix filters), so invert/diamondized are verified by the readout
// checks above, not pixels. Confirm color visuals in a real browser. (Proven: setTint no-ops headless.)
const box = { x: 220, y: 150, width: 72, height: 104 }; // covers the player AND the head (overlays sit above the body)
const shot = () => page.screenshot({ clip: box });
// geometry: tiny must shrink the sprite vs default
await force({}); await page.waitForTimeout(150); const offBuf = await shot();
await force({ status: { tiny: true } }); await page.waitForTimeout(180); const tinyBuf = await shot();
const tinyChanged = Buffer.isBuffer(offBuf) && !offBuf.equals(tinyBuf);
// teleport spin: frames must be CYCLING (two captures during the spin differ)
await force({ teleporting: true }); await page.waitForTimeout(50); const t1 = await shot();
await page.waitForTimeout(170); const t2 = await shot();
const teleportCycling = Buffer.isBuffer(t1) && !t1.equals(t2);
// overlay PRESENCE is a textured child sprite (not a tint), so it DOES render headless
await force({}); await page.waitForTimeout(150); const noOverlay = await shot();
await force({ status: { mushroomized: true } }); await page.waitForTimeout(180); const withMushroom = await shot();
const overlayAppears = Buffer.isBuffer(noOverlay) && !noOverlay.equals(withMushroom);
console.log(`geometry pixel-diff -- tiny shrinks: ${tinyChanged ? "YES" : "NO"}  teleport spin cycles: ${teleportCycling ? "YES" : "NO"}  mushroom overlay appears: ${overlayAppears ? "YES" : "NO"}`);
await force({ status: { mushroomized: true } }); await page.waitForTimeout(150);
await page.screenshot({ path: "/private/tmp/livewalk/state-mushroom.png" }).catch(() => {});
// water wading: forcing deep water clips + raises the sprite (geometry)
await force({}); await page.waitForTimeout(150); const dryBuf = await shot();
await force({ deepWater: true }); await page.waitForTimeout(180); const wetBuf = await shot();
const waterClips = Buffer.isBuffer(dryBuf) && !dryBuf.equals(wetBuf);
console.log(`water wading clips sprite: ${waterClips ? "YES" : "NO"}`);
await force({ status: { tiny: true } }); await page.waitForTimeout(150);
await page.screenshot({ path: "/private/tmp/livewalk/state-tiny.png" }).catch(() => {});
const geomOk = tinyChanged && teleportCycling && overlayAppears && waterClips;
console.log(`\n=== ${pass}/${pass + fail} readout checks; geometry pixel-diff ok=${geomOk}; pageerrors: ${errs.length ? errs.slice(0, 3) : "none"} ===`);
await browser.close();
