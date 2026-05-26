import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ManifestSchema,
  NpcReferenceCollectionSchema,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  ValidationReportSchema
} from "@eb/schemas";

const DEFAULT_OUT = "apps/game/public/generated";

function parseOut(argv: string[]): string {
  const outIndex = argv.indexOf("--out");
  return outIndex >= 0 ? argv[outIndex + 1] ?? DEFAULT_OUT : DEFAULT_OUT;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

export type GeneratedValidationResult = {
  ok: boolean;
  manifest?: "valid";
  generatedFiles?: string[];
  counts?: unknown;
  validation?: unknown;
  scriptFiles?: number;
  npcReferences?: number;
  spriteImages?: number;
};

export async function validateGeneratedOutput(outInput = DEFAULT_OUT): Promise<GeneratedValidationResult> {
  const out = resolveFromRoot(outInput);
  const manifestPath = path.join(out, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(JSON.stringify({
      severity: "error",
      code: "missing_manifest",
      message: "Generated manifest.json is missing.",
      path: "manifest.json"
    }));
  }

  const manifest = ManifestSchema.parse(await readJson(manifestPath));
  const scripts = ScriptCollectionSchema.parse(await readJson(path.join(out, manifest.files.scripts)));
  const npcs = NpcReferenceCollectionSchema.parse(await readJson(path.join(out, manifest.files.npcs)));
  const spriteGroups = SpriteGroupCollectionSchema.parse(await readJson(path.join(out, manifest.files.spriteGroups)));
  const validationReport = ValidationReportSchema.parse(await readJson(path.join(out, manifest.files.validationReport)));

  return {
    ok: true,
    manifest: "valid",
    generatedFiles: ["manifest.json", manifest.files.scripts, manifest.files.npcs, manifest.files.spriteGroups, manifest.files.validationReport],
    counts: manifest.counts,
    validation: validationReport.counts,
    scriptFiles: scripts.counts.files,
    npcReferences: npcs.counts.references,
    spriteImages: spriteGroups.counts.images
  };
}

async function main(): Promise<void> {
  const result = await validateGeneratedOutput(parseOut(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

function resolveFromRoot(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), inputPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const parsedError = parseValidationError(error);
    console.error(JSON.stringify({
      ok: false,
      errors: [parsedError]
    }, null, 2));
    process.exitCode = 1;
  });
}

function parseValidationError(error: unknown): { severity: "error"; code: string; message: string; path?: string } {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.code === "missing_manifest") {
        return parsed;
      }
    } catch {
      // Fall through to schema/JSON error reporting.
    }
    return { severity: "error", code: "invalid_generated_json", message: error.message };
  }
  return { severity: "error", code: "invalid_generated_json", message: String(error) };
}
