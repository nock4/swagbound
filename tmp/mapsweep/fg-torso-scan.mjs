// FG torso-cut CLASS fix scan.
// Visits every interior, and for each visible NPC checks whether the foreground layer
// (baked counter/table top-rails etc.) covers the NPC's TORSO band (mid-body) rather
// than only the lower body. When it does — the "table intersecting the torso" glitch —
// emits a per-column fg-override erase rect clearing the rail FG only in that NPC's
// column (the rest of the counter FG stays intact). Output: tmp/mapsweep/fg-torso-erases.json
// Run: node tmp/mapsweep/fg-torso-scan.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const interiors = JSON.parse(readFileSync(new URL("tmp/interior-targets.json", root), "utf8"));
const SWEEP_FLAGS = JSON.parse(readFileSync(new URL("tmp/mapsweep/sweep-flags.json", root), "utf8"));
const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
const dlgClear = async () => {
  for (let i = 0, calm = 0; i < 14 && calm < 2; i++) {
    const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
    if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(300); } else { calm++; await page.waitForTimeout(150); }
  }
};
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
await dlgClear();
await page.evaluate((flags) => { const s = globalThis.__game?.scene?.getScene("chunked-world"); for (const f of flags) s["gameFlags"].set(f); }, SWEEP_FLAGS);

const erases = [];
let scanned = 0, cut = 0;
for (const t of interiors) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x: t.x, y: t.y });
  await page.waitForTimeout(900);
  await dlgClear();
  const found = await page.evaluate(() => {
    const fgAlpha = globalThis.__fgAlphaAt;
    if (!fgAlpha) return [];
    const out = [];
    for (const n of (globalThis.__firstSceneDebug?.npcs ?? [])) {
      if (!n.visible) continue;
      // FG coverage over the TORSO band (feet y-28 .. y-8) vs LOWER band (y-6 .. y+6).
      // A cut = FG covers the torso. (Legitimate lower-body occlusion covers the lower band.)
      // TRUE torso-cut signature: a THIN FG band across the torso, with the body
      // CLEAR both ABOVE (head) and BELOW (lower body/feet). Legitimate walk-behind
      // occlusion instead covers the torso AND everything below it (lower body hidden),
      // so we EXCLUDE any NPC whose lower body is also FG-covered.
      let torso = 0;
      for (let dy = -26; dy <= -10; dy += 4) if (fgAlpha(n.x, n.y + dy) > 0.4) torso++;
      const headClear = fgAlpha(n.x, n.y - 38) < 0.3;
      // lower body: sample below the rail; if FG covers it, this is real occlusion, not a cut
      let lowerFg = 0;
      for (let dy = -2; dy <= 10; dy += 4) if (fgAlpha(n.x, n.y + dy) > 0.4) lowerFg++;
      const bodyBelowVisible = lowerFg === 0;
      if (torso >= 2 && headClear && bodyBelowVisible) {
        out.push({ npcId: n.npcId, x: Math.round(n.x), y: Math.round(n.y), torso });
      }
    }
    return out;
  });
  scanned++;
  for (const f of found) {
    cut++;
    // erase the FG in this NPC's column over the torso band (head-top to just above feet)
    erases.push({
      x: f.x - 14, y: f.y - 34, w: 28, h: 30,
      note: `[torso-cut fix] clear counter/table rail FG cutting NPC ${f.npcId} at (${f.x},${f.y}) in interior area ${t.areaId}`
    });
  }
  if (scanned % 20 === 0) { console.log(`  scanned ${scanned}/${interiors.length} interiors, ${cut} cut NPCs`); writeFileSync(new URL("tmp/mapsweep/fg-torso-erases.json", root), JSON.stringify(erases, null, 1)); }
}
writeFileSync(new URL("tmp/mapsweep/fg-torso-erases.json", root), JSON.stringify(erases, null, 1));
console.log(`DONE: ${scanned} interiors, ${cut} torso-cut NPCs -> ${erases.length} erase rects. fg-torso-erases.json`);
await browser.close();
