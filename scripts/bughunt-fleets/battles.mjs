import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { afterAction, createFleetRunControl, limitFor, readGenerated, state } from "./shared.mjs";

export async function run(ctx) {
  const battleData = readGenerated(ctx, "battle.json");
  const characters = readGenerated(ctx, "characters.json");
  const groups = battleData.groups ?? [];
  const offlineGroups = groups.slice(0, limitFor(ctx, groups.length, 8));
  ctx.stats.battles = { groupsTotal: groups.length, groupsSimulated: 0, browserSampled: 0 };
  ctx.log(`battles fleet: offline ${offlineGroups.length}/${groups.length} groups`);
  const browserGroups = uniqueSkinGroups(battleData).slice(0, limitFor(ctx, 60, 2));
  const watch = createFleetRunControl(ctx, "battles", {
    total: offlineGroups.length + browserGroups.length,
    doneLabel: "groups"
  });
  try {
    await simulateGroups(ctx, battleData, characters, offlineGroups, watch);

    if (!watch.budgetExpired()) {
      ctx.log(`battles fleet: browser ${browserGroups.length} unique skin samples`);
      const session = await ctx.pagePool.acquire("battles", { params: { party: "4", psi: "all" } });
      try {
        for (const group of browserGroups) {
          const item = await watch.runItem(`browser group ${group.id}`, async () => {
            session.lastAction = `force encounter group ${group.id}`;
            await session.page.evaluate((id) => globalThis.__forceEncounter?.(id), group.id);
            await session.page.waitForTimeout(1800);
            await waitForBattle(session.page, 8000);
            const battleStart = path.join(ctx.out, "shots", "battles", `battle-${group.id}-${Date.now()}.png`);
            fs.mkdirSync(path.dirname(battleStart), { recursive: true });
            await session.page.screenshot({ path: battleStart }).catch(() => {});
            const returned = await mashBattleToWorld(ctx, session, group.id);
            ctx.stats.battles.browserSampled += 1;
            if (!returned) {
              ctx.ledger.push({
                fleet: "battles",
                kind: "battle-softlock",
                severity: "blocker",
                at: (await state(session.page)).player,
                detail: `forced encounter group ${group.id} did not return to world within budget`,
                evidence: { screenshot: battleStart, group }
              });
            } else {
              await afterAction(ctx, session, session.lastAction);
            }
          }, { evidence: { group } });
          if (item.budgetExpired) break;
        }
      } finally {
        await session.release();
      }
    }
  } finally {
    watch.stop();
  }
}

async function simulateGroups(ctx, battleData, characters, groups, watch) {
  const [{ createBattleState, createBattleRng, outcome }, { resolveRoundStep }, { expandBattleGroupEnemies }] = await Promise.all([
    tsImport(pathToFileURL(path.join(ctx.root, "apps/game/src/battleLogic.ts")).href, import.meta.url),
    tsImport(pathToFileURL(path.join(ctx.root, "apps/game/src/battleRound.ts")).href, import.meta.url),
    tsImport(pathToFileURL(path.join(ctx.root, "apps/game/src/battleGroups.ts")).href, import.meta.url)
  ]);
  for (const group of groups) {
    const item = await watch.runItem(`offline group ${group.id}`, async () => {
      try {
        const enemies = expandBattleGroupEnemies(battleData, group);
        if (enemies.length === 0) {
          ctx.ledger.push({
            fleet: "battles",
            kind: "battle-sim-error",
            severity: "high",
            detail: `group ${group.id} expanded to zero enemies`,
            evidence: { group }
          });
          return;
        }
        let battle = createBattleState(enemies, { characters });
        const rng = createBattleRng(group.id);
        let result = outcome(battle);
        for (let round = 0; round < 200 && result === "ongoing"; round += 1) {
          for (let i = 0; i < battle.party.length && result === "ongoing"; i += 1) {
            if (!alive(battle.party[i])) continue;
            const targetIndex = firstAliveIndex(battle.enemies);
            battle = resolveRoundStep(battle, { side: "party", index: i }, {
              partySlot: i,
              command: "AUTO",
              target: { side: "enemy", index: Math.max(0, targetIndex) }
            }, rng, {}).state;
            result = outcome(battle);
          }
          for (let i = 0; i < battle.enemies.length && result === "ongoing"; i += 1) {
            if (!alive(battle.enemies[i])) continue;
            battle = resolveRoundStep(battle, { side: "enemy", index: i }, undefined, rng, {}).state;
            result = outcome(battle);
          }
        }
        ctx.stats.battles.groupsSimulated += 1;
        if (result === "ongoing") {
          ctx.ledger.push({
            fleet: "battles",
            kind: "battle-sim-hang",
            severity: "blocker",
            detail: `group ${group.id} did not terminate within 200 rounds`,
            evidence: { groupId: group.id, enemies: group.enemyIds }
          });
        }
      } catch (error) {
        ctx.ledger.push({
          fleet: "battles",
          kind: "battle-sim-error",
          severity: "blocker",
          detail: `group ${group.id} threw during simulation: ${String(error?.message || error).slice(0, 600)}`,
          evidence: { group }
        });
      }
    }, { evidence: { group } });
    if (item.budgetExpired) break;
  }
}

function alive(combatant) {
  return (combatant?.hp?.target ?? combatant?.hpTarget ?? 0) > 0;
}

function firstAliveIndex(combatants) {
  return combatants.findIndex(alive);
}

function uniqueSkinGroups(battleData) {
  const enemyById = new Map((battleData.enemies ?? []).map((enemy) => [enemy.id, enemy]));
  const seen = new Set();
  const out = [];
  for (const group of battleData.groups ?? []) {
    const skin = (group.enemyIds ?? [])
      .map((id) => enemyById.get(id)?.spriteId ?? id)
      .sort((a, b) => a - b)
      .join(",");
    if (!skin || seen.has(skin)) continue;
    seen.add(skin);
    out.push(group);
  }
  return out;
}

async function waitForBattle(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inBattle = await page.evaluate(() => Boolean(globalThis.__battleDebug?.phase)).catch(() => false);
    if (inBattle) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function mashBattleToWorld(ctx, session, groupId) {
  const deadline = Date.now() + (ctx.smoke ? 12000 : 90000);
  while (Date.now() < deadline) {
    const snap = await state(session.page);
    if (snap.world?.mode === "world" && !activeBattlePhase(snap.battle)) return true;
    if (snap.battle?.phase === "command-input") {
      await session.page.keyboard.press("KeyZ");
      await session.page.waitForTimeout(120);
      await session.page.keyboard.press("KeyZ");
    } else {
      await session.page.keyboard.press("KeyZ");
    }
    await session.page.waitForTimeout(180);
  }
  ctx.log(`battle ${groupId} timed out in browser sample`);
  return false;
}

function activeBattlePhase(battle) {
  return battle && ["enter-transition", "command-input", "execution", "victory-summary", "defeat"].includes(battle.phase);
}
