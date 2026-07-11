import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); } else { calm++; await page.waitForTimeout(260); }
}
await page.evaluate(() => globalThis.__game.scene.getScene("chunked-world")["gameFlags"].set("act2:registry_cleared"));
// within 32px arm range so the Notary spawns; frame includes the ledger prop at (2332,7208)
await page.evaluate(() => globalThis.__warpTo?.(2316, 7228));
await page.waitForTimeout(1800);
const info = await page.evaluate(() => {
  const s = globalThis.__game.scene.getScene("chunked-world");
  const boss = [...s["bossGateActors"]].find(([k]) => k === "source-intake-ledger")?.[1];
  const ledgerSprite = s["presentInteractableSprites"]?.get?.("intake-ledger") ?? null;
  // examine props may render in a different map; scan all image children near the ledger coord
  let ledgerTex = null;
  s.children?.list?.forEach?.((c) => {
    if (c?.texture?.key && /intake-ledger|prop/.test(c.texture.key) && Math.hypot((c.x??0)-2332,(c.y??0)-7208)<40) ledgerTex = c.texture.key;
  });
  return { bossTex: boss?.sprite?.texture?.key ?? boss?.texture?.key, bossXY: [Math.round(boss?.sprite?.x ?? -1), Math.round(boss?.sprite?.y ?? -1)], ledgerTex };
});
console.log("boss:", JSON.stringify(info));
await page.screenshot({ path: "tmp/verify/site2-art-lot.png" });
await browser.close();
