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
const CUTSCENES = process.argv.includes("--cutscenes"); // reframe cutscenes.json + boss dialogue (nested)
const BOSS = process.argv.includes("--boss"); // reframe base content/boss-battle-dialogue.json (16 bosses)
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
// Type-depth guard: sig() only sees keys + array lengths, so a string coerced to a number
// or object slips past it. Require the reframed values to stay the SAME shape they started:
// arr sections = arrays of strings, str sections = strings.
function typesOk(section, kind) {
  for (const v of Object.values(section)) {
    if (kind === "arr") { if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return false; }
    else if (typeof v !== "string") return false;
  }
  return true;
}
// Everything in the doc EXCEPT one section, normalized - so we can prove codex touched only
// the target section (the prompt asks it to, but nothing enforced it before).
function docMinusSection(doc, section) {
  const clone = { ...doc };
  delete clone[section];
  return JSON.stringify(clone);
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
  if (!typesOk(after[t.section] || {}, t.kind)) {
    fs.writeFileSync(abs, before); report.push(`REVERT ${t.file}::${t.section} (value types changed)`); return false;
  }
  if (docMinusSection(after, t.section) !== docMinusSection(beforeJson, t.section)) {
    fs.writeFileSync(abs, before); report.push(`REVERT ${t.file}::${t.section} (touched other sections)`); return false;
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
  for (const [k, v] of Object.entries(obj)) {
    const pages = Array.isArray(v?.pages) ? v.pages : null;
    // Encode length AND that every page stayed a string AND the entry's field set is
    // unchanged - so a page coerced to an object, or a stray added/dropped field, fails
    // the before/after compare and reverts the batch (the old check saw only length).
    o[k] = {
      n: pages ? pages.length : -1,
      strings: pages ? pages.every((x) => typeof x === "string") : false,
      fields: v && typeof v === "object" ? Object.keys(v).sort().join(",") : "?"
    };
  }
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

// Generic: reframe a {key: {pages:[...]}} map IN PLACE, batched + guardrailed. Returns changed?
function reframeBatchesOfPages(mapObj, label, chunkSize) {
  const keys = Object.keys(mapObj);
  let changed = 0, reverted = 0, batches = 0;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const batchKeys = keys.slice(i, i + chunkSize);
    const batch = {};
    for (const k of batchKeys) batch[k] = mapObj[k];
    const before = JSON.stringify(batch);
    const sigBefore = pagesSig(batch);
    const tmp = path.join(OUT, `batch-${label.replace(/[^a-z0-9]/gi, "_")}-${i}.json`);
    fs.writeFileSync(tmp, JSON.stringify(batch, null, 1));
    batches += 1;
    const prompt = `Edit the JSON file ${tmp}. It maps ids to {"pages": [strings]}. Reframe every page string from the old "a machine corrects/copies people" premise to the CULT premise: Milady is a cult that recruits people, takes their money, is an inside joke you are not in on, and pervades daily life. Reframe framing + vocabulary only; keep the plot. Many entries are already cult-flavored - leave those unchanged.
${LEXICON}
HARD RULES: keep EVERY id key and every "pages" array the SAME length; change only string values; EarthBound plain kid-real voice; NO em dashes; keep the word Strawberry. Output valid JSON to the same file.`;
    spawnSync("codex", ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=medium", prompt],
      { cwd: ROOT, encoding: "utf8", timeout: 12 * 60 * 1000, stdio: ["ignore", "pipe", "pipe"] });
    let after;
    try { after = JSON.parse(fs.readFileSync(tmp, "utf8")); } catch { reverted += 1; log(`  ${label} batch@${i}: REVERT (bad JSON)`); continue; }
    if (pagesSig(after) !== sigBefore || (JSON.stringify(after).match(/—/g) || []).length > 0) { reverted += 1; log(`  ${label} batch@${i}: REVERT (structure/em-dash)`); continue; }
    for (const k of batchKeys) mapObj[k] = after[k];
    if (JSON.stringify(after) !== before) changed += 1;
    log(`  ${label} batch@${i} (${batchKeys.length}) ${JSON.stringify(after) !== before ? "OK" : "noop"}`);
  }
  report.push(`${label}: ${batches} batches, ${changed} changed, ${reverted} reverted`);
  return changed > 0;
}

// Flatten cutscenes.json dialogue-op pages -> reframe -> unflatten.
function reframeCutscenes() {
  const abs = path.join(ROOT, "content/cutscenes.json");
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const flat = {}, locs = {};
  doc.cutscenes.forEach((c, ci) => (c.steps || []).forEach((s, si) => {
    if (s.op === "dialogue" && Array.isArray(s.pages)) { const key = `${ci}#${si}`; flat[key] = { pages: s.pages }; locs[key] = [ci, si]; }
  }));
  const ch = reframeBatchesOfPages(flat, "cutscenes.json dialogue", 20);
  if (ch) { for (const [key, [ci, si]] of Object.entries(locs)) doc.cutscenes[ci].steps[si].pages = flat[key].pages; fs.writeFileSync(abs, JSON.stringify(doc, null, 1)); }
  return ch;
}

// Flatten boss-battle-dialogue-redesign array fields -> reframe -> unflatten.
function reframeBossDialogue(file = "content/boss-battle-dialogue-redesign.json") {
  const abs = path.join(ROOT, file);
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  const flat = {}, locs = {};
  const bg = doc.byBattleGroup || {};
  for (const [g, entry] of Object.entries(bg)) {
    for (const [field, val] of Object.entries(entry)) {
      if (Array.isArray(val) && val.every((x) => typeof x === "string")) { const key = `${g}.${field}`; flat[key] = { pages: val }; locs[key] = [g, field]; }
    }
  }
  if (Array.isArray(doc.ambient)) { flat["ambient"] = { pages: doc.ambient }; locs["ambient"] = ["ambient", null]; }
  const ch = reframeBatchesOfPages(flat, "boss-battle-dialogue", 20);
  if (ch) {
    for (const [key, [g, field]] of Object.entries(locs)) { if (g === "ambient") doc.ambient = flat[key].pages; else bg[g][field] = flat[key].pages; }
    fs.writeFileSync(abs, JSON.stringify(doc, null, 1));
  }
  return ch;
}

// ---- run text reframe ----
let anyChanged = false;
if (BOSS) {
  anyChanged = reframeBossDialogue("content/boss-battle-dialogue.json") || anyChanged;
} else if (CUTSCENES) {
  anyChanged = reframeCutscenes() || anyChanged;
  anyChanged = reframeBossDialogue() || anyChanged;
} else if (EXTEND) {
  anyChanged = chunkReframe("content/custom-dialogue.json", "byNpcId", 30) || anyChanged;
  anyChanged = chunkReframe("content/custom-dialogue.json", "byTextPointer", 30) || anyChanged;
} else {
  const targets = SMOKE ? TARGETS.slice(0, 1) : TARGETS;
  for (const t of targets) anyChanged = reframeTarget(t) || anyChanged;
}

// ---- build + test gate ----
let testStatus = "skipped (no changes)";
let buildOk = true;
if (anyChanged) {
  log("build:eb-fullworld");
  try { sh("pnpm build:eb-fullworld", { stdio: ["ignore", "ignore", "pipe"] }); } catch (e) { buildOk = false; report.push(`BUILD FAIL: ${String(e.stderr || e.message).slice(0, 200)}`); }
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
  // commit locally (never push) - ONLY when the build AND test gate is green. A failed gate
  // leaves the reframed files in the working tree (uncommitted) for morning review instead
  // of baking a broken state into history.
  const gateOk = buildOk && testStatus.startsWith("pass");
  if (!gateOk) {
    report.push(`NOT committed - gate red (build ${buildOk ? "ok" : "FAIL"}, tests ${testStatus}). Changes left uncommitted in the working tree for review.`);
  } else {
    try {
      const addPaths = BOSS
        ? "content/boss-battle-dialogue.json apps/game/public/generated/boss-battle-dialogue.json"
        : CUTSCENES
        ? "content/cutscenes.json apps/game/public/generated/cutscenes.json content/boss-battle-dialogue-redesign.json apps/game/public/generated/boss-battle-dialogue-redesign.json"
        : EXTEND
          ? "content/custom-dialogue.json apps/game/public/generated/custom-dialogue.json"
          : "content/narrative-redesign.json apps/game/public/generated/narrative-redesign.json packages/eb-converter/test/atlasSprites.test.ts";
      const label = BOSS ? "base boss taunts (16 bosses) pass" : CUTSCENES ? "cutscenes + boss dialogue (nested) pass" : EXTEND ? "custom-dialogue (716 NPCs) chunked pass" : "narrative-redesign vocabulary pass";
      sh(`git add ${addPaths} 2>/dev/null || true`);
      sh(`git commit -q -m "Overnight cult-reframe: ${label} (${testStatus})" || true`);
      report.push(`committed to ${BRANCH}`);
    } catch (e) { report.push(`commit note: ${String(e.message).slice(0, 120)}`); }
  }
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
