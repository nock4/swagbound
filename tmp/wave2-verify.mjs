// Wave-2 verification: (A) night persists past route_open, dawns at threshold_cleared;
// (B) FLG_MYHOME_START populates the nine dormant townsfolk.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("tmp/verify", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
const night = () => page.evaluate(() => globalThis.__nightDebug ? globalThis.__nightDebug() : null);
await page.evaluate(() => globalThis.__warpTo?.(1820, 1400)); // mid-town, near npc 138
await page.waitForTimeout(1500);
console.log("baseline night:", JSON.stringify(await night())?.slice(0, 120));
await page.screenshot({ path: "tmp/verify/wave2-night-baseline.png" });
// route_open: night must PERSIST now
await page.evaluate(() => { globalThis.__game.scene.getScene("chunked-world")["gameFlags"].set("signal:route_open"); });
await page.waitForTimeout(900);
console.log("after route_open:", JSON.stringify(await night())?.slice(0, 120));
await page.screenshot({ path: "tmp/verify/wave2-night-after-gate.png" });
// threshold_cleared: dawn + daybreak NPCs
await page.evaluate(() => { globalThis.__game.scene.getScene("chunked-world")["gameFlags"].set("signal:threshold_cleared"); });
await page.waitForTimeout(900);
console.log("after threshold:", JSON.stringify(await night())?.slice(0, 120));
// MYHOME_START townsfolk: count visible near npc 135/138 spots, then set intro flag and respawn
const count = () => page.evaluate(() => (globalThis.__firstSceneDebug?.npcs ?? []).filter((n) => n.visible).length);
const before = await count();
await page.evaluate(() => { globalThis.__game.scene.getScene("chunked-world")["gameFlags"].set("intro:bedroom-opening-done"); });
await page.evaluate(() => globalThis.__warpTo?.(2112, 1768));
await page.waitForTimeout(1000);
await page.evaluate(() => globalThis.__warpTo?.(1820, 1400));
await page.waitForTimeout(1400);
const after = await count();
console.log(`townsfolk: before=${before} after=${after}`);
await page.screenshot({ path: "tmp/verify/wave2-day-town.png" });
await browser.close();
