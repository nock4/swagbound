#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const NAVMESH_PATH = path.join(ROOT, "apps/game/public/generated/navmesh.json");
const WORLD_PATH = path.join(ROOT, "apps/game/public/generated/world.json");
const SOURCE_CHECKS_PATH = path.join(ROOT, "content/drifella-source-checks.json");
const TRIGGERS_PATH = path.join(ROOT, "content/triggers.json");
const OUT_PATH = path.join(ROOT, "tmp/navmesh/conformance.json");

const mesh = decodeNavmesh(readJson(NAVMESH_PATH));
const entries = [
  ...worldNpcEntries(readJson(WORLD_PATH)),
  ...sourceCheckEntries(readJson(SOURCE_CHECKS_PATH)),
  ...bossGateEntries(fileExists(TRIGGERS_PATH) ? readJson(TRIGGERS_PATH) : undefined)
];

const results = entries.map((entry) => {
  const nearest = nearestComponentAt(mesh, entry.worldPixel, 2);
  if (nearest.componentId !== 0) {
    return { ...entry, status: "ok", componentId: nearest.componentId, distanceCells: nearest.distanceCells };
  }
  const suggested = nearestWalkableCellCenter(mesh, entry.worldPixel, 6);
  return {
    ...entry,
    status: "not-standable",
    componentId: 0,
    distanceCells: nearest.distanceCells,
    suggestedWorldPixel: suggested?.point ?? null,
    suggestedComponentId: suggested?.componentId ?? null,
    suggestedDistanceCells: suggested?.distanceCells ?? null
  };
});

const summary = summarize(results);
const report = {
  generatedAt: new Date().toISOString(),
  inputs: {
    navmesh: relative(NAVMESH_PATH),
    world: relative(WORLD_PATH),
    sourceChecks: relative(SOURCE_CHECKS_PATH),
    bossGates: fileExists(TRIGGERS_PATH) ? relative(TRIGGERS_PATH) : null
  },
  summary,
  failures: results.filter((entry) => entry.status === "not-standable")
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
printSummary(summary, report.failures.length);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function worldNpcEntries(world) {
  return (world.npcs ?? [])
    .filter((npc) => npc && npc.visible !== false && npc.worldPixel)
    .map((npc) => ({
      source: "worldNpc",
      id: `npc:${npc.npcId}`,
      label: `NPC ${npc.npcId}`,
      worldPixel: npc.worldPixel,
      metadata: {
        npcId: npc.npcId,
        spriteGroup: npc.spriteGroup ?? null,
        movement: npc.movement ?? null,
        showSprite: npc.showSprite ?? null
      }
    }));
}

function sourceCheckEntries(sourceChecks) {
  return (sourceChecks.checks ?? [])
    .filter((check) => check?.placement?.worldPixel)
    .map((check) => ({
      source: "sourceCheck",
      id: check.id,
      label: check.drifellaId ?? check.id,
      worldPixel: check.placement.worldPixel,
      metadata: {
        npcId: check.npcId ?? null,
        region: check.region ?? null,
        placementKind: check.placement.kind ?? null
      }
    }));
}

function bossGateEntries(triggers) {
  if (!triggers) {
    return [];
  }
  return (triggers.triggers ?? [])
    .filter((trigger) => trigger?.boss)
    .map((trigger) => ({
      source: "bossGate",
      id: trigger.id,
      label: trigger.id,
      worldPixel: { x: trigger.boss.x, y: trigger.boss.y },
      metadata: {
        battleGroup: trigger.battleGroup ?? null,
        facing: trigger.boss.facing ?? null
      }
    }));
}

function decodeNavmesh(json) {
  const cells = new Uint32Array(json.width * json.height);
  for (let y = 0; y < json.height; y += 1) {
    const row = json.rows[y] ?? [];
    let x = 0;
    for (const [componentId, runLength] of row) {
      if (componentId !== 0) {
        cells.fill(componentId, y * json.width + x, y * json.width + x + runLength);
      }
      x += runLength;
    }
  }
  return { cellSize: json.cellSize, width: json.width, height: json.height, cells };
}

function nearestComponentAt(navmesh, point, maxRadiusCells) {
  const cellX = Math.floor(point.x / navmesh.cellSize);
  const cellY = Math.floor(point.y / navmesh.cellSize);
  const maxRadius = Math.max(0, Math.floor(maxRadiusCells));
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const componentId = componentAtCell(navmesh, cellX + dx, cellY + dy);
        if (componentId !== 0) {
          return { componentId, distanceCells: radius };
        }
      }
    }
  }
  return { componentId: 0, distanceCells: null };
}

function nearestWalkableCellCenter(navmesh, point, maxRadiusCells) {
  const cellX = Math.floor(point.x / navmesh.cellSize);
  const cellY = Math.floor(point.y / navmesh.cellSize);
  const maxRadius = Math.max(0, Math.floor(maxRadiusCells));
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const candidateCellX = cellX + dx;
        const candidateCellY = cellY + dy;
        const componentId = componentAtCell(navmesh, candidateCellX, candidateCellY);
        if (componentId === 0) {
          continue;
        }
        return {
          componentId,
          distanceCells: radius,
          point: {
            x: Math.round((candidateCellX + 0.5) * navmesh.cellSize),
            y: Math.round((candidateCellY + 0.5) * navmesh.cellSize)
          }
        };
      }
    }
  }
  return undefined;
}

function componentAtCell(navmesh, cellX, cellY) {
  if (cellX < 0 || cellY < 0 || cellX >= navmesh.width || cellY >= navmesh.height) {
    return 0;
  }
  return navmesh.cells[cellY * navmesh.width + cellX] ?? 0;
}

function summarize(results) {
  const bySource = new Map();
  for (const result of results) {
    const row = bySource.get(result.source) ?? { scanned: 0, ok: 0, failures: 0, missingSnap: 0 };
    row.scanned += 1;
    if (result.status === "ok") {
      row.ok += 1;
    } else {
      row.failures += 1;
      if (!result.suggestedWorldPixel) {
        row.missingSnap += 1;
      }
    }
    bySource.set(result.source, row);
  }
  return {
    total: {
      scanned: results.length,
      ok: results.filter((entry) => entry.status === "ok").length,
      failures: results.filter((entry) => entry.status === "not-standable").length,
      missingSnap: results.filter((entry) => entry.status === "not-standable" && !entry.suggestedWorldPixel).length
    },
    bySource: Object.fromEntries([...bySource.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

function printSummary(summary, failureCount) {
  console.log("Navmesh conformance summary");
  console.log("source       scanned  ok      failures  no-snap");
  for (const [source, row] of Object.entries(summary.bySource)) {
    console.log(`${source.padEnd(12)} ${pad(row.scanned)} ${pad(row.ok)} ${pad(row.failures)} ${pad(row.missingSnap)}`);
  }
  console.log(`${"total".padEnd(12)} ${pad(summary.total.scanned)} ${pad(summary.total.ok)} ${pad(summary.total.failures)} ${pad(summary.total.missingSnap)}`);
  console.log(`Wrote ${relative(OUT_PATH)} with ${failureCount} failure entries.`);
}

function pad(value) {
  return String(value).padStart(7);
}
