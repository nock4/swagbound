import type { BattleCommand } from "./battleLogic";
import { itemEffectTargetSide, type ItemUseEffect } from "./partyState";
import type { BattleCommandGridDirection } from "./cleanUi";

export type CommandEnemyTargetMode = "bash" | "spy" | "mirror";
type CureStatusAilment = Extract<ItemUseEffect, { kind: "cureStatus" }>["ailment"];
type ItemStat = Extract<ItemUseEffect, { kind: "buffStat" | "permStat" }>["stat"];

export type CommandTargetSelectionPlan =
  | { submenu: "target"; targetMode: CommandEnemyTargetMode }
  | { submenu: "command"; targetMode: CommandEnemyTargetMode | null };

export function enemyTargetModeForCommand(command: BattleCommand): CommandEnemyTargetMode | null {
  switch (command) {
    case "BASH":
      return "bash";
    case "SPY":
      return "spy";
    case "MIRROR":
      return "mirror";
    default:
      return null;
  }
}

export function commandTargetSelectionPlan(
  command: BattleCommand,
  livingEnemyCount: number
): CommandTargetSelectionPlan {
  const targetMode = enemyTargetModeForCommand(command);
  // Always require an explicit target pick for single-target enemy actions, even
  // in a 1-versus-1 fight (mirrors the ally/heal flow, which already does this).
  // Only skip when there is no living enemy to point at.
  if (targetMode && livingEnemyCount > 0) {
    return { submenu: "target", targetMode };
  }
  return { submenu: "command", targetMode };
}

export function shouldOpenEnemyTargetSelection(command: BattleCommand, livingEnemyCount: number): boolean {
  return commandTargetSelectionPlan(command, livingEnemyCount).submenu === "target";
}

export type BattleSubmenuGridOrder = "row-major" | "column-major";

export type BattleSubmenuGridVisibleCell = {
  index: number;
  row: number;
  col: number;
  visibleRow: number;
};

export type BattleSubmenuGridVisibleWindow = {
  rows: number;
  visibleStartRow: number;
  visibleRows: number;
  cells: BattleSubmenuGridVisibleCell[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
};

export function moveBattleSubmenuGridIndex(
  index: number,
  count: number,
  direction: BattleCommandGridDirection,
  columns: number,
  order: BattleSubmenuGridOrder = "row-major"
): number {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (normalizedCount <= 0) {
    return 0;
  }
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const current = submenuGridPosition(clampIndex(index, normalizedCount), normalizedCount, normalizedColumns, order);
  const rows = submenuGridRows(normalizedCount, normalizedColumns);
  const rowStep = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const colStep = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  for (let attempt = 1; attempt <= normalizedCount + normalizedColumns; attempt += 1) {
    const row = modulo(current.row + rowStep * attempt, rows);
    const col = modulo(current.col + colStep * attempt, normalizedColumns);
    const next = submenuGridIndex(row, col, normalizedCount, normalizedColumns, order);
    if (next >= 0 && next < normalizedCount) {
      return next;
    }
  }
  return clampIndex(index, normalizedCount);
}

export function battleSubmenuGridVisibleCells(options: {
  itemCount: number;
  selectedIndex: number;
  columns: number;
  maxRows: number;
  order?: BattleSubmenuGridOrder;
}): BattleSubmenuGridVisibleWindow {
  const itemCount = Math.max(0, Math.floor(options.itemCount));
  const columns = Math.max(1, Math.floor(options.columns));
  const rows = submenuGridRows(itemCount, columns);
  const selected = clampIndex(options.selectedIndex, itemCount);
  const selectedRow = submenuGridPosition(selected, itemCount, columns, options.order ?? "row-major").row;
  const maxRows = Math.max(1, Math.floor(options.maxRows));
  const visibleRows = Math.max(1, Math.min(rows, maxRows));
  const visibleStartRow = visibleItemStart(selectedRow, rows, visibleRows);
  const cells: BattleSubmenuGridVisibleCell[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const position = submenuGridPosition(index, itemCount, columns, options.order ?? "row-major");
    if (position.row < visibleStartRow || position.row >= visibleStartRow + visibleRows) {
      continue;
    }
    cells.push({
      index,
      row: position.row,
      col: position.col,
      visibleRow: position.row - visibleStartRow
    });
  }
  return {
    rows,
    visibleStartRow,
    visibleRows,
    cells,
    hasMoreBefore: visibleStartRow > 0,
    hasMoreAfter: visibleStartRow + visibleRows < rows
  };
}

export function battleItemEffectDescription(effect: ItemUseEffect | undefined): string {
  if (!effect) {
    return "No battle effect";
  }
  switch (effect.kind) {
    case "healHp":
      return `Restores ${effect.amount} HP`;
    case "healHpPercent":
      return `Restores ${effect.percent}% HP`;
    case "recoverPp":
      return `Restores ${effect.amount} PP`;
    case "recoverPpPercent":
      return `Restores ${effect.percent}% PP`;
    case "damage":
      return `Hits one enemy for ${effect.amount} damage`;
    case "drainPp":
      return `Drains ${effect.amount} PP from one enemy`;
    case "buffStat":
      return battleStatBuffDescription(effect);
    case "permStat":
      return `Permanently ${effect.amount < 0 ? "lowers" : "raises"} ${statLabel(effect.stat)} by ${Math.abs(effect.amount)}`;
    case "revive":
      return `Revives one friend with ${effect.amount} HP`;
    case "cureStatus":
      return cureStatusDescription(effect.ailment);
    case "inflictStatus":
      return inflictStatusDescription(effect);
  }
}

function battleStatBuffDescription(effect: Extract<ItemUseEffect, { kind: "buffStat" }>): string {
  const target = itemEffectTargetSide(effect) === "enemy" ? "one enemy" : "one friend";
  const stat = statLabel(effect.stat);
  const amount = effect.amount ?? 0;
  const multiplier = effect.multiplier ?? 1;
  if (amount < 0 || multiplier < 1) {
    return `Lowers ${target}'s ${stat}${amount < 0 ? ` by ${Math.abs(amount)}` : ""}`;
  }
  if (multiplier !== 1 && amount === 0) {
    return multiplier === 2
      ? `Doubles ${target}'s ${stat}`
      : `Multiplies ${target}'s ${stat} by ${formatMultiplier(multiplier)}`;
  }
  return `Raises ${target}'s ${stat}${amount > 0 ? ` by ${amount}` : ""}`;
}

function cureStatusDescription(ailment: CureStatusAilment): string {
  switch (ailment) {
    case "all":
      return "Cures all ailments";
    case "poisoned":
      return "Cures poison";
    case "paralyzed":
      return "Cures paralysis";
    case "asleep":
      return "Wakes one friend";
    case "confused":
      return "Cures confusion";
    case "shielded":
      return "Removes shield";
    case "sunstroke":
      return "Cures sunstroke";
  }
}

function inflictStatusDescription(effect: Extract<ItemUseEffect, { kind: "inflictStatus" }>): string {
  const turns = effect.remaining !== undefined ? ` for ${effect.remaining} turns` : "";
  switch (effect.ailment) {
    case "shielded":
      return `Shields one friend${turns}`;
    case "poisoned":
      return `Poisons one enemy${turns}`;
    case "paralyzed":
      return `Paralyzes one enemy${turns}`;
    case "asleep":
      return `Puts one enemy to sleep${turns}`;
    case "confused":
      return `Confuses one enemy${turns}`;
    case "sunstroke":
      return `Inflicts sunstroke on one enemy${turns}`;
  }
}

function statLabel(stat: ItemStat): string {
  return stat === "iq" ? "IQ" : stat;
}

function formatMultiplier(multiplier: number): string {
  return Number.isInteger(multiplier) ? `${multiplier}x` : `${Number(multiplier.toFixed(2))}x`;
}

function submenuGridRows(count: number, columns: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count) / Math.max(1, columns)));
}

function submenuGridPosition(
  index: number,
  count: number,
  columns: number,
  order: BattleSubmenuGridOrder
): { row: number; col: number } {
  const normalizedIndex = clampIndex(index, count);
  if (order === "column-major") {
    const rows = submenuGridRows(count, columns);
    return {
      row: normalizedIndex % rows,
      col: Math.floor(normalizedIndex / rows)
    };
  }
  return {
    row: Math.floor(normalizedIndex / columns),
    col: normalizedIndex % columns
  };
}

function submenuGridIndex(
  row: number,
  col: number,
  count: number,
  columns: number,
  order: BattleSubmenuGridOrder
): number {
  const rows = submenuGridRows(count, columns);
  const normalizedRow = modulo(row, rows);
  const normalizedCol = modulo(col, columns);
  return order === "column-major"
    ? normalizedCol * rows + normalizedRow
    : normalizedRow * columns + normalizedCol;
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(Math.floor(index), Math.max(0, count - 1)));
}

function visibleItemStart(cursorIndex: number, itemCount: number, maxItems: number): number {
  if (maxItems <= 0 || itemCount <= maxItems) {
    return 0;
  }
  return Math.min(Math.max(0, cursorIndex - maxItems + 1), itemCount - maxItems);
}

function modulo(value: number, size: number): number {
  const normalizedSize = Math.max(1, size);
  return ((value % normalizedSize) + normalizedSize) % normalizedSize;
}
