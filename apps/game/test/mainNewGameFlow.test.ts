import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("main NEW GAME flow", () => {
  it("routes NEW GAME through the filing-intake naming ritual into the world", () => {
    // Target construction moved from main.ts into the shared gameStartTargets
    // module (used by boot, title, and game-over alike).
    const source = readFileSync(resolve(process.cwd(), "apps/game/src/gameStartTargets.ts"), "utf8");

    // EB pacing law 2 (identity before world): NEW GAME opens the naming ritual,
    // which forwards the resolved world payload to chunked-world itself.
    expect(source).toContain('sceneKey: "filing-intake"');
    expect(source).not.toContain('sceneKey: "act1-intro"');
    expect(source).toContain("nextSceneData: buildNewGameWorldData");

    // main.ts consumes the shared helper and never rebuilds the dossier path.
    const main = readFileSync(resolve(process.cwd(), "apps/game/src/main.ts"), "utf8");
    expect(main).toContain("gameStartTargets");
    expect(main).not.toContain('sceneKey: "act1-intro"');
  });
});
