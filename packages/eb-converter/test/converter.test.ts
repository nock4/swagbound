import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDialoguePages,
  ManifestSchema,
  resolveScriptReference,
  resolveScriptEvents,
  resolveScriptReferenceFlow,
  CharacterCollectionSchema,
  ItemCollectionSchema,
  PsiCollectionSchema,
  ShopDataSchema,
  TutorialStatusSchema,
  type ScriptCollection
} from "@eb/schemas";
import { buildBattleData } from "../src/battle";
import { convertProject, parseCcsFile, readNpcReferences, tokenizeCcsString } from "../src/index";
import { validateGeneratedOutput } from "../src/validate";
import { classifyProofTarget, findForbiddenProofArtifactText, findNpc744Placements, isNeutralizedMapDoorPointer, proofRecommendation } from "../../../scripts/proof-check";
import { checkCommandForMode, sanitizePacketOutput } from "../../../scripts/proof-packet";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mP8z8AABQMBgBL9v7kAAAAASUVORK5CYII=",
  "base64"
);

describe("schemas", () => {
  it("validates generated manifests", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-converter-"));
    try {
      const result = await convertProject({
        project: path.join(temp, "missing-project"),
        out: path.join(temp, "generated")
      });
      expect(() => ManifestSchema.parse(result.manifest)).not.toThrow();
      expect(result.manifest.sourceProject.exists).toBe(false);
      expect(result.manifest.warnings.some((warning) => warning.code === "missing_project")).toBe(true);
      expect(result.manifest.files.npcs).toBe("npcs.json");
      expect(result.manifest.files.tutorialStatus).toBe("tutorial-status.json");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("NPC reference scanner", () => {
  it("detects robot.hello_world with source location", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-npc-scan-"));
    try {
      await mkdir(path.join(temp, "metadata"), { recursive: true });
      await writeFile(path.join(temp, "metadata", "npc_table.yml"), "name: robot\nscript: robot.hello_world\n", "utf8");

      const result = await readNpcReferences(temp);

      expect(result.references).toHaveLength(1);
      expect(result.references[0]).toMatchObject({
        reference: "robot.hello_world",
        scriptFileStem: "robot",
        label: "hello_world",
        sourceLocation: { file: "metadata/npc_table.yml", line: 2, column: 9 },
        raw: "script: robot.hello_world",
        contextType: "npc"
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("ignores binary files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-npc-scan-"));
    try {
      await writeFile(path.join(temp, "npc.bin"), Buffer.from("robot.hello_world"));
      const result = await readNpcReferences(temp);

      expect(result.counts.references).toBe(0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("script resolver and dialogue playback", () => {
  it("tokenizes EB font-select bytes into numeric font-id style segments", () => {
    expect(tokenizeCcsString("A[1F 31]B[1F 30]C")).toEqual([
      { kind: "text", value: "A" },
      { kind: "style", style: "font", value: "saturn", args: [1] },
      { kind: "text", value: "B" },
      { kind: "style", style: "font", value: "normal", args: [0] },
      { kind: "text", value: "C" }
    ]);
  });

  it("tokenizes EB font-select macros into the same font ids", () => {
    expect(tokenizeCcsString("A{font_saturn}B{font_normal}C")).toEqual([
      { kind: "text", value: "A" },
      { kind: "style", style: "font", value: "saturn", args: [1] },
      { kind: "text", value: "B" },
      { kind: "style", style: "font", value: "normal", args: [0] },
      { kind: "text", value: "C" }
    ]);
  });

  it("resolves robot.hello_world from generated script commands", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-resolver-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n"Page one" next\n"Page two" end\n', "utf8");

      const result = await convertProject({ project, out: path.join(temp, "generated") });
      const resolved = resolveScriptReference(result.scripts, "robot.hello_world");

      expect(resolved?.commands.map((command) => command.cmd)).toEqual(["text", "next", "text", "end"]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("groups text, next, end, and unknown commands into dialogue pages", () => {
    const parsed = parseCcsFile("ccscript/robot.ccs", 'hello_world:\n"First" next\nmystery\n"Second" end\n');
    const pages = buildDialoguePages(parsed.commands.slice(1));

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ text: "First", ended: false });
    expect(pages[1]).toMatchObject({ text: "Second", ended: true });
    expect(pages[1].unknownCommands[0]).toMatchObject({ cmd: "unknown", raw: "mystery" });
  });
});

describe("generated validation", () => {
  it("validates generated files including npcs.json", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-validation-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "metadata"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n"Hi" end\n', "utf8");
      await writeFile(path.join(project, "metadata", "npc_table.yml"), "script: robot.hello_world\n", "utf8");
      const generated = await convertProject({ project, out });

      const result = await validateGeneratedOutput(out);

      expect(generated.manifest.files).toMatchObject({
        scripts: "scripts.json",
        npcs: "npcs.json",
        spriteGroups: "sprite-groups.json",
        tutorialStatus: "tutorial-status.json",
        validationReport: "validation-report.json"
      });
      expect(generated.manifest.counts.npcReferences).toBe(1);
      expect(result.ok).toBe(true);
      expect(result.generatedFiles).toContain("npcs.json");
      expect(result.generatedFiles).toContain("tutorial-status.json");
      expect(result.npcReferences).toBe(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("throws for missing or invalid generated files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-validation-"));
    try {
      await expect(validateGeneratedOutput(temp)).rejects.toThrow("missing_manifest");
      await writeFile(path.join(temp, "manifest.json"), "{\"bad\":true}\n", "utf8");
      await expect(validateGeneratedOutput(temp)).rejects.toThrow("schemaVersion");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects generated public JSON with absolute user paths or ROM references", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-validation-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n"Hi" end\n', "utf8");
      await convertProject({ project, out });
      const manifestPath = path.join(out, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { sourceProject: { path: string } };

      manifest.sourceProject.path = "/Users/example/project";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await expect(validateGeneratedOutput(out)).rejects.toThrow("absolute_user_path");

      manifest.sourceProject.path = "EarthBound (USA).sfc";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await expect(validateGeneratedOutput(out)).rejects.toThrow("rom_extension_path");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("extracts a bounded battle fixture only when opted in", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-battle-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeBattleFixture(project);

      const defaultResult = await convertProject({ project, out });
      const defaultValidation = await validateGeneratedOutput(out);

      expect(defaultResult.battle).toBeUndefined();
      expect(existsSync(path.join(out, "battle.json"))).toBe(false);
      expect(defaultValidation.generatedFiles).not.toContain("battle.json");

      const generated = await convertProject({ project, out, battle: true });
      const result = await validateGeneratedOutput(out);
      const battle = generated.battle;

      expect(battle?.selection).toMatchObject({
        method: "town-map-sector-intersection+low-level-boss-flag-groups",
        mapEnemyGroupIds: [2],
        battleGroupIds: [20, 21, 30, 31],
        fallbackUsed: false
      });
      expect(battle?.enemies.map((enemy) => enemy.id)).toEqual([10, 11, 30, 31, 33]);
      expect(battle?.groups).toEqual([
        { id: 20, background1: 3, background2: 0, enemyIds: [10] },
        { id: 21, background1: 4, background2: 0, enemyIds: [11] },
        { id: 30, background1: 6, background2: 0, enemyIds: [30] },
        { id: 31, background1: 7, background2: 0, enemyIds: [31] }
      ]);
      expect(battle?.backgrounds?.map((background) => background.id)).toEqual([0, 3, 4, 6, 7]);
      expect(battle?.backgrounds?.find((background) => background.id === 0)).toEqual({ id: 0 });
      expect(battle?.backgrounds?.find((background) => background.id === 3)).toEqual({
        id: 3,
        scroll: { x: 120, y: -60 },
        distortion: {
          kind: "horizontal, synthetic",
          amplitude: 3,
          frequency: 0.25,
          speed: 3
        }
      });
      expect(battle?.backgrounds?.find((background) => background.id === 4)).toEqual({
        id: 4,
        scroll: { x: 0, y: 30 }
      });
      expect(battle?.backgrounds?.find((background) => background.id === 6)).toEqual({ id: 6 });
      expect(battle?.enemies.find((enemy) => enemy.id === 10)).toMatchObject({
        name: "Neutral One",
        spriteId: 10,
        level: 3,
        hp: 12,
        defense: 2,
        offense: 4,
        speed: 2,
        experience: 7,
        money: 13,
        bossFlag: false,
        itemRarity: { numerator: 16, denominator: 128 },
        itemDropped: 0,
        actions: [
          { id: 1, arg: 0, actionId: 1, actionType: 1, target: 1 },
          { id: 2, arg: 3, actionId: 2, actionType: 2, target: 4 },
          { id: 3, arg: 0, actionId: 3, actionType: 3, target: 1 },
          { id: 4, arg: 1, actionId: 4, actionType: 5, target: 0 }
        ]
      });
      expect(battle?.enemies.find((enemy) => enemy.id === 30)).toMatchObject({
        name: "Neutral Flag A",
        spriteId: 30,
        level: 6,
        hp: 80,
        speed: 6,
        bossFlag: true,
        actions: [
          { id: 1, arg: 0, actionId: 1, actionType: 1, target: 1 },
          { id: 2, arg: 0, actionId: 2, actionType: 2, target: 4 },
          { id: 3, arg: 0, actionId: 3, actionType: 3, target: 1 },
          { id: 4, arg: 0, actionId: 4, actionType: 5, target: 0 }
        ]
      });
      expect(battle?.enemies.find((enemy) => enemy.id === 32)).toBeUndefined();
      expect(battle?.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "battle_low_level_boss_without_group",
          path: "enemy_groups.yml"
        })
      ]));
      expect(existsSync(path.join(out, "assets/battle/sprites/010.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/sprites/011.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/sprites/012.png"))).toBe(false);
      expect(existsSync(path.join(out, "assets/battle/sprites/030.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/sprites/031.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/sprites/032.png"))).toBe(false);
      expect(existsSync(path.join(out, "assets/battle/sprites/033.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/000.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/003.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/004.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/005.png"))).toBe(false);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/006.png"))).toBe(true);
      expect(existsSync(path.join(out, "assets/battle/backgrounds/007.png"))).toBe(true);
      expect(result.ok).toBe(true);
      expect(result.generatedFiles).toContain("battle.json");
      expect(result.battleEnemies).toBe(5);
      expect(result.battleGroups).toBe(4);
      expect(result.battleAssetsChecked).toBe(10);

      const referencedOut = path.join(temp, "generated-referenced");
      const referenced = await buildBattleData({
        projectAbs: project,
        outAbs: referencedOut,
        displayPath: "synthetic",
        referencedBattleGroupIds: [22, 999, 21]
      });

      expect(referenced.selection).toMatchObject({
        method: "encounter-referenced-full-world",
        battleGroupIds: [21, 22],
        fallbackUsed: false
      });
      expect(referenced.enemies.map((enemy) => enemy.id)).toEqual([11, 12]);
      expect(referenced.groups.map((group) => group.id)).toEqual([21, 22]);
      expect(referenced.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "battle_missing_referenced_groups" })
      ]));
      expect(existsSync(path.join(referencedOut, "assets/battle/sprites/010.png"))).toBe(false);
      expect(existsSync(path.join(referencedOut, "assets/battle/sprites/011.png"))).toBe(true);
      expect(existsSync(path.join(referencedOut, "assets/battle/sprites/012.png"))).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("adds story boss groups to referenced battle extraction without unbounding it", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-story-battle-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeStoryBossBattleFixture(project);

      const battle = await buildBattleData({
        projectAbs: project,
        outAbs: out,
        displayPath: "synthetic",
        referencedBattleGroupIds: [22]
      });

      expect(battle.selection).toMatchObject({
        method: "encounter-referenced-full-world+story-boss-groups",
        battleGroupIds: [22, 448, 449, 450, 474],
        fallbackUsed: false
      });
      expect(battle.enemies.map((enemy) => enemy.id)).toEqual([12, 37, 130, 131, 209, 214]);
      expect(battle.groups).toEqual([
        { id: 22, background1: 3, background2: 0, enemyIds: [12] },
        { id: 448, background1: 8, background2: 7, enemyIds: [131] },
        { id: 449, background1: 10, background2: 9, enemyIds: [130] },
        { id: 450, background1: 12, background2: 11, enemyIds: [37, 209] },
        { id: 474, background1: 14, background2: 13, enemyIds: [214] }
      ]);
      expect([37, 130, 131, 214].every((id) =>
        battle.enemies.find((enemy) => enemy.id === id)?.bossFlag === true
      )).toBe(true);
      expect(Object.fromEntries(battle.enemies.map((enemy) => [enemy.id, enemy.speed]))).toMatchObject({
        12: 3,
        37: 8,
        130: 7,
        131: 6,
        209: 5,
        214: 6
      });
      expect(battle.enemies.find((enemy) => enemy.id === 999)).toBeUndefined();
      expect(battle.groups.find((group) => group.id === 900)).toBeUndefined();
      expect(battle.counts).toMatchObject({ enemies: 6, groups: 5 });
      expect(existsSync(path.join(out, "assets/battle/sprites/999.png"))).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("extracts bounded character data only when opted in", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-characters-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeCharacterFixture(project);

      const defaultResult = await convertProject({ project, out });
      const defaultValidation = await validateGeneratedOutput(out);

      expect(defaultResult.characters).toBeUndefined();
      expect(existsSync(path.join(out, "characters.json"))).toBe(false);
      expect(defaultValidation.generatedFiles).not.toContain("characters.json");

      const generated = await convertProject({ project, out, characters: true });
      const result = await validateGeneratedOutput(out);
      const characters = CharacterCollectionSchema.parse(generated.characters);

      expect(characters.counts).toEqual({
        characters: 2,
        statFieldsPopulated: 22,
        growthFieldsPopulated: 14,
        expThresholds: 8
      });
      expect(characters.characters[0]).toMatchObject({
        id: 0,
        name: "ALPHA",
        level: 1,
        experience: 0,
        maxHp: 41,
        maxPp: 12,
        offense: 6,
        defense: 5,
        speed: 4,
        guts: 3,
        vitality: 2,
        iq: 1,
        luck: 7,
        startingItems: [10],
        money: 3,
        growth: {
          offense: 10,
          defense: 10,
          speed: 10,
          guts: 10,
          vitality: 10,
          iq: 10,
          luck: 10
        },
        expTable: [
          { level: 1, experience: 0 },
          { level: 2, experience: 5 },
          { level: 3, experience: 25 },
          { level: 4, experience: 100 }
        ]
      });
      expect(characters.characters[1]).toMatchObject({
        id: 1,
        name: "BETA",
        level: 4,
        experience: 100,
        maxHp: 63,
        maxPp: 14,
        offense: 11,
        defense: 10,
        speed: 9,
        guts: 8,
        vitality: 7,
        iq: 6,
        luck: 5,
        startingItems: [11],
        money: 0
      });
      expect(result.ok).toBe(true);
      expect(result.generatedFiles).toContain("characters.json");
      expect(result.characters).toBe(2);
      expect(result.characterStatFieldsPopulated).toBe(22);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("falls back to neutral character starts when initial stats are absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-characters-missing-initial-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeCharacterFixture(project);
      await rm(path.join(project, "initial_stats.yml"), { force: true });

      const generated = await convertProject({ project, out, characters: true });
      const characters = CharacterCollectionSchema.parse(generated.characters);

      expect(characters.characters).toHaveLength(2);
      expect(characters.characters[0]).toMatchObject({
        id: 0,
        level: 1,
        experience: 0,
        maxHp: 30,
        maxPp: 10,
        offense: 2,
        defense: 2,
        speed: 2,
        guts: 2,
        vitality: 2,
        iq: 2,
        luck: 2,
        startingItems: [],
        money: 0
      });
      expect(characters.warnings.some((warning) => warning.code === "character_initial_stats_missing")).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("extracts item and PSI data only when opted in", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-items-psi-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeItemPsiFixture(project);

      const defaultResult = await convertProject({ project, out });
      const defaultValidation = await validateGeneratedOutput(out);

      expect(defaultResult.items).toBeUndefined();
      expect(defaultResult.psi).toBeUndefined();
      expect(defaultResult.shops).toBeUndefined();
      expect(existsSync(path.join(out, "items.json"))).toBe(false);
      expect(existsSync(path.join(out, "psi.json"))).toBe(false);
      expect(existsSync(path.join(out, "shops.json"))).toBe(false);
      expect(defaultValidation.generatedFiles).not.toContain("items.json");
      expect(defaultValidation.generatedFiles).not.toContain("psi.json");
      expect(defaultValidation.generatedFiles).not.toContain("shops.json");

      const generated = await convertProject({ project, out, items: true });
      const result = await validateGeneratedOutput(out);
      const items = ItemCollectionSchema.parse(generated.items);
      const psi = PsiCollectionSchema.parse(generated.psi);
      const shops = ShopDataSchema.parse(generated.shops);

      expect(items.counts).toEqual({ items: 2, equippable: 1 });
      expect(items.items.map((item) => item.id)).toEqual([10, 11]);
      expect(items.items[0]).toMatchObject({
        id: 10,
        name: "[item 10 data]",
        type: 0x10,
        cost: 5,
        action: 1,
        argument: 2,
        equippable: true,
        miscFlags: ["flag-a", "flag-b"]
      });
      expect(items.items[1]).toMatchObject({
        id: 11,
        name: "[item 11 data]",
        type: 0x20,
        cost: 7,
        action: 3,
        argument: 0,
        equippable: false,
        miscFlags: []
      });
      expect(psi.counts).toEqual({ psi: 2, learnedBy: 3 });
      expect(psi.psi.map((entry) => entry.id)).toEqual([7, 8]);
      expect(psi.psi[0]).toMatchObject({
        id: 7,
        name: "[psi 0 data]",
        type: "assist",
        strength: "stage-a",
        usableOutsideBattle: true,
        learnedBy: [
          { charId: 0, level: 2 },
          { charId: 3, level: 4 }
        ]
      });
      expect(psi.psi[1]).toMatchObject({
        id: 8,
        name: "[psi 1 data]",
        usableOutsideBattle: false,
        learnedBy: [{ charId: 1, level: 5 }]
      });
      expect(result.ok).toBe(true);
      expect(result.generatedFiles).toContain("items.json");
      expect(result.generatedFiles).toContain("psi.json");
      expect(result.generatedFiles).toContain("shops.json");
      expect(result.items).toBe(2);
      expect(result.equippableItems).toBe(1);
      expect(result.psi).toBe(2);
      expect(result.psiLearnedByEntries).toBe(3);
      expect(shops.counts).toEqual({ shops: 2, entries: 3 });
      expect(shops.shops).toEqual([
        { id: 2, itemIds: [10, 11] },
        { id: 3, itemIds: [11] }
      ]);
      expect(result.shops).toBe(2);
      expect(result.shopItemEntries).toBe(3);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

async function writeBattleFixture(project: string): Promise<void> {
  await mkdir(path.join(project, "BattleSprites"), { recursive: true });
  await mkdir(path.join(project, "BattleBGs"), { recursive: true });
  await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
  await writeFile(path.join(project, "enemy_configuration_table.yml"), [
    "10:",
    "  Name: Neutral One",
    "  HP: 0x0c",
    "  Defense: 2",
    "  Offense: 0x04",
    "  Speed: 2",
    "  Experience points: 7",
    "  Money: 13",
    "  Level: 3",
    "  Boss Flag: False",
    "  Action 1: 1",
    "  Action 1 Argument: 0",
    "  Action 2: 2",
    "  Action 2 Argument: 3",
    "  Action 3: 3",
    "  Action 3 Argument: 0",
    "  Action 4: 4",
    "  Action 4 Argument: 1",
    "  Item Dropped: 0",
    "  Item Rarity: 16/128",
    "11:",
    "  Name: Neutral Two",
    "  HP: 14",
    "  Defense: 3",
    "  Offense: 5",
    "  Speed: 3",
    "  Experience points: 8",
    "  Money: 17",
    "  Level: 4",
    "  Boss Flag: False",
    "  Action 1: 5",
    "  Action 1 Argument: 0",
    "  Action 2: 6",
    "  Action 2 Argument: 0",
    "  Action 3: 7",
    "  Action 3 Argument: 0",
    "  Action 4: 8",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    "12:",
    "  Name: Neutral Extra",
    "  HP: 99",
    "  Defense: 9",
    "  Offense: 9",
    "  Speed: 9",
    "  Experience points: 9",
    "  Money: 19",
    "  Level: 9",
    "  Boss Flag: False",
    "  Action 1: 9",
    "  Action 1 Argument: 0",
    "  Action 2: 9",
    "  Action 2 Argument: 0",
    "  Action 3: 9",
    "  Action 3 Argument: 0",
    "  Action 4: 9",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    "30:",
    "  Name: Neutral Flag A",
    "  HP: 80",
    "  Defense: 7",
    "  Offense: 12",
    "  Speed: 6",
    "  Experience points: 20",
    "  Money: 3",
    "  Level: 6",
    "  Boss Flag: True",
    "  Action 1: 1",
    "  Action 1 Argument: 0",
    "  Action 2: 2",
    "  Action 2 Argument: 0",
    "  Action 3: 3",
    "  Action 3 Argument: 0",
    "  Action 4: 4",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    "31:",
    "  Name: Neutral Flag B",
    "  HP: 120",
    "  Defense: 8",
    "  Offense: 14",
    "  Speed: 7",
    "  Experience points: 25",
    "  Money: 4",
    "  Level: 12",
    "  Boss Flag: True",
    "  Action 1: 5",
    "  Action 1 Argument: 0",
    "  Action 2: 6",
    "  Action 2 Argument: 0",
    "  Action 3: 7",
    "  Action 3 Argument: 0",
    "  Action 4: 8",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    "32:",
    "  Name: Neutral Flag High",
    "  HP: 240",
    "  Defense: 20",
    "  Offense: 20",
    "  Speed: 13",
    "  Experience points: 50",
    "  Money: 5",
    "  Level: 13",
    "  Boss Flag: True",
    "  Action 1: 9",
    "  Action 1 Argument: 0",
    "  Action 2: 9",
    "  Action 2 Argument: 0",
    "  Action 3: 9",
    "  Action 3 Argument: 0",
    "  Action 4: 9",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    "33:",
    "  Name: Neutral Flag Ungrouped",
    "  HP: 90",
    "  Defense: 7",
    "  Offense: 12",
    "  Speed: 6",
    "  Experience points: 21",
    "  Money: 3",
    "  Level: 7",
    "  Boss Flag: True",
    "  Action 1: 1",
    "  Action 1 Argument: 0",
    "  Action 2: 1",
    "  Action 2 Argument: 0",
    "  Action 3: 1",
    "  Action 3 Argument: 0",
    "  Action 4: 1",
    "  Action 4 Argument: 0",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "battle_action_table.yml"), [
    "1:",
    "  Action type: physical (affected by shields and defending)",
    "  Target: one",
    "2:",
    "  Action type: physical (unaffected by shields and defending)",
    "  Target: all",
    "3:",
    "  Action type: PSI",
    "  Target: one",
    "4:",
    "  Action type: other",
    "  Target: none",
    "5:",
    "  Action type: item",
    "  Target: none",
    "6:",
    "  Action type: nothing",
    "  Target: none",
    "7:",
    "  Action type: other",
    "  Target: one",
    "8:",
    "  Action type: physical (unaffected by shields and defending)",
    "  Target: random",
    "9:",
    "  Action type: physical (affected by shields and defending)",
    "  Target: one",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "enemy_groups.yml"), [
    "20:",
    "  Background 1: 3",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 10}",
    "21:",
    "  Background 1: 4",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 11}",
    "22:",
    "  Background 1: 5",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 12}",
    "30:",
    "  Background 1: 6",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 30}",
    "31:",
    "  Background 1: 7",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 31}",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "map_enemy_groups.yml"), [
    "2:",
    "  Event Flag: 0x0",
    "  Sub-Group 1:",
    "    0: {Enemy Group: 20, Probability: 4}",
    "    1: {Enemy Group: 21, Probability: 4}",
    "  Sub-Group 1 Rate: 8",
    "  Sub-Group 2: {}",
    "  Sub-Group 2 Rate: 0",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "map_enemy_placement.yml"), [
    "260:",
    "  Enemy Map Group: 2",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "map_sectors.yml"), [
    "33:",
    "  Town Map: onett",
    "  Town Map Image: onett",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "bg_data_table.yml"), [
    "0:",
    "  Distortion 1: 0",
    "  Distortion 2: 0",
    "  Distortion 3: 0",
    "  Distortion 4: 0",
    "  Scrolling Movement 1: 0",
    "  Scrolling Movement 2: 0",
    "  Scrolling Movement 3: 0",
    "  Scrolling Movement 4: 0",
    "3:",
    "  Distortion 1: 1",
    "  Distortion 2: 0",
    "  Distortion 3: 0",
    "  Distortion 4: 0",
    "  Scrolling Movement 1: 1",
    "  Scrolling Movement 2: 0",
    "  Scrolling Movement 3: 0",
    "  Scrolling Movement 4: 0",
    "4:",
    "  Distortion 1: 0",
    "  Distortion 2: 0",
    "  Distortion 3: 0",
    "  Distortion 4: 0",
    "  Scrolling Movement 1: 2",
    "  Scrolling Movement 2: 0",
    "  Scrolling Movement 3: 0",
    "  Scrolling Movement 4: 0",
    "6:",
    "  Distortion 1: 99",
    "  Distortion 2: 0",
    "  Distortion 3: 0",
    "  Distortion 4: 0",
    "  Scrolling Movement 1: 0",
    "  Scrolling Movement 2: 0",
    "  Scrolling Movement 3: 0",
    "  Scrolling Movement 4: 0",
    "7:",
    "  Distortion 1: 2",
    "  Distortion 2: 0",
    "  Distortion 3: 0",
    "  Distortion 4: 0",
    "  Scrolling Movement 1: 3",
    "  Scrolling Movement 2: 4",
    "  Scrolling Movement 3: 0",
    "  Scrolling Movement 4: 0",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "bg_scrolling_table.yml"), [
    "1:",
    "  Duration: 0",
    "  Horizontal Acceleration: 0",
    "  Horizontal Movement: 512",
    "  Vertical Acceleration: 0",
    "  Vertical Movement: 65280",
    "2:",
    "  Duration: 0",
    "  Horizontal Acceleration: 0",
    "  Horizontal Movement: 0",
    "  Vertical Acceleration: 0",
    "  Vertical Movement: 128",
    "3:",
    "  Duration: 0",
    "  Horizontal Acceleration: 0",
    "  Horizontal Movement: 65408",
    "  Vertical Acceleration: 0",
    "  Vertical Movement: 0",
    "4:",
    "  Duration: 0",
    "  Horizontal Acceleration: 0",
    "  Horizontal Movement: 256",
    "  Vertical Acceleration: 0",
    "  Vertical Movement: 256",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "bg_distortion_table.yml"), [
    "1:",
    "  Ripple Amplitude: 3072",
    "  Ripple Amplitude Acceleration: 0",
    "  Ripple Frequency: 1024",
    "  Ripple Frequency Acceleration: 0",
    "  Speed: 3",
    "  Type: horizontal, synthetic",
    "  Unknown A: 0",
    "  Unknown B: 0",
    "  Unknown C: 0",
    "  Unknown D: 0",
    "2:",
    "  Ripple Amplitude: 5120",
    "  Ripple Amplitude Acceleration: 0",
    "  Ripple Frequency: 2048",
    "  Ripple Frequency Acceleration: 0",
    "  Speed: 1",
    "  Type: horizontal, synthetic",
    "  Unknown A: 0",
    "  Unknown B: 0",
    "  Unknown C: 0",
    "  Unknown D: 0",
    ""
  ].join("\n"), "utf8");

  await writeFile(path.join(project, "BattleSprites", "010.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleSprites", "011.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleSprites", "012.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleSprites", "030.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleSprites", "031.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleSprites", "033.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "000.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "003.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "004.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "005.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "006.png"), TINY_PNG);
  await writeFile(path.join(project, "BattleBGs", "007.png"), TINY_PNG);
}

async function writeStoryBossBattleFixture(project: string): Promise<void> {
  await mkdir(path.join(project, "BattleSprites"), { recursive: true });
  await mkdir(path.join(project, "BattleBGs"), { recursive: true });
  await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
  await writeFile(path.join(project, "enemy_configuration_table.yml"), [
    syntheticBattleEnemyYaml(12, "Neutral Referenced", false, 3),
    syntheticBattleEnemyYaml(37, "Neutral Story C", true, 8),
    syntheticBattleEnemyYaml(130, "Neutral Story B", true, 7),
    syntheticBattleEnemyYaml(131, "Neutral Story A", true, 6),
    syntheticBattleEnemyYaml(209, "Neutral Support", false, 5),
    syntheticBattleEnemyYaml(214, "Neutral Story D", true, 6),
    syntheticBattleEnemyYaml(999, "Neutral Unused", true, 60),
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "battle_action_table.yml"), [
    "1:",
    "  Action type: physical (affected by shields and defending)",
    "  Target: one",
    "2:",
    "  Action type: physical (unaffected by shields and defending)",
    "  Target: all",
    "3:",
    "  Action type: PSI",
    "  Target: random",
    "4:",
    "  Action type: other",
    "  Target: none",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "enemy_groups.yml"), [
    "22:",
    "  Background 1: 3",
    "  Background 2: 0",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 12}",
    "448:",
    "  Background 1: 8",
    "  Background 2: 7",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 131}",
    "449:",
    "  Background 1: 10",
    "  Background 2: 9",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 130}",
    "450:",
    "  Background 1: 12",
    "  Background 2: 11",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 37}",
    "  - {Amount: 2, Enemy: 209}",
    "474:",
    "  Background 1: 14",
    "  Background 2: 13",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 214}",
    "900:",
    "  Background 1: 16",
    "  Background 2: 15",
    "  Enemies:",
    "  - {Amount: 1, Enemy: 999}",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "map_enemy_groups.yml"), "", "utf8");
  await writeFile(path.join(project, "map_enemy_placement.yml"), "", "utf8");
  await writeFile(path.join(project, "map_sectors.yml"), "", "utf8");

  for (const enemyId of [12, 37, 130, 131, 209, 214]) {
    await writeFile(path.join(project, "BattleSprites", `${String(enemyId).padStart(3, "0")}.png`), TINY_PNG);
  }
  for (const backgroundId of [0, 3, 7, 8, 9, 10, 11, 12, 13, 14]) {
    await writeFile(path.join(project, "BattleBGs", `${String(backgroundId).padStart(3, "0")}.png`), TINY_PNG);
  }
}

function syntheticBattleEnemyYaml(id: number, name: string, bossFlag: boolean, level: number): string {
  return [
    `${id}:`,
    `  Name: ${name}`,
    `  HP: ${20 + level}`,
    `  Defense: ${3 + level}`,
    `  Offense: ${5 + level}`,
    `  Speed: ${level}`,
    `  Experience points: ${10 + level}`,
    `  Money: ${2 + level}`,
    `  Level: ${level}`,
    `  Boss Flag: ${bossFlag ? "True" : "False"}`,
    "  Action 1: 1",
    "  Action 1 Argument: 0",
    "  Action 2: 2",
    "  Action 2 Argument: 1",
    "  Action 3: 3",
    "  Action 3 Argument: 2",
    "  Action 4: 4",
    "  Action 4 Argument: 3",
    "  Item Dropped: 0",
    "  Item Rarity: 1/128"
  ].join("\n");
}

async function writeCharacterFixture(project: string): Promise<void> {
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
  await writeFile(path.join(project, "initial_stats.yml"), [
    "0:",
    "  Experience Points: 0",
    "  HP: 41",
    "  Items Possessed:",
    "  - 10",
    "  - 0",
    "  Level: 1",
    "  Money: 3",
    "  Offense: 6",
    "  PP: 12",
    "  Defense: 5",
    "  Speed: 4",
    "  Guts: 3",
    "  Vitality: 2",
    "  IQ: 1",
    "  Luck: 7",
    "1:",
    "  Experience Points: 100",
    "  Items Possessed:",
    "  - 0",
    "  - 11",
    "  Level: 4",
    "  Max HP: 63",
    "  Max PP: 14",
    "  Money: 0",
    "  Offense: 11",
    "  Defense: 10",
    "  Speed: 9",
    "  Guts: 8",
    "  Vitality: 7",
    "  IQ: 6",
    "  Luck: 5",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "stats_growth_vars.yml"), [
    "0:",
    "  Defense: 10",
    "  Guts: 10",
    "  IQ: 10",
    "  Luck: 10",
    "  Offense: 10",
    "  Speed: 10",
    "  Vitality: 10",
    "1:",
    "  Defense: 10",
    "  Guts: 10",
    "  IQ: 10",
    "  Luck: 10",
    "  Offense: 10",
    "  Speed: 10",
    "  Vitality: 10",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "exp_table.yml"), [
    "0:",
    "  Level 00 EXP: 0",
    "  Level 01 EXP: 0",
    "  Level 02 EXP: 5",
    "  Level 03 EXP: 25",
    "  Level 04 EXP: 100",
    "1:",
    "  Level 00 EXP: 0",
    "  Level 01 EXP: 0",
    "  Level 02 EXP: 5",
    "  Level 03 EXP: 25",
    "  Level 04 EXP: 100",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "playable_char_gfx_table.yml"), [
    "0:",
    "  Default Sprite Group: 1",
    "1:",
    "  Default Sprite Group: 2",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "psi_ability_table.yml"), "0:\n  Action: 0\n", "utf8");
  await writeFile(path.join(project, "psi_name_table.yml"), "0:\n  Name: Neutral PSI\n", "utf8");
  await writeFile(path.join(project, "naming_skip.yml"), [
    "Enable Skip: false",
    "Enable Summary: false",
    "Name1: ALPHA",
    "Name2: BETA",
    ""
  ].join("\n"), "utf8");
}

async function writeItemPsiFixture(project: string): Promise<void> {
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
  await writeFile(path.join(project, "item_configuration_table.yml"), [
    "10:",
    "  Action: 1",
    "  Argument: 0x02",
    "  Cost: 5",
    "  Help Text Pointer: synthetic_item_010",
    "  Misc Flags:",
    "  - flag-a",
    "  - flag-b",
    "  Name: \"[item 10 data]\"",
    "  Type: 0x10",
    "11:",
    "  Action: 3",
    "  Argument:",
    "  Cost: 7",
    "  Help Text Pointer: synthetic_item_011",
    "  Misc Flags:",
    "  Name: \"[item 11 data]\"",
    "  Type: 0x20",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "psi_ability_table.yml"), [
    "7:",
    "  Action: 10",
    "  Level learned by Slot A: 2",
    "  Level learned by Slot B: 0",
    "  Level learned by Slot C: 4",
    "  PSI Name: 0",
    "  Strength: stage-a",
    "  Type: assist",
    "  Usability Outside of Battle: outside",
    "8:",
    "  Action: 11",
    "  Level learned by Slot A: 0",
    "  Level learned by Slot B: 5",
    "  Level learned by Slot C: 0",
    "  PSI Name: 1",
    "  Strength: stage-b",
    "  Type: battle",
    "  Usability Outside of Battle: battle",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "psi_name_table.yml"), [
    "0:",
    "  Name: \"[psi 0 data]\"",
    "1:",
    "  Name: \"[psi 1 data]\"",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(project, "store_table.yml"), [
    "0x02:",
    "  Item 1: 10",
    "  Item 2: $0B",
    "  Item 3: 0",
    "  Item 4: 0",
    "3:",
    "  Item 1: 11",
    "  Item 2: 0",
    ""
  ].join("\n"), "utf8");
}

describe("CCScript parser v0", () => {
  it("parses tutorial-style hello_world text and end command", () => {
    const parsed = parseCcsFile("ccscript/robot.ccs", 'hello_world:\n    "@Hello World!" end\n');

    expect(parsed.labels).toEqual(["hello_world"]);
    expect(parsed.commands.map((command) => command.cmd)).toEqual(["label", "text", "end"]);
    expect(parsed.commands[1]).toMatchObject({ cmd: "text", value: "@Hello World!" });
  });

  it("preserves unknown commands", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", "hello_world:\nwarp_somewhere\n");

    expect(parsed.commands.at(-1)).toMatchObject({ cmd: "unknown", raw: "warp_somewhere" });
    expect(parsed.warnings.at(0)?.code).toBe("unknown_ccscript_command");
  });

  it("ignores blank lines and line comments outside quoted text", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", [
      "",
      "  // full-line comment",
      "hello_world: // inline comment",
      '  "http://example.test//kept" next // trailing comment',
      "",
      "end"
    ].join("\n"));

    expect(parsed.commands.map((command) => command.cmd)).toEqual(["label", "text", "next", "end"]);
    expect(parsed.commands[1]).toMatchObject({ value: "http://example.test//kept" });
  });

  it("captures flow command targets from mixed CCScript lines", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", [
      "start:",
      'call(other.target) "Synthetic inline text." next',
      "goto(local_target)",
      "local_target:",
      '"Synthetic target text." end'
    ].join("\n"));

    expect(parsed.commands.map((command) => command.cmd)).toEqual([
      "label",
      "control",
      "text",
      "next",
      "control",
      "label",
      "text",
      "end"
    ]);
    expect(parsed.commands[1]).toMatchObject({ cmd: "control", code: "call", target: "other.target" });
    expect(parsed.commands[4]).toMatchObject({ cmd: "control", code: "goto", target: "local_target" });
  });

  it("captures flow targets from text control macros", () => {
    expect(tokenizeCcsString("{goto(other.target)}")).toEqual([
      { kind: "control", code: "goto", raw: "{goto(other.target)}", target: "other.target" }
    ]);
  });

  it("captures branch targets from dumped pointer byte controls", () => {
    expect(tokenizeCcsString("[1B 02 {e(other.false_path)}][1B 03 {e(other.true_path)}]")).toEqual([
      { kind: "control", code: "branch_false", raw: "[1B 02 {e(other.false_path)}]", target: "other.false_path" },
      { kind: "control", code: "branch_true", raw: "[1B 03 {e(other.true_path)}]", target: "other.true_path" }
    ]);
  });

  it("captures high-level inline conditional block markers", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", [
      "start:",
      "if isset(7)",
      '"Then synthetic text."',
      "else",
      '"Else synthetic text."',
      "endif"
    ].join("\n"));

    expect(parsed.commands.map((command) => command.cmd)).toEqual([
      "label",
      "control",
      "text",
      "control",
      "text",
      "control"
    ]);
    expect(parsed.commands[1]).toMatchObject({ code: "if", raw: "if isset(7)" });
    expect(parsed.commands[3]).toMatchObject({ code: "else" });
    expect(parsed.commands[5]).toMatchObject({ code: "endif" });
  });
});

describe("CCScript text segments", () => {
  it("keeps plain text backward-compatible while adding one text segment", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", 'label:\n"Alpha words" end\n');
    const pages = buildDialoguePages(parsed.commands.slice(1));

    expect(parsed.commands[1]).toMatchObject({
      cmd: "text",
      value: "Alpha words",
      segments: [{ kind: "text", value: "Alpha words" }]
    });
    expect(pages).toEqual([
      {
        text: "Alpha words",
        ended: true,
        unknownCommands: [],
        segments: [{ kind: "text", value: "Alpha words" }]
      }
    ]);
  });

  it("drops one leading CCScript text sentinel while preserving the text run", () => {
    expect(tokenizeCcsString("@Hello there!")).toEqual([
      { kind: "text", value: "Hello there!" }
    ]);
    expect(tokenizeCcsString("Hello @there!")).toEqual([
      { kind: "text", value: "Hello @there!" }
    ]);
    expect(tokenizeCcsString("@@Hello there!")).toEqual([
      { kind: "text", value: "@Hello there!" }
    ]);
    expect(tokenizeCcsString("@First[00]@Second")).toEqual([
      { kind: "text", value: "First" },
      { kind: "break", break: "line" },
      { kind: "text", value: "Second" }
    ]);
  });

  it("flattens linebreak and newline segments to newlines", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", 'label:\n"Alpha[00]Beta[01]Gamma" end\n');
    const pages = buildDialoguePages(parsed.commands.slice(1));

    expect(pages[0]).toMatchObject({
      text: "Alpha\nBeta\nGamma",
      segments: [
        { kind: "text", value: "Alpha" },
        { kind: "break", break: "line" },
        { kind: "text", value: "Beta" },
        { kind: "break", break: "newline" },
        { kind: "text", value: "Gamma" }
      ]
    });
  });

  it("splits pages on prompt and wait segments", () => {
    const promptParsed = parseCcsFile("ccscript/example.ccs", 'label:\n"Alpha[14]Beta" end\n');
    const waitParsed = parseCcsFile("ccscript/example.ccs", 'label:\n"One[13]Two" end\n');

    expect(buildDialoguePages(promptParsed.commands.slice(1)).map((page) => page.text)).toEqual(["Alpha", "Beta"]);
    expect(buildDialoguePages(waitParsed.commands.slice(1)).map((page) => page.text)).toEqual(["One", "Two"]);
  });

  it("parses pause frame counts", () => {
    expect(tokenizeCcsString("Alpha[10 2A]Beta")).toContainEqual({ kind: "pause", frames: 42 });
  });

  it("parses name, number, and item substitutions with numeric args", () => {
    const substitutions = tokenizeCcsString("[1C 02 02][1C 0A 2A 00 00 00][1C 05 07]")
      .filter((segment) => segment.kind === "substitution");

    expect(substitutions).toEqual([
      { kind: "substitution", name: "partyChar", args: [2] },
      { kind: "substitution", name: "number", args: [42] },
      { kind: "substitution", name: "item", args: [7] }
    ]);
  });

  it("preserves unknown byte codes as raw control segments", () => {
    expect(tokenizeCcsString("[FE AA]")).toEqual([{ kind: "control", code: "unknown", raw: "[FE AA]" }]);
  });

  it("types functional event byte codes without losing raw bytes", () => {
    expect(tokenizeCcsString("[1D 00 02 09][1D 06 05 00 00 00][1D 07 03 00 00 00][1F 00 00 07][1F 21 03][1F 23 34 12][1F 83 02 00]")).toEqual([
      { kind: "give", char: 2, item: 9, raw: "[1D 00 02 09]" },
      { kind: "atm", op: "deposit", amount: 5, raw: "[1D 06 05 00 00 00]" },
      { kind: "atm", op: "withdraw", amount: 3, raw: "[1D 07 03 00 00 00]" },
      { kind: "music", op: "play", track: 7, raw: "[1F 00 00 07]" },
      { kind: "warp", dest: 3, raw: "[1F 21 03]" },
      { kind: "battle", group: 0x1234, raw: "[1F 23 34 12]" },
      { kind: "shop", storeId: 2, raw: "[1F 83 02 00]" }
    ]);
  });

  it("types functional event macros and top-level command parts", () => {
    expect(tokenizeCcsString("{set(0x22)}{party_add(3)}{deposit(50)}{withdraw(10)}{shop(2)}{music_stop}{anchor_warp}")).toEqual([
      { kind: "setFlag", flag: 0x22, raw: "{set(0x22)}" },
      { kind: "party", op: "add", char: 3, raw: "{party_add(3)}" },
      { kind: "atm", op: "deposit", amount: 50, raw: "{deposit(50)}" },
      { kind: "atm", op: "withdraw", amount: 10, raw: "{withdraw(10)}" },
      { kind: "shop", storeId: 2, raw: "{shop(2)}" },
      { kind: "music", op: "stop", raw: "{music_stop}" },
      { kind: "anchorWarp", raw: "{anchor_warp}" }
    ]);

    const parsed = parseCcsFile("ccscript/example.ccs", "label:\ngive(1,2) music_resume warp(4)\n");
    expect(parsed.commands.slice(1).map((command) => command.segments?.[0])).toEqual([
      { kind: "give", char: 1, item: 2, raw: "{give(1,2)}" },
      { kind: "music", op: "resume", raw: "{music_resume}" },
      { kind: "warp", dest: 4, raw: "{warp(4)}" }
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it("stops dialogue pages on embedded terminators", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", 'label:\n"Alpha[13 02]Beta"\n"Gamma" end\n');
    const pages = buildDialoguePages(parsed.commands.slice(1));

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ text: "Alpha", ended: true });
  });

  it("builds multiple pages via bare next and embedded next", () => {
    const bareNext = parseCcsFile("ccscript/example.ccs", 'label:\n"Alpha" next\n"Beta" end\n');
    const embeddedNext = parseCcsFile("ccscript/example.ccs", 'label:\n"One[03 00]Two" end\n');

    expect(buildDialoguePages(bareNext.commands.slice(1)).map((page) => page.text)).toEqual(["Alpha", "Beta"]);
    expect(buildDialoguePages(embeddedNext.commands.slice(1)).map((page) => page.text)).toEqual(["One", "Two"]);
  });

  it("keeps the tutorial robot and greeter pages byte-identical between linear and flow resolution", async () => {
    const source = await readFile("external/coilsnake-project/ccscript/robot.ccs", "utf8");
    const parsed = parseCcsFile("ccscript/robot.ccs", source);
    const scriptCollection: ScriptCollection = {
      schemaVersion: "test",
      sourceProjectPath: "external/coilsnake-project",
      files: [{
        path: "ccscript/robot.ccs",
        commands: parsed.commands,
        labels: parsed.labels,
        counts: {
          commands: parsed.commands.length,
          labels: parsed.labels.length,
          textCommands: parsed.commands.filter((command) => command.cmd === "text").length,
          unknownCommands: parsed.commands.filter((command) => command.cmd === "unknown").length
        },
        warnings: parsed.warnings
      }],
      counts: {
        files: 1,
        commands: parsed.commands.length,
        labels: parsed.labels.length,
        textCommands: parsed.commands.filter((command) => command.cmd === "text").length,
        unknownCommands: parsed.commands.filter((command) => command.cmd === "unknown").length
      },
      warnings: parsed.warnings
    };

    for (const reference of ["robot.hello_world", "robot.greeter"]) {
      const legacy = resolveScriptReference(scriptCollection, reference);
      const flow = resolveScriptReferenceFlow(scriptCollection, reference);
      const events = resolveScriptEvents(scriptCollection, reference);

      expect(flow?.truncated).toBe(false);
      expect(Buffer.compare(
        Buffer.from(JSON.stringify(buildDialoguePages(flow?.commands ?? []))),
        Buffer.from(JSON.stringify(buildDialoguePages(legacy?.commands ?? [])))
      )).toBe(0);
      expect(events?.effects.at(-1)?.kind).toBe("terminator");
      expect(events?.effects.every((effect) => effect.kind === "text" || effect.kind === "terminator")).toBe(true);
    }
  });
});

describe("fixture hints", () => {
  it("detects tutorial files without using real extracted data", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-converter-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");
      await writeFile(path.join(project, "SpriteGroups", "005.png"), pngStub(), "binary");

      const result = await convertProject({ project, out: path.join(temp, "generated") });

      expect(result.manifest.sourceProject.tutorialFixtureHints).toMatchObject({
        hasRobotCcs: true,
        hasHelloWorldLabel: true,
        hasRobotHelloWorldContent: true,
        hasSpriteGroup005: true
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("tutorial status", () => {
  it("audits tutorial requirements without mutating fixture files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-tutorial-status-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");
      await writeFile(path.join(project, "SpriteGroups", "005.png"), pngStub(), "binary");
      await writeFile(path.join(project, "tutorial-fixture-npc-reference.yml"), "script: robot.hello_world\n", "utf8");
      await writeFile(path.join(project, "npc_config_table.yml"), [
        "744:",
        "  Direction: down",
        "  Event Flag: 0",
        "  Movement: 605",
        "  Show Sprite: always",
        "  Sprite: 5",
        "  Text Pointer 1: robot.hello_world",
        "  Text Pointer 2: $0",
        "  Type: person",
        ""
      ].join("\n"), "utf8");
      await writeFile(path.join(project, "map_sprites.yml"), "group:\n  - {NPC ID: 744, X: 136, Y: 128}\n", "utf8");

      const result = await convertProject({ project, out: path.join(temp, "generated") });
      const status = TutorialStatusSchema.parse(result.tutorialStatus);
      const byId = Object.fromEntries(status.steps.map((step) => [step.id, step.status]));

      expect(byId.hello_world_text).toBe("pass");
      expect(byId.npc_744_event_flag).toBe("pass");
      expect(byId.npc_744_dialogue).toBe("pass");
      expect(byId.map_sprites_npc_744).toBe("pass");
      expect(byId.rom_compile_run).toBe("blocked");
      expect(status.counts.blocked).toBe(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("marks compile and run complete when local-only proof exists", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-tutorial-proof-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");
      await writeFile(path.join(project, "SpriteGroups", "005.png"), pngStub(), "binary");
      await writeFile(path.join(project, "tutorial-fixture-npc-reference.yml"), "script: robot.hello_world\n", "utf8");
      await writeFile(path.join(project, "tutorial-run-proof.json"), JSON.stringify({
        compileSucceeded: true,
        bootVerified: true,
        emulator: "Snes9x",
        reviewUrl: "https://github.com/example/repo/pull/1#issuecomment-1"
      }), "utf8");
      await writeFile(path.join(project, "npc_config_table.yml"), [
        "744:",
        "  Event Flag: 0x0",
        "  Movement: 605",
        "  Show Sprite: always",
        "  Sprite: 5",
        "  Text Pointer 1: robot.hello_world",
        "  Type: person",
        ""
      ].join("\n"), "utf8");
      await writeFile(path.join(project, "map_sprites.yml"), "group:\n  - {NPC ID: 744, X: 136, Y: 128}\n", "utf8");

      const result = await convertProject({ project, out: path.join(temp, "generated") });
      const compileStep = result.tutorialStatus.steps.find((step) => step.id === "rom_compile_run");

      expect(compileStep).toMatchObject({
        status: "pass",
        actual: "https://github.com/example/repo/pull/1#issuecomment-1"
      });
      expect(result.tutorialStatus.counts.blocked).toBe(0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("proof invariant helpers", () => {
  it("treats quoted and unquoted $0 map-door text pointers as neutralized", () => {
    expect(isNeutralizedMapDoorPointer("$0")).toBe(true);
    expect(isNeutralizedMapDoorPointer('"$0"')).toBe(true);
    expect(isNeutralizedMapDoorPointer("'$0'")).toBe(true);
    expect(isNeutralizedMapDoorPointer("robot.hello_world")).toBe(false);
    expect(isNeutralizedMapDoorPointer("$c9ae59")).toBe(false);
  });

  it("extracts NPC 744 outer and inner map sprite groups", () => {
    const placements = findNpc744Placements([
      "27:",
      "  28:",
      "  29:",
      "  - NPC ID: 706",
      "    X: 192",
      "    Y: 216",
      "  31:",
      "  - NPC ID: 744",
      "    X: 168",
      "    Y: 200",
      ""
    ].join("\n"));

    expect(placements).toEqual([
      { line: 8, outer: "27", inner: "31", x: "168", y: "200" }
    ]);
  });

  it("classifies proof target placements", () => {
    expect(classifyProofTarget([{ line: 1, outer: "4", inner: "31", x: "64", y: "64" }])).toBe("bedroom");
    expect(classifyProofTarget([{ line: 1, outer: "27", inner: "29", x: "192", y: "216" }])).toBe("roadblock-706");
    expect(classifyProofTarget([{ line: 1, outer: "27", inner: "31", x: "168", y: "200" }])).toBe("roadblock-707");
    expect(classifyProofTarget([{ line: 1, outer: "1", inner: "2", x: "3", y: "4" }])).toBe("custom");
    expect(classifyProofTarget([])).toBe("missing");
  });

  it("sanitizes absolute repo paths from local proof packets", () => {
    const output = sanitizePacketOutput(`${process.cwd()}/packages/eb-converter`);
    expect(output).toBe("<repo>/packages/eb-converter");
  });

  it("selects placement-specific proof packet checks", () => {
    expect(checkCommandForMode("bedroom")).toEqual(["proof:check:bedroom"]);
    expect(checkCommandForMode("roadblock-706")).toEqual(["proof:check:roadblock-706"]);
    expect(checkCommandForMode("roadblock-706-clean-doors")).toEqual(["proof:check:roadblock-706-clean-doors"]);
    expect(checkCommandForMode("27/29:192,216")).toEqual(["proof:check", "--", "--expect-placement", "27/29:192,216"]);
  });

  it("detects forbidden public proof artifact text", () => {
    expect(findForbiddenProofArtifactText("safe relative path")).toBeUndefined();
    expect(findForbiddenProofArtifactText("path /Users/example")).toBe("/Users/");
    expect(findForbiddenProofArtifactText("compiled first-hack output")).toBe("first-hack");
    expect(findForbiddenProofArtifactText("rom file .sfc")).toBe(".sfc");
  });

  it("recommends the next proof command for classified targets", () => {
    const bedroom = proofRecommendation("bedroom");
    const roadblock = proofRecommendation("roadblock-706");
    const cleanRoadblock = proofRecommendation("roadblock-706", { allowMapDoorText: true });
    expect(bedroom.recommendedCommand).toBe("pnpm proof:packet:bedroom");
    expect(roadblock.recommendedCommand).toBe("pnpm proof:packet:roadblock-706");
    expect(cleanRoadblock.recommendedCommand).toBe("pnpm proof:packet:roadblock-706-clean-doors");
    expect(proofRecommendation("custom").nextAction).toContain("custom");
  });
});

function pngStub(): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(16, 16);
  buffer.writeUInt32BE(24, 20);
  return buffer;
}
