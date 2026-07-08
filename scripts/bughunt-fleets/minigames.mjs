import {
  afterAction,
  createFleetRunControl,
  drainDialogue,
  facePoint,
  limitFor,
  nearestWalkableAdjacent,
  readGenerated,
  tap,
  waitForWorld,
  warpTo
} from "./shared.mjs";

export async function run(ctx) {
  const checks = readGenerated(ctx, "drifella-source-checks.json").checks ?? [];
  const sampled = spreadByRegion(checks).slice(0, ctx.deep ? checks.length : limitFor(ctx, 12, 2));
  ctx.stats.minigames = { sourceChecksTotal: checks.length, sourceChecksAttempted: sampled.length, venueAttempted: 0 };
  ctx.log(`minigames fleet: ${sampled.length}/${checks.length} source checks`);
  const watch = createFleetRunControl(ctx, "minigames", { total: sampled.length + 1, doneLabel: "items" });
  const session = await ctx.pagePool.acquire("minigames", { params: { extras: "1" } });
  try {
    for (const check of sampled) {
      const result = await watch.runItem(`source-check ${check.id}`, async () => {
        const at = check.placement.worldPixel;
        session.lastAction = `source-check ${check.id}`;
        await warpTo(session.page, nearestWalkableAdjacent(ctx, at));
        await facePoint(session.page, at);
        await tap(session.page, "KeyZ", 350);
        const returned = await answerFirstOptionUntilWorld(session.page, ctx.smoke ? 12000 : 35000);
        if (!returned) {
          ctx.ledger.push({
            fleet: "minigames",
            kind: "source-check-stuck",
            severity: "blocker",
            at,
            detail: `${check.id} did not return to world after first-option trivia flow`,
            evidence: { checkId: check.id, npcId: check.npcId, region: check.region }
          });
        }
        await afterAction(ctx, session, session.lastAction);
      }, { at: check.placement.worldPixel, evidence: { check } });
      if (result.budgetExpired) break;
    }
    if (!watch.budgetExpired()) {
      await watch.runItem("venue arena bracket 1", () => venueArena(ctx, session), { count: true });
    }
  } finally {
    watch.stop();
    await session.release();
  }
}

function spreadByRegion(checks) {
  const byRegion = new Map();
  for (const check of checks) {
    const list = byRegion.get(check.region ?? "unknown") ?? [];
    list.push(check);
    byRegion.set(check.region ?? "unknown", list);
  }
  const out = [];
  let index = 0;
  while (out.length < checks.length) {
    let added = false;
    for (const list of byRegion.values()) {
      if (list[index]) {
        out.push(list[index]);
        added = true;
      }
    }
    if (!added) break;
    index += 1;
  }
  return out;
}

async function answerFirstOptionUntilWorld(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let sawSourceCheck = false;
  while (Date.now() < deadline) {
    const snap = await page.evaluate(() => ({
      source: globalThis.__sourceCheckDebug ?? null,
      world: globalThis.__firstSceneDebug?.mode === "world" && Boolean(globalThis.__firstSceneDebug?.player)
    })).catch(() => ({ source: null, world: false }));
    if (snap.source) sawSourceCheck = true;
    if (sawSourceCheck && snap.world && !snap.source) return true;
    await tap(page, "KeyZ", 220);
  }
  await waitForWorld(page, 1000).catch(() => {});
  return page.evaluate(() => Boolean(globalThis.__firstSceneDebug?.player)).catch(() => false);
}

async function venueArena(ctx, session) {
  const trigger = (readGenerated(ctx, "triggers.json").triggers ?? []).find((entry) => entry.id === "arena-venue-1");
  if (!trigger?.boss) return;
  ctx.stats.minigames.venueAttempted = 1;
  session.lastAction = "venue arena bracket 1";
  const params = new URLSearchParams({ nointro: "1", flags: "act2:registry_cleared", spawn: `${trigger.boss.x},${trigger.boss.y + 36}` });
  await session.page.goto(`${ctx.base}/?${params.toString()}`, { waitUntil: "load", timeout: 60000 });
  await waitForWorld(session.page, 30000);
  await drainDialogue(session.page, 12, 220);
  await warpTo(session.page, { x: trigger.boss.x, y: trigger.boss.y + 36 });
  await facePoint(session.page, trigger.boss);
  await tap(session.page, "KeyZ", 350);
  await drainDialogue(session.page, ctx.smoke ? 6 : 20, 250);
  await afterAction(ctx, session, session.lastAction);
}
