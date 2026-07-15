#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
 accessSync,
 constants,
 copyFileSync,
 existsSync,
 mkdirSync,
 mkdtempSync,
 readFileSync,
 rmSync,
 writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");
const WALK_ANIMATIONS = {
 down: [0, 1],
 left: [0, 1],
 right: [0, 1],
 up: [0, 1]
};

function usage(exitCode = 2) {
 console.error(`Usage:
  node scripts/adopt-ow-walkframes.mjs --run-dir <path> --approval <path> [--dry-run] [--only <id>] [--repo-root <path>]

Options:
  --run-dir <path>    Asset-lab overnight run directory containing queue.json.
  --approval <path>   Deletion-marks or approval manifest.
  --dry-run           Print the adoption plan without writing assets or JSON.
  --only <id>         Adopt one item id, review key, or original image basename.
  --repo-root <path>  Game repo root. Defaults to this checkout.`);
 process.exit(exitCode);
}

function parseArgs(argv) {
 const args = {
  repoRoot: defaultRepoRoot,
  dryRun: false,
  only: null,
  runDir: null,
  approval: null
 };
 for (let i = 2; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--dry-run") {
   args.dryRun = true;
  } else if (arg === "--only") {
   args.only = argv[++i] || usage();
  } else if (arg === "--repo-root") {
   args.repoRoot = path.resolve(argv[++i] || usage());
  } else if (arg === "--run-dir") {
   args.runDir = path.resolve(argv[++i] || usage());
  } else if (arg === "--approval" || arg === "--approval-manifest" || arg === "--marks") {
   args.approval = path.resolve(argv[++i] || usage());
  } else if (arg === "--help" || arg === "-h") {
   usage(0);
  } else {
   console.error(`Unknown argument: ${arg}`);
   usage();
  }
 }
 if (!args.runDir || !args.approval) usage();
 return args;
}

function readJson(filePath) {
 return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
 writeFileSync(filePath, `${JSON.stringify(data, null, 1)}\n`);
}

function sha256(filePath) {
 return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function canRead(filePath) {
 try {
  accessSync(filePath, constants.R_OK);
  return true;
 } catch {
  return false;
 }
}

function pngSize(filePath) {
 const buf = readFileSync(filePath);
 if (
  buf.length < 24 ||
  buf[0] !== 0x89 ||
  buf[1] !== 0x50 ||
  buf[2] !== 0x4e ||
  buf[3] !== 0x47
 ) {
  throw new Error(`not a PNG: ${filePath}`);
 }
 return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function resolveMaybe(baseDirs, value) {
 if (!value || typeof value !== "string") return null;
 if (path.isAbsolute(value)) return value;
 for (const base of baseDirs) {
  const candidate = path.resolve(base, value);
  if (existsSync(candidate)) return candidate;
 }
 return path.resolve(baseDirs[0], value);
}

function vaultRootFromRunDir(runDir) {
 const parts = path.resolve(runDir).split(path.sep);
 const idx = parts.lastIndexOf("asset-lab");
 if (idx <= 0) return path.dirname(runDir);
 return parts.slice(0, idx).join(path.sep) || path.sep;
}

function collectQueueItems(runDir) {
 const queuePath = path.join(runDir, "queue.json");
 if (!existsSync(queuePath)) return new Map();
 const queue = readJson(queuePath);
 const out = new Map();
 for (const item of queue.items || []) {
  if (!item || !item.id) continue;
  out.set(item.id, item);
  if (item.reviewKey) out.set(item.reviewKey, item);
 }
 return out;
}

function collectApprovedKeys(approval) {
 const keys = new Set();
 const items = new Map();
 for (const value of approval.promoteKeys || approval.approvedKeys || approval.approved || approval.approvedIds || []) {
  if (typeof value === "string") keys.add(value);
 }
 for (const item of approval.items || approval.decisions || []) {
  if (!item || typeof item !== "object") continue;
  const id = item.id || item.key || item.reviewKey;
  if (!id) continue;
  items.set(id, item);
  const decision = String(item.decision || item.status || "").toLowerCase();
  const approved = item.approved === true || item.approve === true || item.approveOverworld === true;
  const rejected = item.delete === true || item.deleted === true || decision === "delete" || decision === "reject";
  if (approved || decision === "promote" || decision === "approved" || decision === "keep") {
   keys.add(id);
  } else if (!rejected && approval.schema?.includes("DeletionMarks") !== true) {
   keys.add(id);
  }
 }
 return { keys, items };
}

function itemIdFromKey(key) {
 return String(key).split("/").pop();
}

function originalImageForItem(item, approvalItem) {
 return (
  approvalItem?.originalImage ||
  approvalItem?.original ||
  approvalItem?.image ||
  item?.image ||
  item?.originalImage ||
  item?.sourceImage ||
  item?.runtimeImage
 );
}

function stepFields(item, approvalItem) {
 return [
  approvalItem?.stepFrame,
  approvalItem?.stepFramePath,
  approvalItem?.step48,
  approvalItem?.step,
  approvalItem?.output,
  approvalItem?.path,
  item?.stepFrame,
  item?.stepFramePath,
  item?.step48,
  item?.rawStepFrame,
  item?.output,
  item?.paths?.stepFrame,
  item?.paths?.rawStepFrame
 ].filter(Boolean);
}

function findStepFrame(runDir, runId, vaultRoot, id, item, approvalItem) {
 const bases = [path.dirname(runDir), runDir, vaultRoot, path.dirname(args.approval)];
 for (const field of stepFields(item, approvalItem)) {
  const resolved = resolveMaybe(bases, field);
  if (resolved && existsSync(resolved)) return resolved;
 }
 const candidates = [
  path.join(runDir, "outputs", id, "step-48.png"),
  path.join(runDir, "outputs", id, "step.png"),
  path.join(runDir, "outputs", id, "step-raw.png"),
  path.join(runDir, "generated", id, "step-raw.png"),
  path.join(vaultRoot, "asset-lab", "curation", "good-new-sprites", runId, id, "step-48.png"),
  path.join(vaultRoot, "asset-lab", "generated", "raw", "good-new-sprites", runId, id, "step-raw.png")
 ];
 return candidates.find((candidate) => existsSync(candidate)) || null;
}

function imageAllowed(image) {
 return (
  image.startsWith("assets/swagbound/overworld-npc/") ||
  image.startsWith("assets/swagbound/hero/")
 );
}

function rewriteEntries(overrides, originalImage, newImage) {
 const touched = [];
 for (const section of ["byNpcId", "bySpriteGroup", "overworldByEnemyId"]) {
  const group = overrides[section] || {};
  for (const [key, entry] of Object.entries(group)) {
   if (!entry || entry.image !== originalImage) continue;
   entry.image = newImage;
   entry.frameWidth = 48;
   entry.frameHeight = 48;
   entry.animations = { ...WALK_ANIMATIONS };
   touched.push({ section, key });
  }
 }
 return touched;
}

function outputImagePath(originalImage) {
 const dir = path.posix.dirname(originalImage);
 const ext = path.posix.extname(originalImage);
 const base = path.posix.basename(originalImage, ext).replace(/-walk2$/, "");
 return `${dir}/${base}-walk2.png`;
}

function normalizeWithSips(input, output) {
 mkdirSync(path.dirname(output), { recursive: true });
 execFileSync("sips", ["-s", "format", "png", "-z", "48", "48", input, "--out", output], { stdio: "pipe" });
}

function magickBin() {
 for (const name of ["magick", "convert"]) {
  try {
   execFileSync("which", [name], { stdio: "ignore" });
   return name;
  } catch {
   // Keep looking.
  }
 }
 throw new Error("ImageMagick is required for sheet composition");
}

function composeSheet(original48, step48, sheet) {
 mkdirSync(path.dirname(sheet), { recursive: true });
 execFileSync(magickBin(), [original48, step48, "+append", sheet], { stdio: "pipe" });
}

function matchesOnly(only, key, id, originalImage) {
 if (!only) return true;
 const base = path.posix.basename(originalImage || "", path.posix.extname(originalImage || ""));
 return only === key || only === id || only === base || only === originalImage;
}

function buildPlan(args) {
 const approval = readJson(args.approval);
 const { keys, items: approvalItems } = collectApprovedKeys(approval);
 const queueItems = collectQueueItems(args.runDir);
 const runId = approval.runId || approval.sourceRunId || path.basename(args.runDir);
 const vaultRoot = vaultRootFromRunDir(args.runDir);
 const selected = [];
 const seenIds = new Set();
 for (const key of keys) {
  const id = itemIdFromKey(key);
  if (seenIds.has(id)) continue;
  seenIds.add(id);
  const item = queueItems.get(key) || queueItems.get(id) || {};
  const approvalItem = approvalItems.get(key) || approvalItems.get(id) || {};
  const originalImage = originalImageForItem(item, approvalItem);
  if (!originalImage || !imageAllowed(originalImage)) continue;
  if (!matchesOnly(args.only, key, id, originalImage)) continue;
  const stepFrame = findStepFrame(args.runDir, runId, vaultRoot, id, item, approvalItem);
  selected.push({ key, id, originalImage, stepFrame });
 }
 return { runId, selected };
}

const args = parseArgs(process.argv);
const overridesPath = path.join(args.repoRoot, "content", "sprite-overrides.json");
const generatedPath = path.join(args.repoRoot, "apps", "game", "public", "generated", "sprite-overrides.json");
const publicRoot = path.join(args.repoRoot, "apps", "game", "public");
const plan = buildPlan(args);

if (plan.selected.length === 0) {
 throw new Error("No approved items matched the run, approval manifest, and filters");
}

const overrides = readJson(overridesPath);
const tempDir = mkdtempSync(path.join(os.tmpdir(), "ow-walkframes-"));
const results = [];

try {
 for (const item of plan.selected) {
  const originalAbs = path.join(publicRoot, item.originalImage);
  const newImage = outputImagePath(item.originalImage);
  const sheetAbs = path.join(publicRoot, newImage);
  const touched = [];
  for (const section of ["byNpcId", "bySpriteGroup", "overworldByEnemyId"]) {
   for (const [key, entry] of Object.entries(overrides[section] || {})) {
    if (entry?.image === item.originalImage) touched.push({ section, key });
   }
  }
  const missing = [];
  if (!canRead(originalAbs)) missing.push(`missing original ${originalAbs}`);
  if (!item.stepFrame || !canRead(item.stepFrame)) missing.push(`missing step frame for ${item.id}`);
  if (touched.length === 0) missing.push(`no sprite-overrides entries use ${item.originalImage}`);
  if (missing.length > 0) {
   results.push({ ...item, newImage, touched, status: "blocked", missing });
   continue;
  }
  if (!args.dryRun) {
   const original48 = path.join(tempDir, `${item.id}-original-48.png`);
   const step48 = path.join(tempDir, `${item.id}-step-48.png`);
   normalizeWithSips(originalAbs, original48);
   normalizeWithSips(item.stepFrame, step48);
   composeSheet(original48, step48, sheetAbs);
   const size = pngSize(sheetAbs);
   if (size.width !== 96 || size.height !== 48) {
    throw new Error(`bad sheet size for ${sheetAbs}: ${size.width}x${size.height}`);
   }
   rewriteEntries(overrides, item.originalImage, newImage);
  }
  results.push({
   ...item,
   newImage,
   sheet: sheetAbs,
   touched,
   status: args.dryRun ? "planned" : "adopted",
   originalSha256: sha256(originalAbs),
   stepSha256: sha256(item.stepFrame)
  });
 }

 const blocked = results.filter((item) => item.status === "blocked");
 if (blocked.length > 0) {
  console.log(JSON.stringify({ ok: false, dryRun: args.dryRun, runId: plan.runId, results }, null, 2));
  process.exitCode = 1;
 } else if (!args.dryRun) {
  writeJson(overridesPath, overrides);
  mkdirSync(path.dirname(generatedPath), { recursive: true });
  copyFileSync(overridesPath, generatedPath);
  const contentBytes = readFileSync(overridesPath);
  const generatedBytes = readFileSync(generatedPath);
  if (!contentBytes.equals(generatedBytes)) {
   throw new Error("generated sprite-overrides copy is not byte-identical");
  }
  const validation = [];
  for (const result of results) {
   const size = pngSize(result.sheet);
   validation.push({ id: result.id, sheet: result.sheet, width: size.width, height: size.height, ok: size.width === 96 && size.height === 48 });
  }
  if (validation.some((entry) => !entry.ok)) {
   throw new Error(`sheet validation failed: ${JSON.stringify(validation)}`);
  }
  console.log(JSON.stringify({ ok: true, dryRun: false, runId: plan.runId, adopted: results.length, generatedCopyByteIdentical: true, results, validation }, null, 2));
 } else {
  console.log(JSON.stringify({ ok: true, dryRun: true, runId: plan.runId, planned: results.length, results }, null, 2));
 }
} finally {
 rmSync(tempDir, { recursive: true, force: true });
}
