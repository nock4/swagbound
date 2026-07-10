// Pixel verification for content-sized dialogue windows (EB parity).
// Case A: Nick's exact repro — the house front-door flavor line (short page).
// Case B: a long multi-page NPC dialogue (4-line cap + more-arrow).
// Case C: a yes/no choice above a short page.
// Run with the dev server up: node tmp/dialogue-size-check.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("tmp/verify", { recursive: true });
const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const tap = async (k, ms = 350) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(85); };
const peek = () => page.evaluate(() => {
  const s = globalThis.__firstSceneDebug ?? null;
  return { dlg: s?.dialogueOpen ?? false, text: (s?.dialogueText ?? "").slice(0, 60) };
});
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); }
  else { calm++; await page.waitForTimeout(260); }
}

// Case A: the house front door (2648,344): face up at the door, press Z.
await page.evaluate(() => globalThis.__warpTo?.(2648, 400));
await page.waitForTimeout(1500);
await hold("ArrowUp", 500);
await tap("KeyZ", 700); // fires the "door is unlocked" line
await page.waitForTimeout(1800); // let the reveal finish so the final box state shows
console.log("A:", JSON.stringify(await peek()));
await page.screenshot({ path: "tmp/verify/dialogue-short-line.png" });
for (let i = 0, calm = 0; i < 12 && calm < 2; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(250); }
}

// Case B: the Spawn notice sign (2112,1788) — longer authored page.
await page.evaluate(() => globalThis.__warpTo?.(2112, 1760));
await page.waitForTimeout(1500);
await hold("ArrowDown", 400);
await tap("KeyZ", 700);
await page.waitForTimeout(1800);
console.log("B:", JSON.stringify(await peek()));
await page.screenshot({ path: "tmp/verify/dialogue-long-page.png" });
for (let i = 0, calm = 0; i < 12 && calm < 2; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(250); }
}

// Case C: a choice — the hotel clerk offers a yes/no (SWAG hotel door area). Fallback:
// any NPC with a choice; use the exit-stamp clerk region. If no choice found, skip C.
await page.evaluate(() => globalThis.__warpTo?.(1928, 1330));
await page.waitForTimeout(1500);
await hold("ArrowUp", 400);
await tap("KeyZ", 700);
await page.waitForTimeout(1500);
const c = await page.evaluate(() => {
  const s = globalThis.__firstSceneDebug;
  return { dlg: s?.dialogueOpen ?? false, choice: Boolean(s?.choiceOpen ?? s?.choice) };
});
console.log("C:", JSON.stringify(c));
await page.screenshot({ path: "tmp/verify/dialogue-choice.png" });
await browser.close();
console.log("done");
