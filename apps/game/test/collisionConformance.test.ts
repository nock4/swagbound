import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Collision conformance: runs the foot-box reachability anomaly tool against the
 * shipped world + authored overrides and compares anomaly IDs to the checked-in
 * baseline (content/collision-baseline.json).
 *
 * - a NEW anomaly id (not in the baseline) fails the test: a change introduced a
 *   collision leak (roof pocket, stamped-building walkover, broken door)
 * - a baseline id that no longer reproduces just logs: shrink the baseline file
 *
 * IDs derive from stable world coordinates / building ids, not array order.
 */
describe("collision conformance (reachability anomalies vs baseline)", () => {
  it("introduces no new reachability anomalies", () => {
    execFileSync("node", ["--import", "tsx", "scripts/collision-reachability.mjs", "--no-png"], {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120_000
    });
    const report = JSON.parse(readFileSync("tmp/collision/reachability.json", "utf8"));
    const baseline = JSON.parse(readFileSync("content/collision-baseline.json", "utf8"));

    const current = {
      roofPockets: report.roofPockets.map(
        (p: { worldBBox: { x: number; y: number } }) => `pocket:${p.worldBBox.x},${p.worldBBox.y}`
      ),
      stampedBuildings: report.stampedBuildings.map((s: { building: string }) => `stamped:${s.building}`),
      doors: report.doors.map((d: { trigger: { x: number; y: number } }) => `door:${d.trigger.x},${d.trigger.y}`)
    };

    for (const key of ["roofPockets", "stampedBuildings", "doors"] as const) {
      const allowed = new Set<string>(baseline[key] ?? []);
      const fresh = current[key].filter((id: string) => !allowed.has(id));
      expect(fresh, `new ${key} anomalies (fix them or consciously extend the baseline)`).toEqual([]);
      const fixed = [...allowed].filter((id) => !current[key].includes(id));
      if (fixed.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[collision-conformance] ${key}: ${fixed.length} baseline entr(ies) no longer reproduce — shrink content/collision-baseline.json:`, fixed);
      }
    }
  }, 180_000);
});
