import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BattleDataSchema,
  CustomDialogueSchema,
  CutscenesSchema,
  ObjectivesSchema,
  OpeningClaritySchema,
  SpriteOverridesSchema,
  StoryTriggersSchema
} from "@eb/schemas";
import {
  applyOpeningClarityBattle,
  applyOpeningClarityCutscenes,
  applyOpeningClarityDialogue,
  applyOpeningClarityObjectives,
  applyOpeningClaritySprites,
  applyOpeningClarityStoryTriggers
} from "./openingClarity";
import { resolveRuntimeNpcDialogue } from "./customDialogueLookup";

const clarity = OpeningClaritySchema.parse(JSON.parse(
  readFileSync(resolve("content/opening-clarity.json"), "utf8")
));

describe("opening clarity overlay", () => {
  it("keeps the antagonist names out of player-facing opening and Act 1 text", () => {
    const playerFacing = JSON.stringify({
      cutscenes: Object.values(clarity.cutsceneDialogueById),
      triggers: Object.values(clarity.storyTriggerDialogueById),
      objectives: Object.values(clarity.objectiveTextById),
      enemyNames: Object.values(clarity.battleEnemyNamesById),
      dialogue: clarity.dialogue,
      variants: clarity.dialogueVariantsByNpcId,
      tutorialEnemyName: clarity.tutorialBattle.enemy.name
    }).toLowerCase();
    expect(playerFacing).not.toContain("milady");
    expect(playerFacing).not.toContain("malady");
  });

  it("replaces the legacy meteor dialogue and house cast at high priority", () => {
    const base = CustomDialogueSchema.parse(JSON.parse(
      readFileSync(resolve("content/custom-dialogue.json"), "utf8")
    ));
    const resolved = applyOpeningClarityDialogue(base, clarity);
    expect(resolved.byTextPointer["data_15.l_0xc5eb0b"]?.pages?.join(" ")).toContain("SECOND BOSCH");
    expect(resolved.byNpcId[15]?.pages?.join(" ")).toContain("still in bed");
    expect(resolved.byNpcId[21]?.service).toBe("phone");
  });

  it("casts humanoids in the house and restores the phone sprite", () => {
    const base = SpriteOverridesSchema.parse(JSON.parse(
      readFileSync(resolve("content/sprite-overrides.json"), "utf8")
    ));
    const resolved = applyOpeningClaritySprites(base, clarity);
    expect(resolved?.byNpcId?.[14]?.image).toContain("sprites/052.png");
    expect(resolved?.byNpcId?.[15]?.image).toContain("sprites/055.png");
    expect(resolved?.byNpcId?.[16]?.image).toContain("sprites/064.png");
    expect(resolved?.byNpcId?.[21]?.image).toContain("sprites/215.png");
    expect(resolved?.byNpcId?.[21]?.image).not.toContain("sprites/259.png");
    expect(resolved?.overworldByEnemyId?.[37]?.image).toContain("bosch-hood-walk.png");
    expect(resolved?.byEnemyId?.[37]?.image).toContain("dox-sheet-world.png");
  });

  it("keeps the spawn cutscene a silent flag-setter (monologue removed; hand-off is the parent scene)", () => {
    // 2026-07-19: the "Bosch wakes to a wrongness" morning monologue was removed (no key
    // story/guidance via narration). signal-town-cold-signal-open now only sets its flag;
    // the Swag Deck hand-off + how-to-use + wayfinding are delivered as a SCENE by Bosch's
    // parent (trigger signal-town-parent-swag-deck).
    const base = CutscenesSchema.parse(JSON.parse(
      readFileSync(resolve("content/cutscenes.json"), "utf8")
    ));
    const resolved = applyOpeningClarityCutscenes(base, clarity);
    const opening = resolved?.cutscenes.find((entry) => entry.id === "signal-town-cold-signal-open");
    expect(opening?.steps.some((step) => step.op === "dialogue")).toBe(false);
    expect(opening?.steps).toContainEqual({ op: "setFlag", flag: "signal:cold-signal-seen" });

    const hill = resolved?.cutscenes.find((entry) => entry.id === "onett-brother-fallsin");
    const hillDialogue = hill?.steps.find((step) => step.op === "dialogue");
    expect(hillDialogue?.op === "dialogue" ? hillDialogue.pages.join(" ") : "").toContain("MiFella catches up");
    expect(hill?.steps).toContainEqual({ op: "setFlag", flag: "signal:onett-brother-joined" });
  });

  it("adds a small dedicated tutorial battle independent of enemy 214", () => {
    const base = BattleDataSchema.parse(JSON.parse(
      readFileSync(resolve("apps/game/public/generated/battle.json"), "utf8")
    ));
    const resolved = applyOpeningClarityBattle(base, clarity);
    const enemy = resolved?.enemies.find((entry) => entry.id === 900001);
    const group = resolved?.groups.find((entry) => entry.id === 900001);
    expect(enemy).toMatchObject({ name: "Cold Signal", level: 1, hp: 48, offense: 8, defense: 4 });
    expect(group?.enemyIds).toEqual([900001]);
    expect(group?.enemyIds).not.toContain(214);
  });

  it("reframes the Act 1 trigger chain and boss without changing trigger mechanics", () => {
    const base = StoryTriggersSchema.parse(JSON.parse(
      readFileSync(resolve("content/triggers.json"), "utf8")
    ));
    const resolved = applyOpeningClarityStoryTriggers(base, clarity);
    const publicBosch = resolved?.triggers.find((entry) => entry.id === "first-threshold-malady");
    expect(publicBosch?.dialogue?.join(" ")).toContain("PUBLIC BOSCH");
    expect(publicBosch?.battleGroup).toBe(450);
    expect(publicBosch?.setFlags).toEqual(["signal:threshold_cleared", "source:first_witness"]);
    const act1Text = resolved?.triggers
      .filter((entry) => Object.hasOwn(clarity.storyTriggerDialogueById, entry.id))
      .flatMap((entry) => entry.dialogue ?? [])
      .join(" ")
      .toLowerCase();
    expect(act1Text).not.toContain("milady");
    expect(act1Text).not.toContain("malady");

    const battle = BattleDataSchema.parse(JSON.parse(
      readFileSync(resolve("apps/game/public/generated/battle.json"), "utf8")
    ));
    expect(applyOpeningClarityBattle(battle, clarity)?.enemies.find((entry) => entry.id === 37)?.name)
      .toBe("Public Bosch File");
  });

  it("corrects the verified Act 1 route and removes the unverified Postwick direction", () => {
    const base = ObjectivesSchema.parse(JSON.parse(
      readFileSync(resolve("content/objectives.json"), "utf8")
    ));
    const resolved = applyOpeningClarityObjectives(base, clarity);
    expect(resolved?.objectives.find((entry) => entry.id === "act1-card-clique")?.text)
      .toContain("west");
    const postwick = resolved?.objectives.find((entry) => entry.id === "act2-reach-postwick")?.text ?? "";
    expect(postwick).not.toMatch(/\b(?:north|south|east|west)(?:ern)?\b/i);
  });

  it("selects the most specific matching NPC story state and preserves services", () => {
    const base = CustomDialogueSchema.parse(JSON.parse(
      readFileSync(resolve("content/custom-dialogue.json"), "utf8")
    ));
    const resolved = applyOpeningClarityDialogue(base, clarity);
    const flags = new Set(["signal:clique_cleared"]);
    const gateHint = resolveRuntimeNpcDialogue(resolved, 166, { has: (flag) => flags.has(flag) });
    expect(gateHint?.pages?.join(" ")).toContain("THE PRECINCT");

    flags.add("signal:route_open");
    const crossingHint = resolveRuntimeNpcDialogue(resolved, 166, { has: (flag) => flags.has(flag) });
    expect(crossingHint?.pages?.join(" ")).toContain("crossing by the hotel");

    const phone = resolveRuntimeNpcDialogue(resolved, 21, { has: (flag) => flags.has(flag) });
    expect(phone?.service).toBe("phone");
    expect(phone?.pages?.join(" ")).toContain("other Bosch");
  });
});
