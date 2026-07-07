import { describe, expect, it } from "vitest";
import { GATE_PROMPT_FIRST_APPEAR_MS, WAR_PROMPT_FIRST_APPEAR_MS, titlePromptVisible } from "./titleMenuTiming";

describe("title prompt timing", () => {
  it("delays the pre-title gate prompt until the first second has elapsed", () => {
    expect(titlePromptVisible("gate", GATE_PROMPT_FIRST_APPEAR_MS - 1)).toBe(false);
    expect(titlePromptVisible("gate", GATE_PROMPT_FIRST_APPEAR_MS)).toBe(true);
  });

  it("keeps the war-slide prompt delayed while other slide prompts are immediate", () => {
    expect(titlePromptVisible("war", WAR_PROMPT_FIRST_APPEAR_MS - 1)).toBe(false);
    expect(titlePromptVisible("war", WAR_PROMPT_FIRST_APPEAR_MS)).toBe(true);
    expect(titlePromptVisible("title", 0)).toBe(true);
  });
});
