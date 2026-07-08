#!/usr/bin/env node
// Bughunt Max: total-coverage overnight QA campaign for Swagbound.
// Owns Vite on :5199, writes tmp/bughunt-max, and never touches git state.
import { chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeContext, FLEETS, Ledger, PagePool } from "./bughunt-fleets/shared.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tmp/bughunt-max");
const PORT = 5199;
const DEFAULT_BASE = `http://127.0.0.1:${PORT}`;
const SMOKE = process.argv.includes("--smoke");
const DEEP = process.argv.includes("--deep");
const DRY_RUN = process.argv.includes("--dry-run");
const POOL = Math.max(1, Number.parseInt(process.env.POOL ?? "3", 10) || 3);
const FLEET_ARG = process.argv.find((arg) => arg.startsWith("--fleet="));
const SELECTED = FLEET_ARG ? FLEET_ARG.slice("--fleet=".length).split(",").map((x) => x.trim()).filter(Boolean) : [...FLEETS];
const UNKNOWN = SELECTED.filter((fleet) => !FLEETS.includes(fleet));
if (UNKNOWN.length > 0) {
  console.error(`Unknown fleet(s): ${UNKNOWN.join(", ")}. Valid: ${FLEETS.join(", ")}`);
  process.exit(2);
}

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const sh = (cmd, opts = {}) => execSync(cmd, {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 64e6,
  ...opts
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

const today = sh("date +%Y%m%d").trim();
// NO branch switching: the smoke run silently moving HEAD stranded a commit on
// an overnight branch (recovered as PR #169). This campaign is read-only over
// the repo; it observes whatever is checked out and never touches git state.
log(`campaign ${today} in current workspace (read-only, no git ops)`);

let vite;
let browser;
let base = DEFAULT_BASE;
let routePage;
const ledger = new Ledger({ flushEvery: 100, onFlush: (reason) => flushReports(reason) });
const startedAt = new Date().toISOString();

try {
  let ctx;
  if (DRY_RUN) {
    ctx = {
      root: ROOT,
      out: OUT,
      base,
      routePage,
      smoke: SMOKE,
      deep: DEEP,
      dryRun: true,
      ledger,
      log,
      stats: {}
    };
    log(`dry-run ready ${base}`);
  } else {
    const boot = await startViteOrStatic();
    vite = boot.vite;
    base = boot.base;
    routePage = boot.routePage;
    log(`${boot.mode} ready ${base}`);

    browser = await chromium.launch({ headless: true });
    ctx = await createRuntimeContext({
      root: ROOT,
      out: OUT,
      base,
      routePage,
      smoke: SMOKE,
      deep: DEEP,
      ledger,
      log
    });
    ctx.pagePool = new PagePool(ctx, browser, POOL);
  }
  ctx.flushReports = flushReports;
  globalThis.__BUGHUNT_STATS__ = ctx.stats;

  const fleetsBeforeVision = SELECTED.filter((fleet) => fleet !== "vision");
  const wantsVision = SELECTED.includes("vision");
  for (const fleet of fleetsBeforeVision) {
    await runFleet(ctx, fleet);
  }
  if (wantsVision) {
    await runFleet(ctx, "vision");
  }
} catch (error) {
  ledger.push({
    fleet: "orchestrator",
    kind: "campaign-crash",
    severity: "blocker",
    detail: String(error?.stack || error?.message || error).slice(0, 4000)
  });
  process.exitCode = 1;
} finally {
  flushReports("final");
  log(`DONE: ${ledger.entries.length} findings -> tmp/bughunt-max/ledger.json + MORNING.md`);
  if (browser) await browser.close().catch(() => {});
  if (vite) {
    vite.kill("SIGTERM");
    await new Promise((resolve) => vite.once("close", resolve));
  }
}

async function runFleet(ctx, fleet) {
  const before = ctx.ledger.entries.length;
  const started = Date.now();
  log(`fleet ${fleet} start`);
  try {
    if (ctx.dryRun) {
      ctx.stats[fleet] = { dryRun: true };
      await new Promise((resolve) => setTimeout(resolve, 5));
    } else {
      const mod = await import(`./bughunt-fleets/${fleet}.mjs`);
      await mod.run(ctx);
    }
  } catch (error) {
    ctx.ledger.push({
      fleet,
      kind: "fleet-crash",
      severity: "blocker",
      detail: String(error?.stack || error?.message || error).slice(0, 2500)
    });
  } finally {
    globalThis.__BUGHUNT_STATS__ = ctx.stats;
    log(`fleet ${fleet} done: +${ctx.ledger.entries.length - before} findings in ${Math.round((Date.now() - started) / 1000)}s`);
    ctx.flushReports?.(`fleet-${fleet}`);
  }
}

function flushReports(reason = "manual") {
  const payload = buildPayload(new Date().toISOString());
  atomicWriteFile(path.join(OUT, "ledger.json"), `${JSON.stringify(payload, null, 2)}\n`);
  atomicWriteFile(path.join(OUT, "MORNING.md"), morningMd(payload));
  log(`flushed reports (${reason})`);
}

function buildPayload(generated) {
  return {
    generated,
    startedAt,
    smoke: SMOKE,
    deep: DEEP,
    dryRun: DRY_RUN,
    selectedFleets: SELECTED,
    pool: POOL,
    count: ledger.entries.length,
    ledger: ledger.entries,
    stats: globalThis.__BUGHUNT_STATS__ ?? undefined
  };
}

function atomicWriteFile(file, content) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

async function startViteOrStatic() {
  const output = [];
  const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: path.join(ROOT, "apps/game"),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => {
    const text = String(data);
    output.push(text);
    const line = text.trim();
    if (line) log(`vite: ${line.split("\n").at(-1)}`);
  });
  child.stderr.on("data", (data) => {
    const text = String(data);
    output.push(text);
    const line = text.trim();
    if (line) log(`vite: ${line.split("\n").at(-1)}`);
  });
  try {
    await waitForServer(DEFAULT_BASE, 60000, child, output);
    return { mode: "vite", base: DEFAULT_BASE, vite: child };
  } catch (error) {
    const detail = String(error?.message || error);
    child.kill("SIGTERM");
    if (!/listen EPERM|operation not permitted/i.test(detail)) {
      throw error;
    }
    log("vite listen blocked by sandbox; using static Playwright route fallback");
    const staticRoot = path.join(OUT, "static");
    sh("pnpm exec vite build --outDir ../../tmp/bughunt-max/static --emptyOutDir", {
      cwd: path.join(ROOT, "apps/game"),
      timeout: 120000
    });
    return {
      mode: "static-route",
      base: "http://bughunt.local",
      vite: undefined,
      routePage: (page) => routeStaticBuild(page, staticRoot)
    };
  }
}

async function waitForServer(base, timeoutMs, child, output) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(output.join("").trim() || `Vite exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Vite did not become ready at ${base} within ${timeoutMs}ms\n${output.join("").trim()}`);
}

async function routeStaticBuild(page, staticRoot) {
  await page.route("http://bughunt.local/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const relative = pathname.replace(/^\/+/, "");
    const file = path.resolve(staticRoot, relative);
    if (!file.startsWith(path.resolve(staticRoot))) {
      await route.fulfill({ status: 403, body: "forbidden" });
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: "not found" });
      return;
    }
    await route.fulfill({ path: file, contentType: contentTypeFor(file) });
  });
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".woff2": "font/woff2"
  }[ext] ?? "application/octet-stream";
}

function morningMd(payload) {
  const entries = payload.ledger;
  const byFleet = countBy(entries, "fleet");
  const bySeverity = countBy(entries, "severity");
  const blockers = entries.filter((entry) => entry.severity === "blocker");
  const top = [...entries].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 20);
  const lines = [
    `# Bughunt Max ${payload.generated.slice(0, 10)}${payload.smoke ? " (SMOKE)" : ""}`,
    "",
    `findings: ${entries.length}`,
    `blockers: ${blockers.length}`,
    `fleets: ${payload.selectedFleets.join(", ")}`,
    `pool: ${payload.pool}`,
    "",
    "## Counts by Fleet",
    ...Object.entries(byFleet).sort().map(([fleet, count]) => `- ${fleet}: ${count}`),
    "",
    "## Counts by Severity",
    ...Object.entries(bySeverity).sort((a, b) => severityRank(a[0]) - severityRank(b[0])).map(([severity, count]) => `- ${severity}: ${count}`),
    "",
    "## Blockers First",
    ...(blockers.length ? blockers.map(formatFinding) : ["- none"]),
    "",
    "## Top 20 Findings",
    ...(top.length ? top.map(formatFinding) : ["- none"]),
    "",
    "## Coverage Stats",
    ...coverageLines(payload.stats ?? {}),
    "",
    "Full ledger: tmp/bughunt-max/ledger.json",
    "Evidence: tmp/bughunt-max/shots/"
  ];
  return `${lines.join("\n")}\n`;
}

function countBy(entries, key) {
  const counts = {};
  for (const entry of entries) {
    const value = entry[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function severityRank(severity) {
  return { blocker: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function formatFinding(entry) {
  const at = entry.at ? ` @ (${entry.at.x},${entry.at.y})` : "";
  const evidence = typeof entry.evidence === "string" ? ` [${path.relative(ROOT, entry.evidence)}]` : "";
  return `- [${entry.severity}] ${entry.fleet}/${entry.kind}${at}: ${entry.detail ?? ""}${evidence}`;
}

function coverageLines(stats) {
  const out = [];
  if (stats.tiles) out.push(`- cells walked: ${pct(stats.tiles.walkedCells, stats.tiles.totalWalkableCells)} (${stats.tiles.walkedCells ?? 0}/${stats.tiles.totalWalkableCells ?? "?"})`);
  if (stats.talk) out.push(`- interactables talked: ${pct(stats.talk.attempted, stats.talk.total)} (${stats.talk.attempted}/${stats.talk.total})`);
  if (stats.doors) out.push(`- doors passed: ${pct(stats.doors.passed, stats.doors.attempted)} (${stats.doors.passed}/${stats.doors.attempted})`);
  if (stats.battles) out.push(`- groups simulated: ${pct(stats.battles.groupsSimulated, stats.battles.groupsTotal)} (${stats.battles.groupsSimulated}/${stats.battles.groupsTotal})`);
  if (stats.minigames) out.push(`- source checks attempted: ${pct(stats.minigames.sourceChecksAttempted, stats.minigames.sourceChecksTotal)} (${stats.minigames.sourceChecksAttempted}/${stats.minigames.sourceChecksTotal})`);
  if (stats.vision) out.push(`- screenshots judged: ${pct(stats.vision.screenshotsJudged, stats.vision.screenshotsTotal)} (${stats.vision.screenshotsJudged}/${stats.vision.screenshotsTotal})`);
  return out.length ? out : ["- no coverage stats recorded"];
}

function pct(done, total) {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return "n/a";
  return `${Math.round((done / total) * 1000) / 10}%`;
}
