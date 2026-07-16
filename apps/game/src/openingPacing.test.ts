import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENING_FLYOVER_SHOTS,
  OPENING_FLYOVER_VIEW,
  OPENING_KNOCK_POST_SFX_HOLD_MS,
  OPENING_KNOCK_SFX_PATTERN_MS,
  OPENING_KNOCK_SFX_TO_DIALOGUE_MS,
  clampOpeningFlyoverPoint,
  openingFlyoverNightRect
} from "./openingPacing";

/**
 * Density-driven invariants (post-mortem of the "flyover shows forest/map edges"
 * reports): the old tests only asserted clamp math and a hardcoded shot table, so
 * shots authored into the forest east of town passed CI while every frame the
 * player saw was tree wall. These tests score what is actually INSIDE the visible
 * window at each sampled pan position, from the same data the game renders:
 * generated world.json (NPCs, doors, collision) + stamped building rects.
 *
 * Calibration (2026-07-09 scan): compact town shots score forestish <= 0.23 with
 * npcs+doors >= 3 or buildings >= 0.2 coverage; the old bad eastern-edge shot
 * scores forestish 0.69-0.87 with zero content. The continuous arcade-to-house
 * route deliberately crosses the scenic cliff road at 0.56, frame-verified on
 * 2026-07-14; it still has NPCs and a real route, unlike map-edge void.
 */
const world = JSON.parse(
  readFileSync(new URL("../public/generated/world.json", import.meta.url), "utf8")
) as {
  tileSize: number;
  chunkSizeTiles: number;
  npcs: { worldPixel: { x: number; y: number } }[];
  doors: { worldPixel: { x: number; y: number } }[];
  collision: { cellSize: number; solidRows: string[] };
};
const buildingOverrides = JSON.parse(
  readFileSync(new URL("../../../content/building-overrides.json", import.meta.url), "utf8")
) as { buildings: { chunk: string; x: number; y: number; w: number; h: number }[] };

const CHUNK_PX = world.tileSize * world.chunkSizeTiles;
const buildingRects = buildingOverrides.buildings.map((b) => {
  const [cx, cy] = b.chunk.split(",").map(Number);
  return { x: cx * CHUNK_PX + b.x, y: cy * CHUNK_PX + b.y, w: b.w, h: b.h };
});

function solidAt(px: number, py: number): boolean {
  const { cellSize, solidRows } = world.collision;
  const row = solidRows[Math.floor(py / cellSize)];
  const col = Math.floor(px / cellSize);
  return row !== undefined && row[col] === "1";
}

function insideBuilding(px: number, py: number): boolean {
  return buildingRects.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
}

type WindowScore = { npcs: number; doors: number; buildingFrac: number; forestFrac: number };

function scoreWindow(cx: number, cy: number): WindowScore {
  const w = OPENING_FLYOVER_VIEW.width;
  const h = OPENING_FLYOVER_VIEW.height;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  const npcs = world.npcs.filter(
    (n) => n.worldPixel.x >= x0 && n.worldPixel.x <= x1 && n.worldPixel.y >= y0 && n.worldPixel.y <= y1
  ).length;
  const doors = world.doors.filter(
    (d) => d.worldPixel.x >= x0 && d.worldPixel.x <= x1 && d.worldPixel.y >= y0 && d.worldPixel.y <= y1
  ).length;
  let buildingArea = 0;
  for (const r of buildingRects) {
    const ix = Math.max(0, Math.min(x1, r.x + r.w) - Math.max(x0, r.x));
    const iy = Math.max(0, Math.min(y1, r.y + r.h) - Math.max(y0, r.y));
    buildingArea += ix * iy;
  }
  const LATTICE = 12;
  let forest = 0;
  for (let i = 0; i < LATTICE; i++) {
    for (let j = 0; j < LATTICE; j++) {
      const px = x0 + ((i + 0.5) * w) / LATTICE;
      const py = y0 + ((j + 0.5) * h) / LATTICE;
      if (solidAt(px, py) && !insideBuilding(px, py)) {
        forest += 1;
      }
    }
  }
  return {
    npcs,
    doors,
    buildingFrac: buildingArea / (w * h),
    forestFrac: forest / (LATTICE * LATTICE)
  };
}

/** Every camera center the player can see during the continuous cinematic. */
function sampledCenters(): { x: number; y: number; label: string }[] {
  const centers: { x: number; y: number; label: string }[] = [];
  OPENING_FLYOVER_SHOTS.forEach((shot, i) => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      centers.push({
        x: shot.from.x + (shot.to.x - shot.from.x) * t,
        y: shot.from.y + (shot.to.y - shot.from.y) * t,
        label: `shot ${i + 1} @t=${t}`
      });
    }
  });
  return centers;
}

describe("opening flyover pacing", () => {
  it("shows real town content in every visible window of every shot", () => {
    for (const c of sampledCenters()) {
      const s = scoreWindow(c.x, c.y);
      const contentful = s.npcs + s.doors >= 3 || s.buildingFrac >= 0.2;
      expect(contentful, `${c.label} (${c.x},${c.y}) has no town content: ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it("never fills a visible window with forest or map-edge solids", () => {
    for (const c of sampledCenters()) {
      const s = scoreWindow(c.x, c.y);
      expect(
        s.forestFrac,
        `${c.label} (${c.x},${c.y}) is ${Math.round(s.forestFrac * 100)}% non-building solids (forest/edge)`
      ).toBeLessThanOrEqual(0.6);
    }
  });

  it("keeps every shot center inside the clamp region (clamp is the identity)", () => {
    for (const shot of OPENING_FLYOVER_SHOTS) {
      for (const point of [shot.from, shot.to]) {
        expect(clampOpeningFlyoverPoint(point)).toEqual(point);
      }
    }
  });

  it("covers every visible window with the night tint rect", () => {
    const rect = openingFlyoverNightRect();
    const left = rect.x - rect.width / 2;
    const right = rect.x + rect.width / 2;
    const top = rect.y - rect.height / 2;
    const bottom = rect.y + rect.height / 2;
    for (const c of sampledCenters()) {
      expect(c.x - OPENING_FLYOVER_VIEW.width / 2).toBeGreaterThanOrEqual(left);
      expect(c.x + OPENING_FLYOVER_VIEW.width / 2).toBeLessThanOrEqual(right);
      expect(c.y - OPENING_FLYOVER_VIEW.height / 2).toBeGreaterThanOrEqual(top);
      expect(c.y + OPENING_FLYOVER_VIEW.height / 2).toBeLessThanOrEqual(bottom);
    }
  });

  it("preserves one continuous 20-second pan", () => {
    expect(OPENING_FLYOVER_SHOTS.map((shot) => shot.duration)).toEqual([20_000]);
  });

  it("waits for the knock pattern plus the post-knock beat before dialogue", () => {
    expect(OPENING_KNOCK_SFX_TO_DIALOGUE_MS).toBe(OPENING_KNOCK_SFX_PATTERN_MS + OPENING_KNOCK_POST_SFX_HOLD_MS);
    expect(OPENING_KNOCK_POST_SFX_HOLD_MS).toBe(800);
  });
});
