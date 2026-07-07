import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const titleMenuSource = readFileSync(new URL("../src/titleMenuScene.ts", import.meta.url), "utf8");

describe("title menu music handoff", () => {
  it("switches to the menu cue with a short fade when the war slide advances to the title slide", () => {
    expect(titleMenuSource).toContain("const MENU_CUE_FADE_MS = 70;");
    expect(titleMenuSource).toMatch(
      /if \(this\.phase === "war"\)[\s\S]*this\.phase = "title";[\s\S]*this\.playCurrentPhaseMusic\(\{ fadeMs: MENU_CUE_FADE_MS \}\);[\s\S]*this\.showSlide\(TITLE_SLIDE_KEY\);/
    );
  });
});
