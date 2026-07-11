// Pixel proof for the story-item renderer: inject a present with storyItemId "dox-sheet"
// next to the player, respawn interactable sprites, screenshot. Dev-only; no content change.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
// clear boot dialogue
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
const res = await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  if (!scene) return { error: "no scene" };
  const p = globalThis.__firstSceneDebug?.player;
  const entry = {
    id: "dev-dox-sheet-render-check",
    kind: "present",
    label: "Dox Sheet (dev render check)",
    worldPixel: { x: Math.round(p.x) + 40, y: Math.round(p.y) },
    item: { char: 0, item: 206 },
    pages: ["GOT: Dox Sheet."],
    storyItemId: "dox-sheet"
  };
  scene["data_"].overworldInteractables.interactables.push(entry);
  scene["spawnPresentInteractables"]?.();
  const spr = scene["presentInteractableSprites"]?.get(entry.id);
  return {
    textureKey: spr?.texture?.key,
    visible: spr?.visible,
    storyItemsLoaded: scene["data_"].storyItems.items.length,
    at: entry.worldPixel
  };
});
console.log(JSON.stringify(res));
await page.waitForTimeout(800);
await page.screenshot({ path: "tmp/route-ledger/20-dox-sheet-world-render.png" });
// also verify a NORMAL present still renders generic (regression)
const reg = await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  const spr = scene["presentInteractableSprites"]?.get("signal-spawn-present");
  return { normalPresentTexture: spr?.texture?.key };
});
console.log(JSON.stringify(reg));
await browser.close();
