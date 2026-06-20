import { describe, expect, it } from "vitest";
import { EnemyNameFamiliesSchema, expandOverworldEnemySkins, OverworldEnemySkinsSchema } from "../src/index";

const families = EnemyNameFamiliesSchema.parse({
  schema: "swagbound.enemy-name-families.v1",
  families: { Malady: [18, 37], "Signal Stutter": [23, 55] }
});

const skins = OverworldEnemySkinsSchema.parse({
  schema: "swagbound.overworld-enemy-skins.v1",
  frame: { frameWidth: 48, frameHeight: 48, displayHeight: 24 },
  byFamily: { Malady: "assets/swagbound/overworld-npc/malady.png" }
});

describe("expandOverworldEnemySkins", () => {
  it("expands a skinned family to every enemy id with the shared frame config", () => {
    const map = expandOverworldEnemySkins(skins, families);
    expect(Object.keys(map).sort()).toEqual(["18", "37"]);
    expect(map["18"]).toEqual({
      image: "assets/swagbound/overworld-npc/malady.png",
      frameWidth: 48,
      frameHeight: 48,
      displayHeight: 24,
      animations: { up: [0], right: [0], down: [0], left: [0] },
      originX: 0.5,
      originY: 1
    });
    expect(map["37"].image).toBe("assets/swagbound/overworld-npc/malady.png");
  });

  it("omits families without skin art (they fall back to the EB overworld sprite)", () => {
    const map = expandOverworldEnemySkins(skins, families);
    expect(map["23"]).toBeUndefined();
    expect(map["55"]).toBeUndefined();
  });
});
