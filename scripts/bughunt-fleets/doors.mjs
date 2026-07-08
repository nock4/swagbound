import { afterAction, directionToward, dist, hold, limitFor, pointValid, state, warpTo } from "./shared.mjs";

export async function run(ctx) {
  const allDoors = (ctx.world.doors ?? []).filter((door) => pointValid(door.worldPixel));
  const doors = allDoors.slice(0, limitFor(ctx, allDoors.length, 5));
  ctx.stats.doors = { total: allDoors.length, attempted: doors.length, passed: 0, expectedNoWarp: 0 };
  ctx.log(`doors fleet: ${doors.length}/${allDoors.length} doors`);

  const session = await ctx.pagePool.acquire("doors");
  try {
    for (const door of doors) {
      const from = door.worldPixel;
      session.lastAction = `door ${from.x},${from.y}`;
      await warpTo(session.page, { x: from.x, y: from.y + 20 });
      const surface = await session.page.evaluate(({ x, y }) => {
        const fn = globalThis.__surfaceAt;
        return typeof fn === "function" ? fn(x, y) : 0;
      }, from).catch(() => 0);
      const expectedNoWarp = (surface & 0x10) !== 0;
      const before = (await state(session.page)).player;
      for (let i = 0; i < 5; i += 1) await hold(session.page, "ArrowUp", 130);
      await session.page.waitForTimeout(700);
      const landed = (await state(session.page)).player;
      const warped = before && landed && dist(before, landed) > 120;
      if (!warped) {
        if (expectedNoWarp) {
          ctx.stats.doors.expectedNoWarp += 1;
        } else {
          ctx.ledger.push({
            fleet: "doors",
            kind: "door-no-entry",
            severity: "high",
            at: from,
            detail: `walking into door did not produce a >120px jump`,
            evidence: { door, before, landed, surface }
          });
        }
        await afterAction(ctx, session, session.lastAction);
        continue;
      }
      const returnDoor = nearestReturnDoor(allDoors, landed);
      if (!returnDoor) {
        ctx.ledger.push({
          fleet: "doors",
          kind: "door-no-return",
          severity: "high",
          at: landed,
          detail: `landing had no return door within 64px`,
          evidence: { door, landed }
        });
        await afterAction(ctx, session, session.lastAction);
        continue;
      }
      const returnStart = (await state(session.page)).player;
      const approach = directionToward(returnStart, returnDoor.worldPixel);
      for (let i = 0; i < 5; i += 1) await hold(session.page, approach, 130);
      await session.page.waitForTimeout(700);
      const back = (await state(session.page)).player;
      if (!returnStart || !back || dist(returnStart, back) <= 120) {
        ctx.ledger.push({
          fleet: "doors",
          kind: "door-return-failed",
          severity: "high",
          at: returnDoor.worldPixel,
          detail: `nearest return door did not warp back`,
          evidence: { door, returnDoor, returnStart, back }
        });
      } else {
        ctx.stats.doors.passed += 1;
      }
      await afterAction(ctx, session, session.lastAction);
    }
  } finally {
    await session.release();
  }
}

function nearestReturnDoor(doors, point) {
  return doors
    .filter((candidate) => candidate.worldPixel && dist(candidate.worldPixel, point) <= 64)
    .sort((a, b) => dist(a.worldPixel, point) - dist(b.worldPixel, point))[0];
}
