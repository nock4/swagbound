import type { EarlyGameSequence } from "@eb/schemas";
import {
  openingPhaseAtOrAfter,
  resolveOpeningPhase,
  type OpeningPhase
} from "./openingPhase";

type OpeningGateSequence = Pick<
  EarlyGameSequence,
  "nightCast" | "phaseGatesEnabled" | "sourceCheckAvailabilityPhase"
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
