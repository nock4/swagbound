export type TitleMenuPhase = "gate" | "title" | "war" | "menu";

export const WAR_SLIDE_REVEAL_FADE_MS = 2_500;
export const WAR_PROMPT_FIRST_APPEAR_MS = 4_000;
export const WAR_SLIDE_FIRST_ZOOM_LEG_MS = 20_000;
export const GATE_PROMPT_FIRST_APPEAR_MS = 1_000;

export function titlePromptVisible(phase: TitleMenuPhase, promptClockMs: number): boolean {
  if (phase === "gate") {
    return promptClockMs >= GATE_PROMPT_FIRST_APPEAR_MS;
  }
  return phase !== "war" || promptClockMs >= WAR_PROMPT_FIRST_APPEAR_MS;
}
