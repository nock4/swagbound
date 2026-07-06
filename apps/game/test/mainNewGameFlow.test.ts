import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("main NEW GAME flow", () => {
  it("starts chunked-world directly with the resolved new-game payload", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/game/src/main.ts"), "utf8");
    const targetBlock = source.match(/const newGameTarget = \{[\s\S]*?\n      \};/)?.[0];

    expect(targetBlock).toContain('sceneKey: "chunked-world"');
    expect(targetBlock).toContain("data: newGameWorldData");
    expect(targetBlock).not.toContain('sceneKey: "act1-intro"');
    expect(targetBlock).not.toContain("nextSceneData");
  });
});
