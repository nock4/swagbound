import type { TransitionSfxCue } from "./mapTransition";
import type { InteractionSfxCue } from "./audio/transitionSfx";

export type CutsceneSoundId = number | string;
export type CutsceneSfxCue =
  | TransitionSfxCue
  | InteractionSfxCue
  | "encounter"
  | "textBlip"
  | "dangerHeartbeat"
  | "poisonTick";

const CUTSCENE_SFX_CUES: readonly CutsceneSfxCue[] = [
  "doorOpen",
  "doorClose",
  "footsteps",
  "escalatorHum",
  "whoosh",
  "encounter",
  "textBlip",
  "dangerHeartbeat",
  "poisonTick",
  "talkConfirm",
  "presentOpen",
  "itemGet",
  "readCue"
];

const CUTSCENE_SFX_BY_ID = new Map<number, CutsceneSfxCue>([
  [1, "talkConfirm"],
  [2, "doorOpen"],
  [3, "doorClose"],
  [4, "footsteps"],
  [5, "whoosh"],
  [6, "presentOpen"],
  [7, "itemGet"],
  [8, "readCue"],
  [9, "encounter"],
  [10, "textBlip"],
  [11, "dangerHeartbeat"],
  [12, "poisonTick"]
]);

export function resolveCutsceneSfxCue(id: CutsceneSoundId): CutsceneSfxCue | undefined {
  if (typeof id === "number") {
    return CUTSCENE_SFX_BY_ID.get(normalizeSoundId(id));
  }
  const cue = id.trim();
  return isCutsceneSfxCue(cue) ? cue : undefined;
}

export function cutsceneSoundLabel(id: CutsceneSoundId): string {
  return typeof id === "number" ? String(normalizeSoundId(id)) : id;
}

function isCutsceneSfxCue(value: string): value is CutsceneSfxCue {
  return CUTSCENE_SFX_CUES.includes(value as CutsceneSfxCue);
}

function normalizeSoundId(id: number): number {
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`Invalid cutscene sound id: ${id}`);
  }
  return id;
}
