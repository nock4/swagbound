import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BattleDataSchema,
  CustomDialogueSchema,
  ObjectivesSchema,
  OpeningClaritySchema,
  StoryTriggersSchema
} from "@eb/schemas";
import {
  applyOpeningClarityBattle,
  applyOpeningClarityDialogue,
  applyOpeningClarityObjectives,
  applyOpeningClarityStoryTriggers
} from "./openingClarity";

const clarity = OpeningClaritySchema.parse(JSON.parse(
  readFileSync(resolve("content/opening-clarity.json"), "utf8")
));
const redesign = OpeningClaritySchema.parse(JSON.parse(
  readFileSync(resolve("content/narrative-redesign.json"), "utf8")
));

describe("canonical narrative redesign overlay", () => {
  it("keeps the Milady name embargo and uses derivative language", () => {
    const preRevealTriggerIds = [
      "signal-town-card-clique",
      "signal-town-card-clique-reveal",
      "relay-gate-returnless-king",
      "north-route-gate-warning",
      "first-threshold-malady",
      "first-threshold-malady-reveal",
      "recruit-munch",
      "leave-signal-town",
      "postwick-arrival",
      "recruit-cloak",
      "postwick-registry",
      "postwick-registry-reveal",
      "arena-venue-1",
      "arena-venue-2",
      "arena-venue-3",
      "postwick-act2-end",
      "deadletter-arrival",
      "museum-starman",
      "museum-frank",
      "museum-worm"
    ];
    const earlyText = JSON.stringify({
      cutscenes: Object.values(redesign.cutsceneDialogueById),
      triggers: preRevealTriggerIds.flatMap((id) => redesign.storyTriggerDialogueById[id] ?? []),
      objectives: Object.entries(redesign.objectiveTextById)
        .filter(([id]) => !/^(?:endgame|raid-|milady-final)/.test(id))
        .map(([, text]) => text),
      dialogue: redesign.dialogue,
      variants: Object.entries(redesign.dialogueVariantsByNpcId)
        .filter(([id]) => !["138", "552"].includes(id))
        .map(([, variants]) => variants),
      enemyNames: { tutorialBoss: redesign.battleEnemyNamesById["37"] },
      tutorial: redesign.tutorialBattle.enemy.name
    }).toLowerCase();
    expect(earlyText).not.toContain("milady");
    expect(earlyText).not.toContain("malady");
    expect(earlyText).not.toContain("public bosch");
    expect(earlyText).not.toContain("public version");
    expect(earlyText).toContain("derivative");
  });

  it("makes MiFella's circulation and attraction causal in the opening", () => {
    const base = CustomDialogueSchema.parse(JSON.parse(
      readFileSync(resolve("content/custom-dialogue.json"), "utf8")
    ));
    const resolved = applyOpeningClarityDialogue(
      applyOpeningClarityDialogue(base, clarity),
      redesign
    );
    expect(resolved.byTextPointer["data_20.l_0xc66b97"]?.pages?.join(" "))
      .toContain("sent it to the arcade group");
    expect(resolved.byTextPointer["data_15.l_0xc5eb0b"]?.pages?.join(" "))
      .toContain("one turn late");
  });

  it("renames the legacy threshold boss and tutorial encounter", () => {
    const battle = BattleDataSchema.parse(JSON.parse(
      readFileSync(resolve("apps/game/public/generated/battle.json"), "utf8")
    ));
    const resolved = applyOpeningClarityBattle(
      applyOpeningClarityBattle(battle, clarity),
      redesign
    );
    expect(resolved?.enemies.find((enemy) => enemy.id === 37)?.name).toBe("Bosch Derivative");
    expect(resolved?.enemies.find((enemy) => enemy.id === 900001)?.name)
      .toBe("Unstable Bosch Derivative");
  });

  it("replaces the Act 1 emotional spine without changing trigger mechanics", () => {
    const triggers = StoryTriggersSchema.parse(JSON.parse(
      readFileSync(resolve("content/triggers.json"), "utf8")
    ));
    const resolved = applyOpeningClarityStoryTriggers(
      applyOpeningClarityStoryTriggers(triggers, clarity),
      redesign
    );
    const threshold = resolved?.triggers.find((trigger) => trigger.id === "first-threshold-malady");
    const exit = resolved?.triggers.find((trigger) => trigger.id === "leave-signal-town");
    expect(threshold?.dialogue?.join(" ")).toContain("BOSCH DERIVATIVE");
    expect(threshold?.battleGroup).toBe(450);
    expect(exit?.dialogue?.join(" ")).toContain("onboarding");
    expect(exit?.setFlags).toContain("act1:complete");
  });

  it("carries MiFella's betrayal, recognition, correction, and accountability across Acts 2-4", () => {
    expect(redesign.storyTriggerDialogueById["postwick-act2-end"]?.join(" "))
      .toContain("I gave them the private stuff");
    expect(redesign.storyTriggerDialogueById["museum-frank"]?.join(" "))
      .toContain("Strawberry");
    expect(redesign.storyTriggerDialogueById["raid-morningside-3"]?.join(" "))
      .toContain("I took the first picture");
    expect(redesign.storyTriggerDialogueById["endgame-finale"]?.join(" "))
      .toContain("without asking Bosch to erase the harm");
  });

  it("names Milady only at the Act 3 reveal and never genders the force", () => {
    const reveal = redesign.storyTriggerDialogueById["deadletter-act3-end"]?.join(" ") ?? "";
    const lateText = [
      reveal,
      ...(redesign.storyTriggerDialogueById["endgame-return"] ?? []),
      ...(redesign.storyTriggerDialogueById["raid-morningside-3"] ?? []),
      ...(redesign.storyTriggerDialogueById["milady-final"] ?? []),
      ...(redesign.storyTriggerDialogueById["endgame-finale"] ?? [])
    ].join(" ");
    expect(reveal).toContain("name it Milady");
    expect(lateText).not.toMatch(/\b(?:she|her|hers|woman|queen|goddess)\b/i);
  });

  it("merges state-aware NPC variants across both overlays", () => {
    const base = CustomDialogueSchema.parse(JSON.parse(
      readFileSync(resolve("content/custom-dialogue.json"), "utf8")
    ));
    const resolved = applyOpeningClarityDialogue(
      applyOpeningClarityDialogue(base, clarity),
      redesign
    );

    expect(resolved.variantsByNpcId?.["166"]).toBeDefined();
    expect(resolved.variantsByNpcId?.["352"]?.[0]?.pages.join(" ")).toContain("Registry cracked");
  });

  it("replaces objective hints as well as headings for the redesigned arc", () => {
    const base = ObjectivesSchema.parse(JSON.parse(
      readFileSync(resolve("content/objectives.json"), "utf8")
    ));
    const resolved = applyOpeningClarityObjectives(
      applyOpeningClarityObjectives(base, clarity),
      redesign
    );
    const registry = resolved?.objectives.find((objective) => objective.id === "act2-postwick-registry");
    const final = resolved?.objectives.find((objective) => objective.id === "milady-final");

    expect(registry?.npcHints?.join(" ")).toContain("MiFella's onboarding file");
    expect(final?.npcHints?.join(" ")).toContain("local manifestation");
    expect(final?.npcHints?.join(" ")).not.toMatch(/\b(?:she|her|hers)\b/i);
  });
});
