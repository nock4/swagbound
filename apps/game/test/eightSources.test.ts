import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EnemyActionEffectsSchema,
  FlagMapSchema,
  ItemOverridesSchema,
  StoryTriggersSchema
} from "@eb/schemas";
import { EIGHT_SOURCES_FLAGS, ORIGINAL_MIXTAPE_ITEM_ID } from "../src/eightSources";

async function readJson<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  return parse(JSON.parse(await readFile(resolve(path), "utf8")));
}

describe("Eight Sources content", () => {
  it("authors The Intake Ledger boss and reveal trigger with the intended flags", async () => {
    const storyTriggers = await readJson("content/triggers.json", (value) => StoryTriggersSchema.parse(value));
    const byId = new Map(storyTriggers.triggers.map((trigger) => [trigger.id, trigger]));

    expect(byId.get("source-intake-ledger")).toMatchObject({
      boss: { x: 2300, y: 7200, facing: "down" },
      once: true,
      requireFlags: ["act2:registry_cleared"],
      setFlags: ["source:intake-ledger:cleared"],
      battleGroup: 125
    });
    expect(byId.get("source-intake-ledger-reveal")).toMatchObject({
      area: { x: 2260, y: 7170, w: 120, h: 70 },
      once: true,
      requireFlags: ["source:intake-ledger:cleared"],
      grantItems: [ORIGINAL_MIXTAPE_ITEM_ID]
    });
  });

  it("wires The Notary FILED action to brief paralysis", async () => {
    const effects = await readJson("content/enemy-action-effects.json", (value) => EnemyActionEffectsSchema.parse(value));

    expect(effects.byActionId["83"]?.effect).toEqual({
      kind: "inflictStatus",
      ailment: "paralyzed",
      remaining: 2
    });
  });

  it("renames item 196 to Original Mixtape", async () => {
    const itemOverrides = await readJson("content/item-overrides.json", (value) => ItemOverridesSchema.parse(value));

    expect(itemOverrides.byItemId[String(ORIGINAL_MIXTAPE_ITEM_ID)]?.name).toBe("Original Mixtape");
  });

  it("keeps the shared Eight Sources flags aligned with the flag map", async () => {
    const flagMap = await readJson("content/flag-map.json", (value) => FlagMapSchema.parse(value));
    const sourceEntries = flagMap.entries
      .filter((entry) => entry.storyFlag === "signal:threshold_cleared" || entry.storyFlag.startsWith("source:"))
      .map((entry) => entry.storyFlag);

    expect(EIGHT_SOURCES_FLAGS).toEqual(sourceEntries);
  });
});
