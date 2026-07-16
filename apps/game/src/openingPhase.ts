export type OpeningPhase =
  | "flyover"
  | "bedroom"
  | "night-route"
  | "meteor"
  | "return-home"
  | "home-scene"
  | "morning"
  | "post";

export const OPENING_PHASE_FLAGS = [
  "intro:flyover-done",
  "intro:wake-done",
  "intro:meteor-seen",
  "intro:returned-home",
  "intro:home-scene-done",
  "intro:morning"
] as const;

type OpeningPhaseFlag = (typeof OPENING_PHASE_FLAGS)[number];
type FlagReader = { has(flag: string): boolean };

/**
 * New opening flags are completion markers. The highest marker present wins,
 * even when earlier markers are missing.
 *
 * | Highest completed marker | Resolved phase |
 * |---|---|
 * | none | `flyover` |
 * | `intro:flyover-done` | `bedroom` |
 * | `intro:wake-done` | `night-route` |
 * | `intro:meteor-seen` | `return-home` |
 * | `intro:returned-home` | `home-scene` |
 * | `intro:home-scene-done` | `home-scene` |
 * | `intro:morning` | `morning` |
 *
 * `home-scene-done` records the authored scene ending, but the opening remains
 * in `home-scene` until the dawn transition persists `intro:morning`.
 */
const PHASE_AFTER_COMPLETED_FLAG: Record<OpeningPhaseFlag, OpeningPhase> = {
  "intro:flyover-done": "bedroom",
  "intro:wake-done": "night-route",
  "intro:meteor-seen": "return-home",
  "intro:returned-home": "home-scene",
  "intro:home-scene-done": "home-scene",
  "intro:morning": "morning"
};

const LEGACY_OPENING_FLAGS = [
  "intro:bedroom-opening-done",
  "intro:meteor-beat-fired",
  "signal:cold-signal-seen",
  "act1:complete",
  "act2:begun"
] as const;

const OPENING_PHASE_ORDER: readonly OpeningPhase[] = [
  "flyover",
  "bedroom",
  "night-route",
  "meteor",
  "return-home",
  "home-scene",
  "morning",
  "post"
];

const OPENING_MORNING_ALIAS_FLAGS = [
  "intro:morning",
  "signal:cold-signal-seen"
] as const;

export function resolveOpeningPhase(flags: { has(flag: string): boolean }): OpeningPhase {
  for (let index = OPENING_PHASE_FLAGS.length - 1; index >= 0; index -= 1) {
    const flag = OPENING_PHASE_FLAGS[index];
    if (flags.has(flag)) {
      return PHASE_AFTER_COMPLETED_FLAG[flag];
    }
  }

  if (LEGACY_OPENING_FLAGS.some((flag) => flags.has(flag)) || hasActFlag(flags)) {
    return "post";
  }

  return "flyover";
}

export function openingPhaseAtOrAfter(phase: OpeningPhase, floor: OpeningPhase): boolean {
  return OPENING_PHASE_ORDER.indexOf(phase) >= OPENING_PHASE_ORDER.indexOf(floor);
}

export function openingMorningAliasFlags(): string[] {
  return [...OPENING_MORNING_ALIAS_FLAGS];
}

function hasActFlag(flags: FlagReader): boolean {
  const list = (flags as FlagReader & { list?: () => readonly string[] }).list;
  return list?.call(flags).some((flag) => flag.startsWith("act")) ?? false;
}
