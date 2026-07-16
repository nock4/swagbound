import type { EarlyGameSequence } from "@eb/schemas";
import {
  openingPhaseAtOrAfter,
  resolveOpeningPhase,
  type OpeningPhase
} from "./openingPhase";

type OpeningGateSequence = Pick<
  EarlyGameSequence,
  "nightCast" | "nightDoors" | "phaseGatesEnabled" | "sourceCheckAvailabilityPhase"
>;

type OpeningFlagReader = {
  has(flag: string): boolean;
};

const ACTIVE_OPENING_PHASES: ReadonlySet<OpeningPhase> = new Set([
  "flyover",
  "bedroom",
  "night-route",
  "meteor",
  "return-home",
  "home-scene"
]);

const NIGHT_DOOR_LOCK_PHASES: ReadonlySet<OpeningPhase> = new Set([
  "night-route",
  "meteor",
  "return-home"
]);

export function openingGatesActive(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  return seq.phaseGatesEnabled
    && ACTIVE_OPENING_PHASES.has(resolveOpeningPhase(flags));
}

export function openingNpcAllowed(
  seq: OpeningGateSequence,
  flags: OpeningFlagReader,
  npcId: number
): boolean {
  return !openingGatesActive(seq, flags)
    || (seq.nightCast?.allowNpcIds ?? []).includes(npcId);
}

export function openingRoamersAllowed(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  return !openingGatesActive(seq, flags);
}

export function openingEncountersAllowed(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  return !openingGatesActive(seq, flags);
}

export function openingSourceChecksAllowed(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  if (!seq.phaseGatesEnabled) {
    return true;
  }
  return openingPhaseAtOrAfter(
    resolveOpeningPhase(flags),
    seq.sourceCheckAvailabilityPhase
  );
}

export function openingAutosaveNoticeAllowed(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  return !openingGatesActive(seq, flags);
}

export function openingNightTintRequired(seq: OpeningGateSequence, flags: OpeningFlagReader): boolean {
  return openingGatesActive(seq, flags);
}

export function openingNightDoorLocked(
  seq: OpeningGateSequence,
  flags: OpeningFlagReader,
  entryWorldPixel: { x: number; y: number },
  entryIsOutdoors: boolean
): boolean {
  if (!openingGatesActive(seq, flags)) {
    return false;
  }
  if (!entryIsOutdoors || !NIGHT_DOOR_LOCK_PHASES.has(resolveOpeningPhase(flags))) {
    return false;
  }
  return !(seq.nightDoors?.allowWorldPixels ?? []).some(
    ([x, y]) => x === entryWorldPixel.x && y === entryWorldPixel.y
  );
}
