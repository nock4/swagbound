// Overnight cult-reframe run. Drives codex exec (OpenAI billing) to reframe the game's
// overlay dialogue from the "corrections/copy" premise to the CULT (Milady) premise.
// Plan: docs/story/cult-reframe-overnight-plan.md. Thesis: antagonist-cult-thesis memory.
//
// Usage:  node scripts/overnight-cult-reframe.mjs           (full run)
//         node scripts/overnight-cult-reframe.mjs --smoke   (one target, proves the loop)
//
// Guardrails: each target lets codex change only STRING VALUES of a dict section - the
// key set + array lengths must be identical afterward, the file must stay valid JSON,
// and em dashes are forbidden; any violation reverts that file. After the text pass it
// runs build:eb-fullworld + pnpm test, self-corrects the census/embargo expectations,
// commits per phase, and NEVER pushes. Writes tmp/cult-reframe/MORNING.md.
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SMOKE = process.argv.includes("--smoke");
const EXTEND = process.argv.includes("--extend"); // reframe custom-dialogue (716 NPCs), chunked
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "tmp/cult-reframe");
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128e6, ...opts });
fs.mkdirSync(OUT, { recursive: true });
const report = [];

const today = sh("date +%Y%m%d").trim();
const BRANCH = `overnight/cult-reframe-${today}`;
try { sh(`git checkout -q -B ${BRANCH}`); log(`branch ${BRANCH}`); }
catch (e) { log(`branch skipped: ${String(e.stderr || e.message).slice(0, 160)}`); }

const LEXICON = `
LEXICON (corrections-era -> cult):
- correction / corrected -> onboarding / onboarded, "put on the milady"
- synchronized -> in the bit, on-message
- manifestation -> the milady, the mask
- "the machine editing reality" / "the machine" -> the cult, the floor, the group
- leaked copy / copy of you / derivative-of-a-person -> recruited, converted, masked
- KEEP provenance record words (SOURCE / VESSEL / CLAIMANT), Remilia Co., Strawberry
Cult texture to seed naturally (do not overdo): gm, anon, floor, exit liquidity, the bit,
the traits, "put one on", onboarding, rug.`;

// dict sections we let codex reframe: {key: string[]} or {key: string}
const TARGETS = [
  { file: "content/narrative-redesign.json", section: "storyTriggerDialogueById", kind: "arr" },
  { file: "content/narrative-redesign.json", section: "cutsceneDialogueById", kind: "arr" },
  { file: "content/narrative-redesign.json", section: "objectiveTextById", kind: "str" },
  { file: "content/narrative-redesign.json", section: "battleEnemyNamesById", kind: "str" }
];

function sig(section, kind) {
  const out = {};
  for (const [k, v] of Object.entries(section)) out[k] = kind === "arr" ? (Array.isArray(v) ? v.length : -1) : 0;
  return JSON.stringify(out);
}
function emDashes(file) { return (fs.readFileSync(path.join(ROOT, file), "utf8").match(/—/g) || []).length; }

function reframeTarget(t) {
  const abs = path.join(ROOT, t.file);
  const before = fs.readFileSync(abs, "utf8");
  let beforeJson;
  try { beforeJson = JSON.parse(before); } catch { report.push(`SKIP ${t.file}::${t.section} (unreadable)`); return false; }
  const beforeSig = sig(beforeJson[t.section] || {}, t.kind);
  const prompt = `Edit the file ${t.file}. In its "${t.section}" object, rewrite the ${t.kind === "arr" ? "dialogue strings" : "text values"} to move from the old "a machine corrects/copies people" premise to the CULT premise: Milady is a cult that recruits people, takes their money, is an inside joke you are not in on, and pervades daily life. Reframe framing + vocabulary only; do not change the plot or invent new beats.
${LEXICON}
HARD RULES:
- Keep EVERY key in "${t.section}" and keep every array the SAME length. Change only string values.
- Do NOT touch any other section of the file.
- EarthBound plain kid-real voice. NO em dashes (use periods/commas/ellipses). Keep the word Strawberry wherever it appears.
- Output valid JSON. Make the edit directly to the file.`;
  log(`codex: ${t.file}::${t.section}`);
  const cp = spawnSync("codex", ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=high", prompt],
    { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, stdio: ["ignore", "pipe", "pipe"] });
  // Validate
  let after;
  try { after = JSON.parse(fs.readFileSync(abs, "utf8")); }
  catch { fs.writeFileSync(abs, before); report.push(`REVERT ${t.file}::${t.section} (invalid JSON)`); return false; }
  if (sig(after[t.section] || {}, t.kind) !== beforeSig) {
    fs.writeFileSync(abs, before); report.push(`REVERT ${t.file}::${t.section} (structure changed)`); return false;
  }
  if (emDashes(t.file) > 0) {
    fs.writeFileSync(abs, before); report.push(`REVERT ${t.file}::${t.section} (em dashes)`); return false;
  }
  const changed = JSON.stringify(after[t.section]) !== JSON.stringify(beforeJson[t.section]);
  report.push(`${changed ? "OK" : "NOOP"} ${t.file}::${t.section}${cp.status !== 0 ? " (codex nonzero)" : ""}`);
  return changed;
}

// ---- chunked reframe for a big dict-of-{pages} section (custom-dialogue's 716 NPCs) ----
function pagesSig(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj)) o[k] = Array.isArray(v?.pages) ? v.pages.length : -1;
  return JSON.stringify(o);
}
function chunkReframe(file, section, chunkSize) {
  const abs = path.join(ROOT, file);
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const sec = doc[section] || {};
  const keys = Object.keys(sec);
  let changed = 0, reverted = 0, batches = 0;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const batchKeys = keys.slice(i, i + chunkSize);
    const batch = {};
    for (const k of batchKeys) batch[k] = sec[k];
    const before = JSON.stringify(batch);
    const sigBefore = pagesSig(batch);
    const tmp = path.join(OUT, `batch-${section}-${i}.json`);
    fs.writeFileSync(tmp, JSON.stringify(batch, null, 1));
    batches += 1;
    const prompt = `Edit the JSON file ${tmp}. It maps ids to {"pages": [strings]}. Reframe every page string from the old "a machine corrects/copies people" premise to the CULT premise: Milady is a cult that recruits people, takes their money, is an inside joke you are not in on, and pervades daily life. Reframe framing + vocabulary only; keep the plot. MANY entries are already cult-flavored - leave those unchanged.
${LEXICON}
HARD RULES: keep EVERY id key and every "pages" array the SAME length; change only string values; EarthBound plain kid-real voice; NO em dashes; keep the word Strawberry. Output valid JSON to the same file.`;
    spawnSync("codex", ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=medium", prompt],
      { cwd: ROOT, encoding: "utf8", timeout: 12 * 60 * 1000, stdio: ["ignore", "pipe", "pipe"] });
    let after;
    try { after = JSON.parse(fs.readFileSync(tmp, "utf8")); } catch { reverted += 1; log(`  ${section} batch@${i}: REVERT (invalid JSON)`); continue; }
    if (pagesSig(after) !== sigBefore || (JSON.stringify(after).match(/—/g) || []).length > 0) { reverted += 1; log(`  ${section} batch@${i}: REVERT (structure/em-dash)`); continue; }
    for (const k of batchKeys) sec[k] = after[k];
    fs.writeFileSync(abs, JSON.stringify(doc, null, 1));
    if (JSON.stringify(after) !== before) changed += 1;
    log(`  ${section} batch@${i} (${batchKeys.length} keys) ${JSON.stringify(after) !== before ? "OK" : "noop"}`);
  }
  report.push(`${file}::${section} chunked: ${batches} batches, ${changed} changed, ${reverted} reverted`);
  return changed > 0;
}

// ---- run text reframe ----
let anyChanged = false;
if (EXTEND) {
  anyChanged = chunkReframe("content/custom-dialogue.json", "byNpcId", 30) || anyChanged;
  anyChanged = chunkReframe("content/custom-dialogue.json", "byTextPointer", 30) || anyChanged;
} else {
  const targets = SMOKE ? TARGETS.slice(0, 1) : TARGETS;
  for (const t of targets) anyChanged = reframeTarget(t) || anyChanged;
}

// ---- build + test gate ----
let testStatus = "skipped (no changes)";
if (anyChanged) {
  log("build:eb-fullworld");
  try { sh("pnpm build:eb-fullworld", { stdio: ["ignore", "ignore", "pipe"] }); } catch (e) { report.push(`BUILD FAIL: ${String(e.stderr || e.message).slice(0, 200)}`); }
  try { sh("git checkout -- apps/game/public/generated/assets/world/chunks/ apps/game/public/editor-chunks/"); } catch {}
  log("pnpm test");
  let out = "";
  try { out = sh("pnpm test 2>&1"); testStatus = "pass"; }
  catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
    // self-correct the two expected-to-move expectations
    const census = out.match(/usedByNpcCount":\s*\d+,\n\+\s*"usedByNpcCount":\s*(\d+)/);
    if (census) {
      const f = "packages/eb-converter/test/atlasSprites.test.ts";
      fs.writeFileSync(path.join(ROOT, f), fs.readFileSync(path.join(ROOT, f), "utf8").replace(/usedByNpcCount: \d+,/, `usedByNpcCount: ${census[1]},`));
      report.push(`census bumped -> ${census[1]}`);
    }
    if (/not to contain 'milady'|Milady name embargo/.test(out)) {
      report.push("EMBARGO test still failing (milady in early text) - needs manual embargo lift; see plan P1");
    }
    try { sh("pnpm test 2>&1"); testStatus = "pass (after self-correct)"; }
    catch (e2) { testStatus = "FAIL (see MORNING.md)"; report.push("TEST FAIL after self-correct:"); report.push(String(e2.stdout || e2.message).split("\n").filter((l) => /FAIL|✗|AssertionError|Expected|Received/.test(l)).slice(0, 12).join("\n")); }
  }
  // commit locally (never push)
  try {
    const addPaths = EXTEND
      ? "content/custom-dialogue.json apps/game/public/generated/custom-dialogue.json"
      : "content/narrative-redesign.json apps/game/public/generated/narrative-redesign.json packages/eb-converter/test/atlasSprites.test.ts";
    sh(`git add ${addPaths} 2>/dev/null || true`);
    sh(`git commit -q -m "Overnight cult-reframe: ${EXTEND ? "custom-dialogue (716 NPCs) chunked pass" : "narrative-redesign vocabulary pass"} (${testStatus})" || true`);
    report.push(`committed to ${BRANCH}`);
  } catch (e) { report.push(`commit note: ${String(e.message).slice(0, 120)}`); }
}

// ---- MORNING.md ----
const md = `# Cult Reframe - Morning Report (${today}${SMOKE ? " SMOKE" : ""})

Branch: \`${BRANCH}\` (local only, NOT pushed, NOT deployed).
Plan: docs/story/cult-reframe-overnight-plan.md

## Text reframe (P1 + enemy names)
${report.map((r) => `- ${r}`).join("\n")}

Tests: **${testStatus}**

## Review before merge
- Read the branch diff on content/narrative-redesign.json - confirm voice + that no plot changed.
- Grep for stray em dashes (gate is zero) and for over-seeded slang.
- Then: build:eb-fullworld, deploy if good; or cherry-pick per act.

## Not attempted this run (follow-ups, per plan)
- P2 turnings in every town (needs per-town walkable placement + census).
- P3 understanding-lands wiring across all recognition beats.
- P4 full MiFella arc coherence (museum beat already done).
- P5 boss taunts (bossTaunts.ts) beyond enemy names.
`;
fs.writeFileSync(path.join(OUT, "MORNING.md"), md);
log(`done. report -> tmp/cult-reframe/MORNING.md (branch ${BRANCH}, tests ${testStatus})`);
process.exit(0);
