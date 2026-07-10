// Interior isolation census: probe EVERY interior door destination (independent
// ground truth - not the bounded-sector-derived room list that created the old
// blind spot). Per site: warp there, record room-bounds resolution, and
// screenshot for offline pixel analysis. Ledger -> tmp/isolation-census.json,
// shots -> tmp/isolation/<i>.png
// Run: node tmp/interior-isolation-census.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("tmp/isolation", { recursive: true });
const world = JSON.parse(readFileSync("apps/game/public/generated/world.json", "utf8"));
const s = world.sectors;
const sw = s.sectorWidthTiles * s.tileSize;
const sh = s.sectorHeightTiles * s.tileSize;
const sectorAt = (x, y) => {
  const c = Math.floor(x / sw), r = Math.floor(y / sh);
  const idx = r * s.cols + c;
  return { idx, indoor: s.indoor[idx] === 1, bounded: s.bounded[idx] === 1 };
};

// dedupe destinations within 96px
const dests = [];
for (const d of world.doors) {
  const p = d.destinationWorldPixel;
  if (!p) continue;
  const sec = sectorAt(p.x, p.y);
  if (!sec.indoor) continue; // interiors only
  if (dests.some((e) => Math.abs(e.x - p.x) < 96 && Math.abs(e.y - p.y) < 96)) continue;
  dests.push({ x: p.x, y: p.y, sector: sec.idx, bounded: sec.bounded });
}
console.error(`interior door destinations (deduped): ${dests.length}`);

const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 1 });
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
const dlg = () => page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
let calm = 0;
for (let i = 0; i < 30 && calm < 3; i++) {
  if (await dlg()) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(360); }
  else { calm++; await page.waitForTimeout(260); }
}

const ledger = [];
for (let i = 0; i < dests.length; i++) {
  const t = dests[i];
  await page.evaluate(([x, y]) => globalThis.__warpTo?.(x, y), [t.x, t.y]);
  await page.waitForTimeout(950);
  for (let k = 0; k < 5; k++) {
    if (!(await dlg())) break;
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(300);
  }
  const st = await page.evaluate(() => {
    const scene = globalThis.__game?.scene?.getScene("chunked-world");
    const cam = scene.cameras.main;
    const rb = scene["activeRoomBounds"];
    return {
      resolved: !!rb,
      isInterior: rb?.isInterior ?? null,
      rect: rb?.rect ?? null,
      cam: { x: cam.worldView.x, y: cam.worldView.y, zoom: cam.zoom }
    };
  });
  const shot = `tmp/isolation/${String(i).padStart(3, "0")}.png`;
  await page.screenshot({ path: shot });
  ledger.push({ i, ...t, ...st, shot });
  if (i % 25 === 0) console.error(`probed ${i}/${dests.length}`);
}
writeFileSync("tmp/isolation-census.json", JSON.stringify(ledger, null, 1));
console.error(`census done: ${ledger.length} sites`);
await browser.close();
