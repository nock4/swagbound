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
    expect(targetBlock).not.toContain("nextSceneData");
    // The dossier must never come back, and the world payload still exists.
    expect(source).toContain("newGameWorldData");
  });
});
