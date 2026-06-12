import {
  buildDialoguePages,
  ManifestSchema,
  NpcReferenceCollectionSchema,
  resolveScriptReference,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  SpriteSheetCollectionSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  WorldRegionSchema,
  type DialoguePage,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TutorialStatus,
  type ValidationReport,
  type WorldRegion
} from "@eb/schemas";

export const TARGET_REFERENCE = "robot.hello_world";

export type GameData = {
  manifest: Manifest;
  scripts?: ScriptCollection;
  npcs?: NpcReferenceCollection;
  spriteGroups?: SpriteGroupCollection;
  tutorialStatus?: TutorialStatus;
  validationReport?: ValidationReport;
  world?: WorldRegion;
  sprites?: SpriteSheetCollection;
};

async function loadJson<T>(url: string, schema: { parse: (value: unknown) => T }): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    return schema.parse(await response.json());
  } catch {
    return undefined;
  }
}

/** Loads every generated file referenced by an already-validated manifest. */
export async function loadGameData(manifest: Manifest): Promise<GameData> {
  const [scripts, npcs, spriteGroups, tutorialStatus, validationReport, world, sprites] = await Promise.all([
    loadJson(`/generated/${manifest.files.scripts}`, ScriptCollectionSchema),
    loadJson(`/generated/${manifest.files.npcs}`, NpcReferenceCollectionSchema),
    loadJson(`/generated/${manifest.files.spriteGroups}`, SpriteGroupCollectionSchema),
    loadJson(`/generated/${manifest.files.tutorialStatus}`, TutorialStatusSchema),
    loadJson(`/generated/${manifest.files.validationReport}`, ValidationReportSchema),
    loadJson(`/generated/${manifest.files.world}`, WorldRegionSchema),
    loadJson(`/generated/${manifest.files.sprites}`, SpriteSheetCollectionSchema)
  ]);
  return { manifest, scripts, npcs, spriteGroups, tutorialStatus, validationReport, world, sprites };
}

export function parseManifest(raw: unknown): Manifest | undefined {
  const result = ManifestSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function chooseReference(data: GameData): string {
  if (hasNpcReference(data.npcs, TARGET_REFERENCE)) {
    return TARGET_REFERENCE;
  }
  if (data.scripts && resolveScriptReference(data.scripts, TARGET_REFERENCE)) {
    return TARGET_REFERENCE;
  }
  return data.npcs?.references[0]?.reference ?? TARGET_REFERENCE;
}

export function buildDialogueForReference(scripts: ScriptCollection | undefined, reference: string): DialoguePage[] {
  if (!scripts) {
    return [{ text: "Generated scripts.json could not be loaded.", ended: true, unknownCommands: [] }];
  }
  const resolved = resolveScriptReference(scripts, reference);
  if (!resolved) {
    return [{ text: "No imported script text was found.", ended: true, unknownCommands: [] }];
  }
  return buildDialoguePages(resolved.commands);
}

export function hasNpcReference(npcs: NpcReferenceCollection | undefined, reference: string): boolean {
  return Boolean(npcs?.references.some((item) => item.reference === reference));
}

export function resolveStatus(data: GameData): string {
  const scriptResolved = data.scripts ? Boolean(resolveScriptReference(data.scripts, TARGET_REFERENCE)) : false;
  const npcResolved = hasNpcReference(data.npcs, TARGET_REFERENCE);
  if (scriptResolved && npcResolved) {
    return "script + npc ref";
  }
  if (scriptResolved) {
    return "script only";
  }
  if (npcResolved) {
    return "npc ref only";
  }
  return "missing";
}

export function buildStatusLines(data: GameData): string[] {
  const manifest = data.manifest;
  const world = data.world;
  const worldLine = world?.available && world.region
    ? `World: ${world.region.widthTiles}x${world.region.heightTiles} tiles @ (${world.region.originTile.x},${world.region.originTile.y}) | NPCs: ${world.counts.visibleNpcs}/${world.counts.npcs}`
    : "World: unavailable (run pnpm convert with the local fixture)";
  return [
    "Your First Hack: CoilSnake Import",
    `Project: ${manifest.sourceProject.exists ? "found" : "missing"} | Project.snake: ${manifest.sourceProject.hasProjectSnake ? "found" : "missing"}`,
    `Scripts: ${manifest.counts.scriptFiles} files, ${manifest.counts.scriptCommands} commands`,
    `Labels: ${manifest.counts.labels} | Text: ${manifest.counts.textCommands} | Unknown: ${manifest.counts.unknownCommands}`,
    `NPC refs: ${manifest.counts.npcReferences} | robot.hello_world: ${resolveStatus(data)}`,
    worldLine,
    `Tutorial: ${tutorialSummary(data.tutorialStatus)}`,
    `Validation issues: ${data.validationReport?.issues.length ?? manifest.counts.warnings + manifest.counts.errors}`
  ];
}

export function buildMetadataLines(data: GameData): string[] {
  const spriteGroups = data.spriteGroups;
  const sprite005 = spriteGroups?.images.find((image) => image.path === "SpriteGroups/005.png");
  return [
    "Imported Asset Pipeline",
    `Sprite PNGs indexed: ${spriteGroups?.counts.images ?? 0}`,
    `SpriteGroups/005.png: ${sprite005 ? "detected" : "not detected"}`,
    `Sheets copied: ${data.sprites?.counts.sheets ?? 0}`,
    `World render: ${data.world?.available ? "background + foreground PNG" : "skipped"}`,
    "Asset rendering: local-only, gitignored"
  ];
}

export function tutorialSummary(tutorialStatus: TutorialStatus | undefined): string {
  if (!tutorialStatus) {
    return "status unavailable";
  }
  const counts = tutorialStatus.counts;
  return `${counts.passed}/${counts.steps} pass, ${counts.failed} gaps, ${counts.blocked} blocked`;
}
