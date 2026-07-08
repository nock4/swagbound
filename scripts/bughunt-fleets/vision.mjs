import fs from "node:fs";
import path from "node:path";
import { afterAction, codexVision, createFleetRunControl, limitFor, state } from "./shared.mjs";

const PROMPT = `You are a confused first-time player of an EarthBound-style game. ONE line JSON {defect:bool, class:'', note:''}. Flag: garbled art, floating sprites, text problems, impossible geometry, anything that would confuse or look broken. Ignore: the hooded player, HUD text, dialogue boxes, intended darkness.`;

export async function run(ctx) {
  const allShots = listPngs(path.join(ctx.out, "shots"));
  const shots = allShots.slice(0, limitFor(ctx, allShots.length, 1));
  ctx.stats.vision = { screenshotsTotal: allShots.length, screenshotsJudged: shots.length };
  const watch = createFleetRunControl(ctx, "vision", { total: shots.length + 1, doneLabel: "items" });
  try {
    const session = await ctx.pagePool.acquire("vision");
    try {
      await watch.runItem("vision sanity boot", async () => {
        session.lastAction = "vision sanity boot";
        await afterAction(ctx, session, session.lastAction);
      });
    } finally {
      await session.release();
    }

    ctx.log(`vision fleet: ${shots.length}/${allShots.length} screenshots`);
    if (!watch.budgetExpired()) {
      for (const shot of shots) {
        const item = await watch.runItem(`vision ${path.basename(shot)}`, async () => {
          const result = await codexVision(shot, PROMPT, ctx.smoke ? 45000 : 90000);
          const at = coordsFromFilename(shot);
          if (!result) {
            ctx.ledger.push({
              fleet: "vision",
              kind: "vision-unavailable",
              severity: "low",
              at,
              detail: "codexVision returned no parseable JSON",
              evidence: shot
            });
            return;
          }
          if (result.defect) {
            ctx.ledger.push({
              fleet: "vision",
              kind: `vision-${result.class || "defect"}`,
              severity: "medium",
              at,
              detail: result.note || "vision defect",
              evidence: shot
            });
          }
        }, { evidence: shot });
        if (item.budgetExpired) break;
      }
    }
  } finally {
    watch.stop();
  }
}

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPngs(full));
    else if (entry.isFile() && entry.name.endsWith(".png")) out.push(full);
  }
  return out.sort();
}

function coordsFromFilename(file) {
  const match = path.basename(file).match(/-(-?\d+)-(-?\d+)(?:-\d+)?\.png$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}
