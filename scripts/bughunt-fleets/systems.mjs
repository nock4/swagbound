import { afterAction, createFleetRunControl, hold, state, tap, warpTo } from "./shared.mjs";

const TOWNS = [
  { id: "morningside", x: 1844, y: 1100 },
  { id: "postwick", x: 2324, y: 7428 },
  { id: "solana-beach", x: 5892, y: 2948 },
  { id: "the-galleria", x: 4676, y: 4996 },
  { id: "dead-letter", x: 6276, y: 9028 },
  { id: "scaraba", x: 1540, y: 4868 }
];

export async function run(ctx) {
  ctx.stats.systems = { flowsAttempted: 0, flowsPassed: 0 };
  ctx.log("systems fleet");
  const flowCount = ctx.smoke ? 5 : 6;
  const watch = createFleetRunControl(ctx, "systems", { total: flowCount, doneLabel: "flows" });
  const session = await ctx.pagePool.acquire("systems", { params: { party: "4", psi: "all" } });
  try {
    const flows = [
      () => menuFlow(ctx, session, watch),
      () => itemLikeFlow(ctx, session, watch),
      () => assistPsiAndTeleportFlow(ctx, session, watch),
      () => bikeFlow(ctx, session, watch),
      () => saveContinueFlow(ctx, session, watch),
      ...(!ctx.smoke ? [() => gameOverContinueFlow(ctx, session, watch)] : [])
    ];
    for (const flow of flows) {
      const result = await flow();
      if (result?.budgetExpired) break;
    }
  } finally {
    watch.stop();
    await session.release();
  }
}

async function recordFlow(ctx, session, watch, name, fn) {
  return watch.runItem(`systems ${name}`, async () => {
    ctx.stats.systems.flowsAttempted += 1;
    session.lastAction = `systems ${name}`;
    try {
      await fn();
      await afterAction(ctx, session, session.lastAction);
      ctx.stats.systems.flowsPassed += 1;
    } catch (error) {
      const snap = await state(session.page).catch(() => ({}));
      ctx.ledger.push({
        fleet: "systems",
        kind: "systems-flow-error",
        severity: "blocker",
        at: snap.player,
        detail: `${name} threw: ${String(error?.message || error).slice(0, 500)}`
      });
    }
  });
}

async function menuFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "menu-submenus", async () => {
    await tap(session.page, "KeyM", 250);
    for (const key of ["ArrowRight", "ArrowDown", "KeyZ", "KeyX", "ArrowDown", "KeyZ", "KeyX", "ArrowRight", "KeyZ", "KeyX", "KeyX"]) {
      await tap(session.page, key, 180);
    }
  });
}

async function itemLikeFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "representative-items", async () => {
    await tap(session.page, "KeyM", 220);
    for (const key of ["ArrowRight", "KeyZ", "ArrowDown", "KeyZ", "KeyX", "ArrowDown", "KeyZ", "KeyX", "KeyX"]) {
      await tap(session.page, key, 160);
    }
  });
}

async function assistPsiAndTeleportFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "assist-psi-teleport", async () => {
    const towns = ctx.smoke ? TOWNS.slice(0, 1) : TOWNS;
    for (const town of towns) {
      await warpTo(session.page, town);
      await session.page.waitForTimeout(500);
    }
    await tap(session.page, "KeyT", 300);
    await tap(session.page, "KeyZ", 300);
    await session.page.waitForTimeout(1200);
  });
}

async function bikeFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "bike-toggle", async () => {
    await tap(session.page, "KeyB", 250);
    await hold(session.page, "ArrowRight", 220);
    await tap(session.page, "KeyB", 250);
  });
}

async function saveContinueFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "save-reload-continue", async () => {
    const before = (await state(session.page)).player;
    await tap(session.page, "KeyP", 350);
    const saved = await session.page.evaluate(() => globalThis.__firstSceneDebug?.hasSave === true).catch(() => false);
    await session.page.reload({ waitUntil: "load" });
    await session.page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 30000 });
    await session.page.waitForTimeout(800);
    const after = (await state(session.page)).player;
    if (!saved || !before || !after || Math.hypot(before.x - after.x, before.y - after.y) > 32) {
      ctx.ledger.push({
        fleet: "systems",
        kind: "save-continue-failed",
        severity: "blocker",
        at: after ?? before,
        detail: "save then reload did not restore the previous player position",
        evidence: { saved, before, after }
      });
    }
  });
}

async function gameOverContinueFlow(ctx, session, watch) {
  return recordFlow(ctx, session, watch, "game-over-continue", async () => {
    await tap(session.page, "KeyP", 250);
    await session.page.evaluate(() => globalThis.__forceEncounter?.(449, "enemyFirstStrike"));
    await session.page.waitForTimeout(1200);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const mode = await session.page.evaluate(() => ({
        world: Boolean(globalThis.__firstSceneDebug?.player),
        battle: globalThis.__battleDebug?.phase ?? null
      })).catch(() => ({}));
      if (mode.world && !mode.battle) break;
      await tap(session.page, "KeyZ", 180);
    }
  });
}
