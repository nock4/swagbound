import fs from "node:fs";
import path from "node:path";
import { afterAction, codexVision, limitFor, state } from "./shared.mjs";

const PROMPT = `You are a confused first-time player of an EarthBound-style game. ONE line JSON {defect:bool, class:'', note:''}. Flag: garbled art, floating sprites, text problems, impossible geometry, anything that would confuse or look broken. Ignore: the hooded player, HUD text, dialogue boxes, intended darkness.`;

export async function run(ctx) {
  const session = await ctx.pagePool.acquire("vision");
  try {
    session.lastAction = "vision sanity boot";
    await afterAction(ctx, session, session.lastAction);
  } finally {
    await session.release();
  }

  const allShots = listPngs(path.join(ctx.out, "shots"));
  const shots = allShots.slice(0, limitFor(ctx, allShots.length, 1));
  ctx.stats.vision = { screenshotsTotal: allShots.length, screenshotsJudged: shots.length };
  ctx.log(`vision fleet: ${shots.length}/${allShots.length} screenshots`);
  for (const shot of shots) {
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
      continue;
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
