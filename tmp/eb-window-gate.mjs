// EB talk-window parity gate.
// 1) Opens the exact reference sentence in-game, screenshots at 2x canvas (1024x896),
//    detects the rendered window border, and asserts it against the ROM-derived rect.
// 2) Asserts the reference wrap truth: "Don't talk to me.  I... I'm thinking...!"
//    breaks after "I'm" (2 lines) at the EB wrap width.
// 3) Emits a side-by-side composite vs the EB reference frame for eyeball sign-off.
// Run: node tmp/eb-window-gate.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("tmp/verify", { recursive: true });
const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const REF = "/Users/nickgeorge-studio/.claude/uploads/42723809-6520-4091-8fe7-f2a7c7aa7748/3f28c0a6-4dadf4d671963e6ec5988d577904901df1dcbd03.png";
// ROM truth at 2x canvas: visible border rect (200,18) 288x120 -> at the 2x screenshot: (400,36) 576x240
// tolPx 16 (= 4 native px): our nine-slice art draws its light line ~3 css px inside
// the panel rect and EB's own frame art has asymmetric rims (4px left, 1px top), so
// sub-rim deltas are frame-art texture, not window geometry.
const TARGET = { x: 400, y: 36, w: 576, h: 240, tolPx: 16 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
const SENTENCE = "Don't talk to me.  I... I'm thinking...!";
const wrapInfo = await page.evaluate((sentence) => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene.dialogue.start([{ text: sentence, ended: true, unknownCommands: [], segments: [] }]);
  return null;
}, SENTENCE);
await page.waitForTimeout(2500); // reveal completes
await page.screenshot({ path: "tmp/verify/eb-window-ours.png" });
const lines = await page.evaluate(() => {
  const ui = globalThis.__game?.scene?.getScene("ui");
  const t = ui?.["dialogueText"];
  return t ? t.getWrappedText(t.text) : null;
});
await browser.close();

// ---- measure our rendered border rect + assert ----
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const py = `
from PIL import Image
import json
img = Image.open('tmp/verify/eb-window-ours.png').convert('RGB')
W, H = img.size
px = img.load()
def light(x, y):
    p = px[x, y]
    return p[0] > 185 and p[1] > 185 and p[2] > 170
# Edge detection from bands that avoid the DEV badge (top-right) and the text:
# left/right edges from a middle row band; top/bottom from a middle column band.
rows = range(120, 260)   # inside the window vertically
cols = range(430, 640)   # inside the window horizontally, left of the badge
left = min(x for x in range(300, 600) for y in rows if light(x, y))
right = max(x for x in range(700, W) for y in rows if light(x, y))
top = min(y for y in range(0, 200) for x in cols if light(x, y))
bottom = max(y for y in range(150, 420) for x in cols if light(x, y))
print(json.dumps({"x": left, "y": top, "w": right - left + 1, "h": bottom - top + 1}))
`;
writeFileSync("tmp/verify/_gate_measure.py", py);
const measured = JSON.parse(execSync("python3 tmp/verify/_gate_measure.py").toString());
console.log("wrapped lines:", JSON.stringify(lines));
console.log("measured border:", JSON.stringify(measured), "| target:", JSON.stringify(TARGET));
const pass = {
  rectX: Math.abs(measured.x - TARGET.x) <= TARGET.tolPx,
  rectY: Math.abs(measured.y - TARGET.y) <= TARGET.tolPx,
  rectW: Math.abs(measured.w - TARGET.w) <= TARGET.tolPx,
  rectH: Math.abs(measured.h - TARGET.h) <= TARGET.tolPx,
  twoLines: Array.isArray(lines) && lines.length === 2,
  breakAfterIm: Array.isArray(lines) && /I'm\s*$/.test(lines[0] ?? "")
};
console.log("gate:", JSON.stringify(pass));
// ---- composite ----
const py2 = `
from PIL import Image
ours = Image.open('tmp/verify/eb-window-ours.png').convert('RGB')
ref = Image.open('${REF}').convert('RGB')
ref = ref.resize((1024, int(ref.height * 1024 / ref.width)))
H = max(ours.height, ref.height)
combo = Image.new('RGB', (2058, H), (20, 20, 20))
combo.paste(ours, (0, 0)); combo.paste(ref, (1034, 0))
combo.save('tmp/verify/eb-window-side-by-side.png')
print('composite saved')
`;
writeFileSync("tmp/verify/_gate_composite.py", py2);
console.log(execSync("python3 tmp/verify/_gate_composite.py").toString().trim());
const failed = Object.entries(pass).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? `FAIL: ${failed.join(", ")}` : "ALL GREEN");
