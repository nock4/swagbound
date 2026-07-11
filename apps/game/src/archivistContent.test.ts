import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ArchivistSpotsSchema,
  FlagMapSchema,
  StoryTriggersSchema
} from "@eb/schemas";

describe("Archivist generated content", () => {
  it("loads all 32 spots with matching triggers and PHOTO flag bridges", () => {
    const spots = ArchivistSpotsSchema.parse(readGeneratedJson("archivist-spots.json"));
    const triggers = StoryTriggersSchema.parse(readGeneratedJson("triggers.json"));
    const flagMap = FlagMapSchema.parse(readGeneratedJson("flag-map.json"));
    const triggerById = new Map(triggers.triggers.map((trigger) => [trigger.id, trigger]));
    const flagMapByStoryFlag = new Map(flagMap.entries.map((entry) => [entry.storyFlag, entry]));

    expect(spots.spots).toHaveLength(32);
    expect(spots.spots[0].anchor).toEqual({ x: 2656, y: 344 });
    expect(spots.spots[0].flag).toEqual({ id: 698, name: "FLG_PHOTO_1" });
    expect(spots.archivist).toMatchObject({
      spriteId: "drifella2-168",
      spriteNpcId: 100300
    });

    for (const spot of spots.spots) {
      const trigger = triggerById.get(`archivist-photo-${String(spot.spotId).padStart(2, "0")}`);
      expect(trigger).toBeDefined();
      expect(trigger?.archivistSpotId).toBe(spot.spotId);
      expect(trigger?.area).toEqual({
        x: spot.anchor.x - 12,
        y: spot.anchor.y - 12,
        w: 24,
        h: 24
      });
      expect(trigger?.blockFlags).toEqual([spot.flag.name]);
      expect(trigger?.setFlags).toEqual([spot.flag.name]);

      const bridge = flagMapByStoryFlag.get(spot.flag.name);
      expect(bridge?.ebFlags).toEqual([{ id: spot.flag.id, name: spot.flag.name }]);
      expect(spot.flag.id).toBe(697 + spot.spotId);
    }

    const playerFacingText = [
      ...spots.archivist.lines,
      ...spots.spots.flatMap((spot) => [spot.locationLabel, spot.caption])
    ];
    expect(playerFacingText.every((line) => !line.includes("—"))).toBe(true);
  });
});

function readGeneratedJson(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../public/generated/${file}`, import.meta.url), "utf8"));
}
