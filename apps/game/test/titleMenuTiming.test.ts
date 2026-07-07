import { describe, expect, it } from "vitest";
import {
  WAR_PROMPT_FIRST_APPEAR_MS,
  WAR_SLIDE_FIRST_ZOOM_LEG_MS,
  WAR_SLIDE_REVEAL_FADE_MS,
  WAR_STATIC_REVEAL_MS,
  WAR_STATIC_TEXTURE_CYCLE_MS,
  titlePromptVisible
} from "../src/titleMenuTiming";

describe("title menu pacing timings", () => {
  it("uses a slower war-slide reveal, static reveal, and Ken Burns first leg", () => {
    expect(WAR_SLIDE_REVEAL_FADE_MS).toBe(5_000);
    expect(WAR_STATIC_REVEAL_MS).toBe(6_600);
    expect(WAR_STATIC_TEXTURE_CYCLE_MS).toBe(1_000 / 12);
    expect(WAR_SLIDE_FIRST_ZOOM_LEG_MS).toBe(20_000);
  });

  it("delays only the war-slide prompt, not input phases after it", () => {
    expect(WAR_PROMPT_FIRST_APPEAR_MS).toBe(4_000);
    expect(titlePromptVisible("war", 3_999)).toBe(false);
    expect(titlePromptVisible("war", 4_000)).toBe(true);
    expect(titlePromptVisible("title", 0)).toBe(true);
    expect(titlePromptVisible("menu", 0)).toBe(true);
  });
});
