import {
  afterAction,
  cellCenter,
  decodeCellsByComponent,
  directionToward,
  dist,
  hold,
  limitFor,
  screenshot,
  state,
  warpTo
} from "./shared.mjs";

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
  const session = await ctx.pagePool.acquire("tiles", firstCell ? { spawn: `${cellCenter(ctx, firstCell).x},${cellCenter(ctx, firstCell).y}` } : {});
  try {
    let currentCell;
    let stepCount = 0;
    for (const [componentId, rawCells] of components) {
      const cells = serpentine(rawCells);
      for (const cell of cells) {
        session.lastAction = `walk component ${componentId} cell ${cell.x},${cell.y}`;
        const target = cellCenter(ctx, cell);
        if (!currentCell || manhattan(currentCell, cell) !== 1) {
          await warpTo(session.page, target);
          currentCell = cell;
          ctx.stats.tiles.walkedCells += 1;
          continue;
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
        currentCell = cell;
        ctx.stats.tiles.walkedCells += 1;
        stepCount += 1;
        if (stepCount % 200 === 0) {
          await afterAction(ctx, session, session.lastAction);
        }
        if (stepCount % 400 === 0) {
          await screenshot(ctx, session.page, "tiles", `step-${stepCount}`, target);
        }
      }
    }
    if (stepCount < 400) {
      const current = (await state(session.page)).player;
      if (current) await screenshot(ctx, session.page, "tiles", "smoke-final", current);
    }
    await afterAction(ctx, session, "tiles final probe");
  } finally {
    await session.release();
  }
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
