// Max-load menu stress audit: 4-party, 14 items per member (mixed consumables +
// equipment, some equipped for E-badges), every PSI on every member. Screenshots
// every menu surface. Rig is entirely in-page via the __game forensics handle.
// Run: node tmp/menu-stress.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("tmp/menustress", { recursive: true });

const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto(base + "?nointro=1&noEncounters=1&psi=all", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
const dlg = () => page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
let calm = 0;
for (let i = 0; i < 30 && calm < 3; i++) {
  if (await dlg()) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
const tap = async (k, ms = 350) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const shot = (n) => page.screenshot({ path: `tmp/menustress/${n}.png` });

// ---- RIG ----
const rig = await page.evaluate(() => {
  const g = globalThis;
  g.__recruit?.(1); g.__recruit?.(2); g.__recruit?.(3);
  const scene = g.__game?.scene?.getScene("chunked-world");
  const ps = scene["partyState"];
  // grant every PSI to every member at level 1
  const psi = scene["data_"]?.psi;
  let psiCount = 0;
  if (psi?.psi) {
    for (const entry of psi.psi) {
      entry.learnedBy = [0, 1, 2, 3].map((charId) => ({ charId, level: 1 }));
      psiCount++;
    }
  }
  // fill bags: mix of consumables and equippables from the loaded item table
  const items = scene["data_"]?.items?.items ?? [];
  // realistic bag mix: named items that are consumable-or-equipment, skipping
  // placeholder/null entries so the audit reflects a real player's bag
  const usable = items
    .filter((it) => it && it.name && it.name.toLowerCase() !== "null" && !/^broken |^bricked |^spent |^dud /i.test(it.name))
    .map((it) => it.id);
  const given = {};
  for (const char of [0, 1, 2, 3]) {
    given[char] = 0;
    let k = char * 7; // vary per member
    while (ps.inventoryRoom(char) > 0 && k < usable.length + 200) {
      if (ps.give(char, usable[k % usable.length])) given[char]++;
      k++;
    }
  }
  // equip a couple per member for E badges
  const equips = items.filter((it) => it && (it.type === 1 || it.type === 2 || it.slot)).map((it) => it.id);
  for (const char of [0, 1, 2, 3]) {
    for (const e of equips.slice(char, char + 2)) g.__equip?.(char, e);
  }
  scene["refreshMenuScreens"]?.();
  return { party: ps.party(), psiCount, given, inventories: [0,1,2,3].map((c) => ps.inventory(c).length) };
});
console.log("RIG:", JSON.stringify(rig));

// ---- OVERWORLD MENUS ----
await tap("KeyM", 800);
await shot("ow-0-menu");
// Goods per char
await tap("ArrowRight", 300); await tap("KeyZ", 500); // goods -> picker
await shot("ow-1-goods-picker");
for (let c = 0; c < 4; c++) {
  await tap("KeyZ", 700); // open member's list
  await shot(`ow-2-goods-char${c}`);
  await tap("ArrowDown", 250); await tap("ArrowDown", 250); await tap("ArrowDown", 250);
  await shot(`ow-3-goods-char${c}-scrolled`);
  // scroll to the bottom item
  for (let i = 0; i < 12; i++) await tap("ArrowDown", 120);
  await shot(`ow-4-goods-char${c}-bottom`);
  await tap("KeyX", 400); // back to picker
  await tap("ArrowDown", 250); // next member
}
await tap("KeyX", 400);
// PSI menu
await tap("KeyX", 400); await tap("KeyM", 700);
await tap("ArrowRight", 250); await tap("ArrowRight", 250); await tap("KeyZ", 600); // PSI
await shot("ow-5-psi-root");
await tap("KeyZ", 600);
await shot("ow-6-psi-member");
for (let i = 0; i < 10; i++) await tap("ArrowDown", 120);
await shot("ow-7-psi-scrolled");
await tap("KeyX", 350); await tap("KeyX", 350); await tap("KeyX", 350);
// Equip + Status
await tap("KeyM", 700);
await tap("ArrowLeft", 250); await tap("ArrowDown", 250); await tap("KeyZ", 600); // Equip (grid pos)
await shot("ow-8-equip");
await tap("KeyX", 350); await tap("KeyX", 350); await tap("KeyX", 400);
await tap("KeyM", 700); await tap("ArrowDown", 250); await tap("ArrowRight", 250); await tap("KeyZ", 600); // Status
await shot("ow-9-status");
await tap("KeyX", 350); await tap("KeyX", 350); await tap("KeyX", 400);

// ---- BATTLE MENUS ----
await page.evaluate(() => globalThis.__forceEncounter?.(1));
await page.waitForTimeout(4500);
await shot("bt-0-command");
// goods
for (let i = 0; i < 8; i++) {
  const b = await page.evaluate(() => globalThis.__battleDebug);
  if (b && String(b.command).toLowerCase().includes("good")) { await tap("KeyZ", 700); break; }
  await tap("ArrowRight", 300);
}
await shot("bt-1-goods-14");
for (let i = 0; i < 12; i++) await tap("ArrowDown", 120);
await shot("bt-2-goods-bottom");
await tap("KeyX", 500);
// psi
for (let i = 0; i < 8; i++) {
  const b = await page.evaluate(() => globalThis.__battleDebug);
  if (b && String(b.command).toLowerCase().includes("psi")) { await tap("KeyZ", 700); break; }
  await tap("ArrowRight", 300);
}
await shot("bt-3-psi-full");
for (let i = 0; i < 10; i++) await tap("ArrowDown", 120);
await shot("bt-4-psi-scrolled");
await tap("KeyZ", 600);
await shot("bt-5-psi-depth");
console.log("audit shots complete");
await browser.close();
