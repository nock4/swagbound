// Flag-bridge demo: beating the Card Clique (signal:clique_cleared) must stand down
// the arcade gang via the vanilla EB flags (FLG_WIN_FRANK + Shark set).
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
await page.evaluate(() => globalThis.__warpTo?.(1576, 1780));
await page.waitForTimeout(1600);
const count = () => page.evaluate(() => (globalThis.__firstSceneDebug?.npcs ?? []).filter((n) => n.visible).length);
const before = await count();
await page.screenshot({ path: "tmp/verify/flag-bridge-before.png" });
const flags = await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene["gameFlags"].set("signal:clique_cleared");
  return { nums: scene["gameFlags"].listNums() };
});
console.log("EB flags raised:", JSON.stringify(flags.nums));
// force a respawn sync: warp away and back
await page.evaluate(() => globalThis.__warpTo?.(2112, 1768));
await page.waitForTimeout(1200);
await page.evaluate(() => globalThis.__warpTo?.(1576, 1780));
await page.waitForTimeout(1600);
const after = await count();
await page.screenshot({ path: "tmp/verify/flag-bridge-after.png" });
console.log("visible NPCs near arcade: before =", before, "after =", after);
await browser.close();
