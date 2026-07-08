import {
  afterAction,
  createFleetRunControl,
  drainDialogue,
  facePoint,
  limitFor,
  nearestWalkableAdjacent,
  readGenerated,
  tap,
  warpTo
} from "./shared.mjs";

export async function run(ctx) {
  const added = readGenerated(ctx, "added-npcs.json");
  const checks = readGenerated(ctx, "drifella-source-checks.json");
  const worldTargets = (ctx.world.npcs ?? [])
    .filter((npc) => npc.visible !== false && npc.worldPixel)
    .map((npc) => ({
      id: `npc:${npc.npcId}`,
      source: "world",
      at: npc.worldPixel,
      kind: npc.type ?? "npc",
      textPointer: npc.textPointer
    }));
  const addedTargets = (added.npcs ?? [])
    .filter((npc) => npc.worldPixel)
    .map((npc) => ({
      id: `added:${npc.id}`,
      source: "added",
      at: npc.worldPixel,
      kind: "added-npc"
    }));
  const sourceTargets = (checks.checks ?? [])
    .filter((check) => check.placement?.worldPixel)
    .map((check) => ({
      id: check.id,
      npcId: check.npcId,
      source: "source-check",
      at: check.placement.worldPixel,
      kind: "source-check"
    }));
  const allTargets = [...worldTargets, ...addedTargets, ...sourceTargets];
  const targets = allTargets.slice(0, limitFor(ctx, allTargets.length, 5));
  ctx.stats.talk = { total: allTargets.length, attempted: targets.length, dialogueOpened: 0 };
  ctx.log(`talk fleet: ${targets.length}/${allTargets.length} targets`);

  const watch = createFleetRunControl(ctx, "talk", { total: targets.length, doneLabel: "targets" });
  const session = await ctx.pagePool.acquire("talk", { params: { extras: "1" } });
  try {
    for (const target of targets) {
      const result = await watch.runItem(`talk ${target.id}`, async () => {
        session.lastAction = `talk ${target.id}`;
        const stand = nearestWalkableAdjacent(ctx, target.at);
        await warpTo(session.page, stand);
        await facePoint(session.page, target.at);
        const visibleSprite = await visibleSpriteAt(session.page, target.at, target.npcId);
        await tap(session.page, "KeyZ", 240);
        await session.page.waitForTimeout(450);
        const opened = await session.page.evaluate(() => Boolean(globalThis.__firstSceneDebug?.dialogueOpen));
        if (opened) {
          ctx.stats.talk.dialogueOpened += 1;
          const text = await captureDialogueText(session.page);
          if (!visibleSprite) {
            ctx.ledger.push({
              fleet: "talk",
              kind: "invisible-speaker",
              severity: "medium",
              at: target.at,
              detail: `${target.id} opened dialogue but no visible debug NPC sprite was found at target coords`,
              evidence: { target, text }
            });
          }
          if (looksEmptyOrGarbage(text)) {
            ctx.ledger.push({
              fleet: "talk",
              kind: "bad-dialogue-text",
              severity: "high",
              at: target.at,
              detail: `${target.id} opened empty or garbage dialogue text`,
              evidence: { target, text }
            });
          }
          await drainDialogue(session.page, 20, 400);
        }
        await afterAction(ctx, session, session.lastAction);
      }, { at: target.at, evidence: { target } });
      if (result.budgetExpired) break;
    }
  } finally {
    watch.stop();
    await session.release();
  }
}

async function captureDialogueText(page) {
  return page.evaluate(() => {
    const debug = globalThis.__firstSceneDebug ?? {};
    return String(debug.dialogueText || debug.revealedText || "").slice(0, 1000);
  });
}

async function visibleSpriteAt(page, target, npcId) {
  return page.evaluate(({ target, npcId }) => {
    const npcs = globalThis.__firstSceneDebug?.npcs ?? [];
    return npcs.some((npc) => {
      const idMatches = npcId === undefined || String(npc.id) === String(npcId);
      return npc.visible && idMatches && Math.hypot(npc.x - target.x, npc.y - target.y) <= 28;
    });
  }, { target, npcId });
}

function looksEmptyOrGarbage(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length === 0) return true;
  if (/[\uFFFD]/.test(trimmed)) return true;
  const printable = trimmed.replace(/[\s\n\r\t]/g, "");
  if (printable.length > 3 && /[{}[\]\\]{4,}/.test(printable)) return true;
  return false;
}
