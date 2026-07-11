// Site-2 (Intake Ledger) vertical-slice verification.
// A: with the registry flag set, the Notary boss + ledger prop stage behind the Registry.
// B: setting source:intake-ledger:cleared fires the reveal fragment + EB flag 191.
// C: the Original Mixtape (item 196) field-use reports "1 of 8" (threshold counts) and plays.
// Run: node tmp/site2-verify.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("tmp/verify", { recursive: true });
const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const tap = async (k, ms = 350) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const peek = () => page.evaluate(() => {
  const s = globalThis.__firstSceneDebug ?? null;
  return { dlg: s?.dialogueOpen ?? false, text: (s?.dialogueText ?? "").slice(0, 100) };
});
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(260); }
}
// A: stage check (registry flag comes from the trigger chain; read it from the codex-authored trigger)
const gateFlag = await page.evaluate(() => {
  const s = globalThis.__game.scene.getScene("chunked-world");
  const trig = s["data_"].storyTriggers?.triggers?.find((t) => t.id === "source-intake-ledger");
  return trig ? { require: trig.requireFlags, battleGroup: trig.battleGroup, boss: trig.boss } : null;
});
console.log("gate:", JSON.stringify(gateFlag));
await page.evaluate((f) => {
  const s = globalThis.__game.scene.getScene("chunked-world");
  for (const flag of f) s["gameFlags"].set(flag);
}, gateFlag?.require ?? []);
await page.evaluate(() => globalThis.__warpTo?.(2300, 7260));
await page.waitForTimeout(1800);
await page.screenshot({ path: "tmp/verify/site2-stage.png" });
// B: clear + reveal
const flags = await page.evaluate(() => {
  const s = globalThis.__game.scene.getScene("chunked-world");
  s["gameFlags"].set("source:intake-ledger:cleared");
  return { eb191: s["gameFlags"].isSet(191), nums: s["gameFlags"].listNums() };
});
console.log("after clear:", JSON.stringify(flags));
await page.evaluate(() => globalThis.__warpTo?.(2300, 7300));
await page.waitForTimeout(1500);
const reveal = await peek();
console.log("reveal:", JSON.stringify(reveal));
await page.screenshot({ path: "tmp/verify/site2-reveal.png" });
for (let i = 0, calm = 0; i < 12 && calm < 2; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(250); }
}
// C: mixtape field use (give item 196, set threshold too -> expect 2 of 8 with site 2)
// clear any residual dialogue first, then wait past the 75ms reopen cooldown
for (let i = 0, calm = 0; i < 12 && calm < 2; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(250); }
}
await page.evaluate(() => globalThis.__warpTo?.(2256, 7420)); // clear of the boss gate
await page.waitForTimeout(1500);
for (let i = 0, calm = 0; i < 12 && calm < 2; i++) {
  if ((await peek()).dlg) { calm = 0; await tap("KeyZ", 340); } else { calm++; await page.waitForTimeout(250); }
}
const tape = await page.evaluate(() => {
  const s = globalThis.__game.scene.getScene("chunked-world");
  s["gameFlags"].set("signal:threshold_cleared"); // + site 2 already set = 2 of 8
  const ps = s["partyState"];
  ps.give(0, 196);
  const slot = ps.inventory(0).indexOf(196);
  s["handleItemUseAction"]?.({ kind: "itemUse", ownerChar: 0, inventorySlot: slot, itemId: 196, targetChar: 0 });
  return { inv: ps.inventory(0), slot, cueBefore: s["music"]?.current ?? null };
});
await page.waitForTimeout(1400);
const tapeDlg = await peek();
console.log("mixtape dialogue:", JSON.stringify(tapeDlg), "| slot:", tape.slot, "| inv:", JSON.stringify(tape.inv));
const cueAfter = await page.evaluate(() => globalThis.__game.scene.getScene("chunked-world")["music"]?.current ?? null);
console.log("mixtape music cue after use:", JSON.stringify(cueAfter), "(expect cue: mixtape)");
await page.screenshot({ path: "tmp/verify/site2-mixtape.png" });
await browser.close();
