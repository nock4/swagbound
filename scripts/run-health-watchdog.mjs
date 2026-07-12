#!/usr/bin/env node
// Health watchdog for long arc-runner runs (Nick's directive 2026-07-12:
// check run health every 15 minutes). Watches tmp/arc-telemetry.json freshness;
// if the file goes stale past the threshold while an arc-runner process exists,
// kills the runner so the orchestrator's completion notification fires with a
// clear verdict instead of a silent multi-hour hang.
// Run alongside any long run: node scripts/run-health-watchdog.mjs [staleMinutes=15]
import { statSync } from "node:fs";
import { execSync } from "node:child_process";
const STALE_MIN = Number(process.argv[2] ?? 15);
const FILE = new URL("../tmp/arc-telemetry.json", import.meta.url).pathname;
const log = (m) => console.log(`[watchdog ${new Date().toISOString()}] ${m}`);
log(`watching ${FILE} (stale threshold ${STALE_MIN}min, poll 5min)`);
setInterval(() => {
  let alive = false;
  try { alive = execSync("pgrep -f arc-runner.mjs || true").toString().trim().length > 0; } catch {}
  if (!alive) { log("no arc-runner process; watchdog exiting"); process.exit(0); }
  let ageMin = Infinity;
  try { ageMin = (Date.now() - statSync(FILE).mtimeMs) / 60000; } catch {}
  if (ageMin > STALE_MIN) {
    log(`STALE: telemetry ${ageMin.toFixed(1)}min old with runner alive -> killing runner`);
    try { execSync("pkill -f arc-runner.mjs"); } catch {}
    process.exit(1);
  }
  log(`healthy: telemetry ${ageMin.toFixed(1)}min old`);
}, 5 * 60 * 1000);
