import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  SwagboundDialogueLibrarySchema,
  type SwagboundDialogueLibrary
} from "../packages/eb-schemas/src/index";

// Vendored in-repo (see vendor/README.md). Override with arg 1 or $SWAGBOUND_DIALOGUE_DIR to
// re-import from the upstream swagbound-phaser checkout instead.
export const DEFAULT_CORPUS_DIR = "vendor/swagbound-dialogue";
export const DEFAULT_LIBRARY_OUTPUT = "content/swagbound-dialogue-library.json";
export const GENERATED_FROM = "swagbound-phaser structured dialogue";
export const CONTENT_DIALOGUE_FILE = "content-dialogue.json";
export const INTERIOR_INTERACTIONS_FILE = "interior-interactions.v1.json";
const HERO_NAME_PATTERN = /\{heroName\}/g;
const INTERIOR_PAGE_MAX_CHARS = 120;

const DialogueNodeSchema = z.object({
  id: z.string(),
  lines: z.array(z.string()),
  nextNodeId: z.string().optional(),
  choices: z.array(z.unknown()).optional(),
  outcomeId: z.string().optional()
}).passthrough();

const DialogueDefinitionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  speaker: z.string(),
  startNodeId: z.string(),
  nodes: z.array(DialogueNodeSchema)
}).passthrough();

const DialogueContentSourceSchema = z.object({
  schema: z.string().optional(),
  dialogues: z.array(DialogueDefinitionSchema).default([])
}).passthrough();

const TextInteractionSchema = z.object({
  id: z.string().optional(),
  speaker: z.string(),
  text: z.string()
}).passthrough();

const InteriorInteractionsSourceSchema = z.object({
  schema: z.string().optional(),
  interactions: z.record(TextInteractionSchema).default({}),
  targets: z.record(TextInteractionSchema).default({}),
  fallback: z.unknown().optional()
}).passthrough();

export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueDefinition = z.infer<typeof DialogueDefinitionSchema>;
export type DialogueContentSource = z.infer<typeof DialogueContentSourceSchema>;
export type TextInteraction = z.infer<typeof TextInteractionSchema>;
export type InteriorInteractionsSource = z.infer<typeof InteriorInteractionsSourceSchema>;

export type ImportInputs = {
  dialogueContent?: DialogueContentSource;
  interiorInteractions?: InteriorInteractionsSource;
};

export type ImportBuildResult = {
  library: SwagboundDialogueLibrary;
  choiceBranchesDropped: number;
};

export type ImportRunSummary = {
  corpusDir: string;
  outputPath: string;
  filesRead: string[];
  entriesWritten: number;
  choiceBranchesDropped: number;
};

type DialogueLibraryEntry = SwagboundDialogueLibrary["entries"][string];

export function substituteHeroName(text: string): string {
  return text.replace(HERO_NAME_PATTERN, "Bosch");
}

function normalizeInteriorText(text: string): string {
  return substituteHeroName(text).replace(/\s+/g, " ").trim();
}

function sentenceChunks(text: string): string[] {
  return text
    .match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)
    ?.map((chunk) => chunk.trim())
    .filter(Boolean) ?? [];
}

function wordChunks(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function paginateInteriorText(text: string, maxChars = INTERIOR_PAGE_MAX_CHARS): string[] {
  const normalized = normalizeInteriorText(text);
  if (!normalized) {
    return [];
  }

  const pages: string[] = [];
  let current = "";
  for (const sentence of sentenceChunks(normalized)) {
    const sentenceParts = sentence.length <= maxChars ? [sentence] : wordChunks(sentence, maxChars);
    for (const part of sentenceParts) {
      if (!current) {
        current = part;
      } else if (`${current} ${part}`.length <= maxChars) {
        current = `${current} ${part}`;
      } else {
        pages.push(current);
        current = part;
      }
    }
  }
  if (current) {
    pages.push(current);
  }
  return pages;
}

export function flattenStartNodeSpine(dialogue: DialogueDefinition): {
  pages: string[];
  choiceBranchesDropped: number;
} {
  const nodesById = new Map(dialogue.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const pages: string[] = [];
  let choiceBranchesDropped = 0;
  let node = nodesById.get(dialogue.startNodeId);

  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    choiceBranchesDropped += node.choices?.length ?? 0;
    pages.push(...node.lines.map(substituteHeroName));
    node = node.nextNodeId ? nodesById.get(node.nextNodeId) : undefined;
  }

  return { pages, choiceBranchesDropped };
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function stableLibrary(entries: Record<string, DialogueLibraryEntry>): SwagboundDialogueLibrary {
  const sorted: Record<string, DialogueLibraryEntry> = {};
  for (const [id, entry] of sortedEntries(entries)) {
    sorted[id] = entry;
  }
  return SwagboundDialogueLibrarySchema.parse({
    schema: "swagbound.dialogue-library.v1",
    generatedFrom: GENERATED_FROM,
    entries: sorted
  });
}

export function buildSwagboundDialogueLibrary(inputs: ImportInputs): ImportBuildResult {
  const entries: Record<string, DialogueLibraryEntry> = {};
  let choiceBranchesDropped = 0;

  if (inputs.interiorInteractions) {
    for (const [key, interaction] of sortedEntries(inputs.interiorInteractions.interactions)) {
      const pages = paginateInteriorText(interaction.text);
      if (pages.length > 0) {
        entries[`interior:${key}`] = { speaker: interaction.speaker, pages };
      }
    }
    for (const [key, target] of sortedEntries(inputs.interiorInteractions.targets)) {
      const pages = paginateInteriorText(target.text);
      if (pages.length > 0) {
        entries[`target:${key}`] = { speaker: target.speaker, pages };
      }
    }
  }

  if (inputs.dialogueContent) {
    const dialogues = [...inputs.dialogueContent.dialogues]
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const dialogue of dialogues) {
      const flattened = flattenStartNodeSpine(dialogue);
      choiceBranchesDropped += flattened.choiceBranchesDropped;
      if (flattened.pages.length > 0) {
        entries[`dialogue:${dialogue.id}`] = {
          speaker: dialogue.speaker,
          pages: flattened.pages
        };
      }
    }
  }

  return {
    library: stableLibrary(entries),
    choiceBranchesDropped
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalSource<T>(
  path: string,
  schema: { parse(value: unknown): T }
): Promise<T | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }
  return schema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function importSwagboundDialogue(
  corpusDir = DEFAULT_CORPUS_DIR,
  outputPath = DEFAULT_LIBRARY_OUTPUT
): Promise<ImportRunSummary> {
  const contentDialoguePath = resolve(corpusDir, CONTENT_DIALOGUE_FILE);
  const interiorInteractionsPath = resolve(corpusDir, INTERIOR_INTERACTIONS_FILE);
  const [dialogueContent, interiorInteractions] = await Promise.all([
    readOptionalSource(contentDialoguePath, DialogueContentSourceSchema),
    readOptionalSource(interiorInteractionsPath, InteriorInteractionsSourceSchema)
  ]);
  const filesRead = [
    dialogueContent ? CONTENT_DIALOGUE_FILE : undefined,
    interiorInteractions ? INTERIOR_INTERACTIONS_FILE : undefined
  ].filter((item): item is string => Boolean(item));
  const result = buildSwagboundDialogueLibrary({ dialogueContent, interiorInteractions });
  const serialized = `${JSON.stringify(result.library, null, 2)}\n`;
  if (serialized.includes("/Users/")) {
    throw new Error("Generated dialogue library contains an absolute /Users path.");
  }
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serialized, "utf8");
  return {
    corpusDir,
    outputPath: target,
    filesRead,
    entriesWritten: Object.keys(result.library.entries).length,
    choiceBranchesDropped: result.choiceBranchesDropped
  };
}

async function main(): Promise<void> {
  const summary = await importSwagboundDialogue(process.argv[2] ?? process.env.SWAGBOUND_DIALOGUE_DIR ?? DEFAULT_CORPUS_DIR);
  console.log(JSON.stringify({
    ok: true,
    generatedFrom: GENERATED_FROM,
    output: DEFAULT_LIBRARY_OUTPUT,
    filesRead: summary.filesRead,
    entriesWritten: summary.entriesWritten,
    choiceBranchesDropped: summary.choiceBranchesDropped
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
