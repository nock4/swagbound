import { afterAction, drainDialogue, limitFor, readGenerated, state, tap, waitForWorld } from "./shared.mjs";

export async function run(ctx) {
  const triggers = readGenerated(ctx, "triggers.json").triggers ?? [];
  const act1Bosses = triggers
    .filter((trigger) => trigger.boss && trigger.battleGroup && ((trigger.setFlags ?? []).some((flag) => flag.startsWith("signal:")) || trigger.id.includes("act1")))
    .sort((a, b) => (a.requireFlags ?? []).length - (b.requireFlags ?? []).length);
  ctx.stats.story = { openingAttempted: ctx.smoke ? 0 : 1, gatesTotal: act1Bosses.length, gatesChecked: 0 };
  ctx.log(`story fleet: ${act1Bosses.length} act-chain gates`);

  if (!ctx.smoke) {
    await openingPath(ctx);
  }
  const gates = act1Bosses.slice(0, limitFor(ctx, act1Bosses.length, 3));
  for (const gate of gates) {
    await gateCheck(ctx, gate);
  }
}

async function openingPath(ctx) {
  const session = await ctx.pagePool.acquire("story", { nointro: false, waitForWorld: false, clearSave: true });
  try {
    session.lastAction = "title gate and opening";
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const hasWorld = await session.page.evaluate(() => Boolean(globalThis.__firstSceneDebug?.player)).catch(() => false);
      if (hasWorld) break;
      await tap(session.page, "KeyZ", 250);
      await tap(session.page, "Enter", 120);
      if (Date.now() % 7 === 0) await tap(session.page, "ArrowDown", 80);
    }
    await waitForWorld(session.page, 3000).catch(() => {});
    const snap = await state(session.page).catch(() => ({}));
    if (!snap.player) {
      ctx.ledger.push({
        fleet: "story",
        kind: "opening-flow-stuck",
        severity: "blocker",
        detail: "real title/naming/opening path did not reach controllable world within 90s"
      });
      return;
    }
    await drainDialogue(session.page, 30, 220);
    await afterAction(ctx, session, session.lastAction);
  } finally {
    await session.release();
  }
}

async function gateCheck(ctx, gate) {
  const flags = gate.requireFlags ?? [];
  const spawn = gate.boss ? `${gate.boss.x},${gate.boss.y + 48}` : undefined;
  const session = await ctx.pagePool.acquire("story", { flags, spawn });
  try {
    session.lastAction = `story gate ${gate.id}`;
    await drainDialogue(session.page, 20, 180);
    let gates = [];
    for (let i = 0; i < 20; i += 1) {
      gates = await session.page.evaluate(() => (globalThis.__bossGates?.gates ?? []).map((entry) => ({
        id: entry.triggerId,
        x: entry.x,
        y: entry.y,
        armed: entry.armed,
        visible: entry.visible
      }))).catch(() => []);
      if (gates.some((entry) => entry.id === gate.id)) break;
      await session.page.waitForTimeout(250);
    }
    ctx.stats.story.gatesChecked += 1;
    if (!gates.some((entry) => entry.id === gate.id)) {
      ctx.ledger.push({
        fleet: "story",
        kind: "story-beat-not-armed",
        severity: "blocker",
        at: gate.boss,
        detail: `${gate.id} did not appear in __bossGates with prerequisite flags [${flags.join(",")}]`,
        evidence: { expected: gate.id, flags, gates }
      });
    }
    await afterAction(ctx, session, session.lastAction);
  } finally {
    await session.release();
  }
}
