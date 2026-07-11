// Recon: the Postwick Registry area for site-2 staging (screenshots + walkability).
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
for (const [name, x, y] of [["registry-front", 2300, 7340], ["registry-rear", 2300, 7240], ["registry-east", 2450, 7290]]) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x, y });
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => { const q = globalThis.__firstSceneDebug?.player; return q ? { x: Math.round(q.x), y: Math.round(q.y) } : null; });
  console.log(name, "landed:", JSON.stringify(p));
  await page.screenshot({ path: `tmp/verify/recon-${name}.png` });
}
// walkability band behind the registry
const grid = await page.evaluate(() => {
  const fn = globalThis.__solidAt;
  const rows = [];
  for (let y = 7160; y <= 7360; y += 16) {
    let row = "";
    for (let x = 2150; x <= 2600; x += 16) row += fn(x, y) ? "#" : ".";
    rows.push(String(y).padStart(5) + " " + row);
  }
  return rows.join("\n");
});
console.log(grid);
await browser.close();
