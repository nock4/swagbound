// Act-1 progression PROOF probe (in-engine).
// (1) Trigger ORDER: a boss-gate actor only exists once its requireFlags are met
//     (selectActiveBossGates). So __bossGates at 3 flag states proves the gate chain.
// (2) BARRIER gating: north-route-barrier (blockFlags signal:route_open) must block the
//     player walking north before route_open, and let them pass after.
//   node scripts/act1-gate-probe.mjs [base]
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://127.0.0.1:5173/").replace(/\/?$/, "/");
const browser = await chromium.launch();

const gatesAt = async (flags) => {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  const q = new URLSearchParams("nointro=1");
  if (flags) q.set("flags", flags);
  await page.goto(`${BASE}?${q}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  // Drain the cold-signal opening cutscene (lockPlayer at spawn) so boss-gate actors spawn.
  for (let i = 0; i < 30; i++) {
    const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen || globalThis.__firstSceneDebug?.inputLocked);
    if (!d) break;
    await page.keyboard.press("z"); await page.waitForTimeout(200);
  }
  // Poll until gate actors populate (they spawn on update once the scene is interactive).
  let g = [];
  for (let i = 0; i < 20; i++) {
    g = await page.evaluate(() => (globalThis.__bossGates?.gates ?? []).map((x) => x.triggerId).sort());
    if (g.length) break;
    await page.waitForTimeout(250);
  }
  const fl = await page.evaluate(() => globalThis.__firstSceneDebug?.flags ?? []);
  await page.close();
  return { gates: g, flags: fl };
};

// Behavioral barrier test: spawn just south of the barrier, hold Up, measure how far north we get.
const barrierTest = async (flags, spawn) => {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  const q = new URLSearchParams("nointro=1");
  q.set("spawn", spawn);
  if (flags) q.set("flags", flags);
  await page.goto(`${BASE}?${q}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const startY = (await page.evaluate(() => globalThis.__firstSceneDebug?.player))?.y;
  let minY = startY;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(120);
    await page.keyboard.up("ArrowUp");
    const p = await page.evaluate(() => globalThis.__firstSceneDebug?.player);
    if (p && p.y < minY) minY = p.y;
  }
  await page.close();
  return { startY: Math.round(startY), minY: Math.round(minY) };
};

console.log("=== (1) Trigger-order: boss gates present per flag state ===");
const s0 = await gatesAt("");
console.log("no flags          ->", JSON.stringify(s0.gates));
const s1 = await gatesAt("signal:clique_cleared");
console.log("clique_cleared    ->", JSON.stringify(s1.gates));
const s2 = await gatesAt("signal:clique_cleared,signal:route_open");
console.log("+ route_open      ->", JSON.stringify(s2.gates));
const s3 = await gatesAt("signal:clique_cleared,signal:route_open,signal:threshold_cleared");
console.log("+ threshold_clear ->", JSON.stringify(s3.gates));

console.log("\n=== (2) Barrier gating: walk NORTH from just south of the barrier (y~1540) ===");
// barrier area y:1496-1512; north of it (toward Malady) is y<1496.
const bClosed = await barrierTest("signal:clique_cleared", "1928,1544");
console.log(`route CLOSED (no route_open): startY=${bClosed.startY} minY=${bClosed.minY}  -> ${bClosed.minY > 1500 ? "BLOCKED (good)" : "PASSED THROUGH (BAD)"}`);
const bOpen = await barrierTest("signal:clique_cleared,signal:route_open", "1928,1544");
console.log(`route OPEN  (route_open set): startY=${bOpen.startY} minY=${bOpen.minY}  -> ${bOpen.minY < 1490 ? "PASSED (good)" : "STILL BLOCKED (check terrain)"}`);

await browser.close();
