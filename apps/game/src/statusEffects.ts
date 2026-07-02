/**
 * Battle status-effect model (Swagbound). Pure + battle-scoped: statuses live on a
 * combatant only for the duration of a fight (battles aren't saved mid-encounter),
 * so nothing here is serialized. Names are original Swagbound terms (no EarthBound
 * strings). This is the foundation the resolver wiring + authored item/PSI effects
 * sit on; values are authored (hybrid decision: faithful heals, authored status).
 *
 * Design mirrors the other pure battle models (rollingMeter, battleEffects): no rng,
 * no Phaser, no time — callers pass rng rolls and apply results. Fully unit-tested.
 */

/** The authored Swagbound battle ailments. */
export type StatusAilment =
  | "poisoned" // loses a slice of HP at the end of each of its turns
  | "paralyzed" // cannot act
  | "asleep" // cannot act; may wake each turn
  | "confused" // offense may strike a random side
  | "shielded"; // incoming damage reduced (a buff, not an ailment)

export const STATUS_AILMENTS: readonly StatusAilment[] = [
  "poisoned",
  "paralyzed",
  "asleep",
  "confused",
  "shielded"
];

export const BATTLE_SCOPED_STATUS_AILMENTS = ["asleep", "confused", "shielded"] as const satisfies readonly StatusAilment[];

export type StatusInstance = {
  ailment: StatusAilment;
  /** Remaining turns; undefined = until cured / battle end. Decremented by tickStatuses. */
  remaining?: number;
  /** Effect strength (poison HP fraction numerator, shield reduction percent, ...). */
  magnitude?: number;
};

export type StatusState = StatusInstance[];

/** Default poison loss = maxHp / POISON_HP_DIVISOR per tick (authored). */
export const POISON_HP_DIVISOR = 16;
export const FIELD_POISON_MIN_HP = 1;
/** Default shield damage reduction percent (authored). */
export const DEFAULT_SHIELD_PERCENT = 50;
/** Default chance (0..1) an asleep combatant wakes at the start of its turn (authored). */
export const SLEEP_WAKE_CHANCE = 0.34;

const STATUS_AILMENT_LABELS = {
  poisoned: "Poison",
  paralyzed: "Paralysis",
  asleep: "Sleep",
  confused: "Confusion",
  shielded: "Shield"
} as const satisfies Record<StatusAilment, string>;

const STATUS_AILMENT_BADGES = {
  poisoned: "PSN",
  paralyzed: "PAR",
  asleep: "SLP",
  confused: "CNF",
  shielded: "SHD"
} as const satisfies Record<StatusAilment, string>;

export function hasStatus(state: StatusState | undefined, ailment: StatusAilment): boolean {
  return Boolean(state?.some((entry) => entry.ailment === ailment));
}

export function isBattleScopedStatus(ailment: StatusAilment): boolean {
  return (BATTLE_SCOPED_STATUS_AILMENTS as readonly StatusAilment[]).includes(ailment);
}

export function stripBattleScopedStatuses(state: StatusState | undefined): StatusState {
  return (state ?? []).filter((entry) => !isBattleScopedStatus(entry.ailment));
}

export function statusAilmentLabel(ailment: StatusAilment): string {
  return STATUS_AILMENT_LABELS[ailment];
}

export function statusAilmentBadge(ailment: StatusAilment): string {
  return STATUS_AILMENT_BADGES[ailment];
}

export function formatStatusAilments(state: StatusState | undefined): string {
  const labels = (state ?? []).map((entry) => statusAilmentLabel(entry.ailment));
  return labels.length > 0 ? labels.join(", ") : "OK";
}

export function poisonDamagePerTick(state: StatusState | undefined, maxHp: number): number {
  const poison = state?.find((entry) => entry.ailment === "poisoned");
  if (!poison) {
    return 0;
  }
  const denom = poison.magnitude && poison.magnitude > 0 ? poison.magnitude : POISON_HP_DIVISOR;
  return Math.max(1, Math.floor(Math.max(0, maxHp) / denom));
}

export function fieldPoisonTick(
  state: StatusState | undefined,
  currentHp: number,
  maxHp: number
): { hpLoss: number; nextHp: number } {
  const current = Math.max(0, Math.floor(Number.isFinite(currentHp) ? currentHp : 0));
  if (current <= FIELD_POISON_MIN_HP) {
    return { hpLoss: 0, nextHp: current };
  }
  const damage = poisonDamagePerTick(state, maxHp);
  if (damage <= 0) {
    return { hpLoss: 0, nextHp: current };
  }
  const nextHp = Math.max(FIELD_POISON_MIN_HP, current - damage);
  return { hpLoss: current - nextHp, nextHp };
}

/** Add (or refresh) a status. Re-inflicting refreshes remaining/magnitude rather than stacking. */
export function inflictStatus(
  state: StatusState | undefined,
  ailment: StatusAilment,
  options: { remaining?: number; magnitude?: number } = {}
): StatusState {
  const next: StatusInstance = { ailment };
  if (options.remaining !== undefined) next.remaining = Math.max(1, Math.floor(options.remaining));
  if (options.magnitude !== undefined) next.magnitude = options.magnitude;
  const existing = state ?? [];
  const without = existing.filter((entry) => entry.ailment !== ailment);
  return [...without, next];
}

/** Remove a specific ailment, or all ailments with "all". Returns a new array. */
export function cureStatus(state: StatusState | undefined, ailment: StatusAilment | "all"): StatusState {
  if (!state || state.length === 0) {
    return [];
  }
  return ailment === "all" ? [] : state.filter((entry) => entry.ailment !== ailment);
}

/**
 * Whether a combatant may act this turn. asleep can wake first (caller passes an rng
 * roll in [0,1)); waking clears the status and still skips the turn (EB-faithful feel).
 */
export function resolveTurnGate(
  state: StatusState | undefined,
  wakeRoll: number
): { canAct: boolean; statuses: StatusState; reason?: "paralyzed" | "asleep" | "woke" } {
  const statuses = state ?? [];
  if (hasStatus(statuses, "paralyzed")) {
    return { canAct: false, statuses, reason: "paralyzed" };
  }
  if (hasStatus(statuses, "asleep")) {
    if (wakeRoll < SLEEP_WAKE_CHANCE) {
      return { canAct: false, statuses: cureStatus(statuses, "asleep"), reason: "woke" };
    }
    return { canAct: false, statuses, reason: "asleep" };
  }
  return { canAct: true, statuses };
}

/** Incoming-damage multiplier (0..1) from defensive statuses (shielded). */
export function incomingDamageScale(state: StatusState | undefined): number {
  const shield = state?.find((entry) => entry.ailment === "shielded");
  if (!shield) {
    return 1;
  }
  const percent = Math.min(100, Math.max(0, shield.magnitude ?? DEFAULT_SHIELD_PERCENT));
  return 1 - percent / 100;
}

/**
 * End-of-turn tick: poison HP loss + duration decay. Pure — returns the HP lost and
 * the next status array; the caller applies the HP loss to the rolling meter.
 */
export function tickStatuses(
  state: StatusState | undefined,
  maxHp: number
): { statuses: StatusState; hpLoss: number; expired: StatusAilment[] } {
  const statuses = state ?? [];
  if (statuses.length === 0) {
    return { statuses: [], hpLoss: 0, expired: [] };
  }
  let hpLoss = 0;
  const expired: StatusAilment[] = [];
  const next: StatusState = [];
  for (const entry of statuses) {
    if (entry.ailment === "poisoned") {
      hpLoss += poisonDamagePerTick([entry], maxHp);
    }
    if (entry.remaining !== undefined) {
      const remaining = entry.remaining - 1;
      if (remaining <= 0) {
        expired.push(entry.ailment);
        continue;
      }
      next.push({ ...entry, remaining });
    } else {
      next.push(entry);
    }
  }
  return { statuses: next, hpLoss, expired };
}
