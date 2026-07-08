import {
  afterAction,
  cellCenter,
  createFleetRunControl,
  decodeCellsByComponent,
  directionToward,
  dist,
  hold,
  limitFor,
  runWithTimeout,
  screenshot,
  state,
  warpTo
} from "./shared.mjs";

const COMPONENT_STALL_MS = 120000;

export async function run(ctx) {
  const requestedMax = Number.parseInt(process.env.TILES_MAX_CELLS ?? "", 10);
  const fullMax = Number.isFinite(requestedMax) && requestedMax > 0 ? requestedMax : Infinity;
  const maxCells = limitFor(ctx, fullMax, Math.min(fullMax, 24));
  const decoded = decodeCellsByComponent(ctx.navmeshJson, maxCells);
  const components = [...decoded.byComponent.entries()].sort((a, b) => a[0] - b[0]);
  const totalWalkable = Object.values(ctx.navmeshJson.components ?? {}).reduce((sum, comp) => sum + (comp.cells ?? 0), 0);
  ctx.stats.tiles = { totalWalkableCells: totalWalkable || undefined, attemptedCells: decoded.total, walkedCells: 0 };
  ctx.log(`tiles fleet: ${decoded.total}${Number.isFinite(maxCells) ? `/${totalWalkable || "?"}` : ""} cells across ${components.length} components`);

  const firstCell = components[0]?.[1]?.[0];
  const watch = createFleetRunControl(ctx, "tiles", {
    total: decoded.total,
    doneLabel: "cells",
    currentLabel: "component"
  });
  let session = await acquireTilesSession(ctx, firstCell);
  try {
    let currentCell;
    let stepCount = 0;
    for (const [componentId, rawCells] of components) {
      if (watch.budgetExpired()) {
        watch.reportBudget(`before component ${componentId}`);
        break;
      }
      watch.update({ current: componentId, done: ctx.stats.tiles.walkedCells });
      const cells = serpentine(rawCells);
      try {
        let componentStalled = false;
        for (const cell of cells) {
          if (watch.budgetExpired()) {
            watch.reportBudget(`during component ${componentId}`);
            break;
          }
          const activeSession = session;
          try {
            await runWithTimeout(async () => {
              const result = await walkCell(ctx, activeSession, componentId, cell, currentCell, stepCount);
              currentCell = result.currentCell;
              stepCount = result.stepCount;
            }, COMPONENT_STALL_MS, `component ${componentId} made no cell progress for ${COMPONENT_STALL_MS}ms`);
            watch.update({ current: componentId, done: ctx.stats.tiles.walkedCells });
          } catch (error) {
            if (error.name === "BughuntTimeoutError") {
              const target = cellCenter(ctx, cell);
              ctx.ledger.push({
                fleet: "tiles",
                kind: "tiles-component-stalled",
                severity: "blocker",
                at: target,
                detail: `component ${componentId} made no cell progress for ${COMPONENT_STALL_MS}ms; skipping remaining ${cells.length} cells in component`,
                evidence: { componentId, cell, walkedCells: ctx.stats.tiles.walkedCells }
              });
              componentStalled = true;
              await session.release().catch(() => {});
              session = undefined;
              session = await acquireTilesSession(ctx, nextComponentFirstCell(components, componentId));
              currentCell = undefined;
              break;
            }
            throw error;
          }
        }
        if (componentStalled) continue;
      } catch (error) {
        ctx.ledger.push({
          fleet: "tiles",
          kind: "tiles-component-error",
          severity: "blocker",
          detail: `component ${componentId} threw: ${String(error?.stack || error?.message || error).slice(0, 1500)}`,
          evidence: { componentId }
        });
        await session?.release().catch(() => {});
        session = undefined;
        session = await acquireTilesSession(ctx, nextComponentFirstCell(components, componentId));
        currentCell = undefined;
      }
    }
    if (stepCount < 400) {
      const current = session ? (await state(session.page)).player : undefined;
      if (current && session) await screenshot(ctx, session.page, "tiles", "smoke-final", current);
    }
    if (session) await afterAction(ctx, session, "tiles final probe");
  } finally {
    watch.stop();
    await session?.release();
  }
}

async function acquireTilesSession(ctx, cell) {
  return ctx.pagePool.acquire("tiles", cell ? { spawn: `${cellCenter(ctx, cell).x},${cellCenter(ctx, cell).y}` } : {});
}

async function walkCell(ctx, session, componentId, cell, currentCell, stepCount) {
  session.lastAction = `walk component ${componentId} cell ${cell.x},${cell.y}`;
  const target = cellCenter(ctx, cell);
  if (!currentCell || manhattan(currentCell, cell) !== 1) {
    await warpTo(session.page, target);
    ctx.stats.tiles.walkedCells += 1;
    return { currentCell: cell, stepCount };
  }
  const before = (await state(session.page)).player;
  await hold(session.page, directionToward(before ?? cellCenter(ctx, currentCell), target), 150);
  const after = (await state(session.page)).player;
  if (!before || !after || dist(before, after) < 2) {
    ctx.ledger.push({
      fleet: "tiles",
      kind: "stuck-cell",
      severity: "blocker",
      at: target,
      detail: `movement did not advance into navmesh cell ${cell.x},${cell.y} in component ${componentId}`,
      evidence: { before, after, componentId, cell }
    });
    await warpTo(session.page, target);
  }
  ctx.stats.tiles.walkedCells += 1;
  const nextStepCount = stepCount + 1;
  if (nextStepCount % 200 === 0) {
    await afterAction(ctx, session, session.lastAction);
  }
  if (nextStepCount % 400 === 0) {
    await screenshot(ctx, session.page, "tiles", `step-${nextStepCount}`, target);
  }
  return { currentCell: cell, stepCount: nextStepCount };
}

function nextComponentFirstCell(components, componentId) {
  const index = components.findIndex(([id]) => id === componentId);
  return components[index + 1]?.[1]?.[0];
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function serpentine(cells) {
  const rows = new Map();
  for (const cell of cells) {
    const row = rows.get(cell.y) ?? [];
    row.push(cell);
    rows.set(cell.y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([y, row]) => row.sort((a, b) => (y % 2 === 0 ? a.x - b.x : b.x - a.x)));
}
