import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("main NEW GAME flow", () => {
  it("routes NEW GAME through the filing-intake naming ritual into the world", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/game/src/main.ts"), "utf8");
    const targetBlock = source.match(/const newGameTarget = \{[\s\S]*?\n      \};/)?.[0];

    // EB pacing law 2 (identity before world): NEW GAME opens the naming ritual,
    // which forwards the resolved world payload to chunked-world itself.
    expect(targetBlock).toContain('sceneKey: "filing-intake"');
    expect(targetBlock).not.toContain('sceneKey: "act1-intro"');
    // filing-intake forwards the resolved world payload through nextSceneData.
    expect(targetBlock).toContain('nextSceneKey: "chunked-world"');
    expect(targetBlock).toContain("nextSceneData: newGameWorldData");
  });
});
