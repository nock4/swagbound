import type { BattleData, BattleEnemy, BattleGroup } from "@eb/schemas";

export function battleGroupEnemyEntries(group: BattleGroup): Array<{ id: number; amount: number }> {
  return group.entries && group.entries.length > 0
    ? group.entries.map((entry) => ({ id: entry.id, amount: entry.amount }))
    : group.enemyIds.map((id) => ({ id, amount: 1 }));
}

export function expandBattleGroupEnemies(data: BattleData, group: BattleGroup): BattleEnemy[] {
  const enemiesById = new Map(data.enemies.map((enemy) => [enemy.id, enemy]));
  return battleGroupEnemyEntries(group).flatMap((entry) => {
    const enemy = enemiesById.get(entry.id);
    return enemy ? Array.from({ length: entry.amount }, () => enemy) : [];
  });
}
