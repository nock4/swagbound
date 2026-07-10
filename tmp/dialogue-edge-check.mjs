// Edge-case pixel checks for content-sized dialogue: 4-line cap page + choice over short page.
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
// Case B: long page (wraps past the 4-line cap) via the dialogue controller
await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene.dialogue.start([{
    text: "The clique does not lose. It re-prints. Where one folded, a cleaner Bosch stands up: pre-signed, better-lit, already filed under his name and smiling with a confidence no original could clear customs with. The town applauds the version it was handed first.",
    ended: false,
    unknownCommands: [],
    segments: []
  }, { text: "Second page so the more-arrow shows.", ended: true, unknownCommands: [], segments: [] }]);
});
await page.waitForTimeout(3500); // reveal completes
await page.screenshot({ path: "tmp/verify/dialogue-4line-cap.png" });
// Case C: short page + yes/no choice
await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene.dialogue.start([{ text: "Stay the night? It's 20 swag.", ended: true, unknownCommands: [], segments: [] }]);
  scene.dialogue.showChoice([{ label: "Yes" }, { label: "No" }], 0);
});
await page.waitForTimeout(1600);
await page.screenshot({ path: "tmp/verify/dialogue-choice.png" });
await browser.close();
console.log("done");
