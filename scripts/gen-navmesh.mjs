import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { walkableFootprintClear } from "../apps/game/src/collisionFootprint.ts";
import { applyClearOverrideRects, applySolidOverrideRects } from "../apps/game/src/collisionOverrides.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");
const GENERATED_OUT = path.join(GENERATED, "navmesh.json");
const CONTENT_OUT = path.join(ROOT, "content/navmesh.json");
const SUMMARY_OUT = path.join(ROOT, "tmp/navmesh/summary.txt");

const started = performance.now();
const world = JSON.parse(fs.readFileSync(path.join(GENERATED, "world.json"), "utf8"));
const { cellSize: CS, width: W, height: H } = world.collision;
const solidRows = [...world.collision.solidRows];
const grid = { cellSize: CS, width: W, height: H };

const overridesFile = path.join(ROOT, "content/collision-overrides.json");
const overrides = fs.existsSync(overridesFile)
  ? JSON.parse(fs.readFileSync(overridesFile, "utf8"))
  : { clears: [], solids: [] };
applyClearOverrideRects(solidRows, overrides.clears ?? [], CS);
applySolidOverrideRects(solidRows, overrides.solids ?? [], CS);

const cellCount = W * H;
const walkable = new Uint8Array(cellCount);
let walkableCells = 0;
for (let cy = 0; cy < H; cy += 1) {
  for (let cx = 0; cx < W; cx += 1) {
    const index = cy * W + cx;
    if (walkableFootprintClear({ x: cx * CS + CS / 2, y: cy * CS + CS / 2 }, solidRows, grid)) {
      walkable[index] = 1;
      walkableCells += 1;
    }
  }
}

const componentGrid = new Uint32Array(cellCount);
const queue = new Int32Array(cellCount);
const components = {};
let componentCount = 0;

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const startIndex = y * W + x;
    if (!walkable[startIndex] || componentGrid[startIndex] !== 0) {
      continue;
    }

    componentCount += 1;
    const id = componentCount;
    let qHead = 0;
    let qTail = 0;
    let cells = 0;
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;

    componentGrid[startIndex] = id;
    queue[qTail++] = startIndex;

    while (qHead < qTail) {
      const index = queue[qHead++];
      const cx = index % W;
      const cy = Math.floor(index / W);
      cells += 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx > 0) {
        const next = index - 1;
        if (walkable[next] && componentGrid[next] === 0) {
          componentGrid[next] = id;
          queue[qTail++] = next;
        }
      }
      if (cx + 1 < W) {
        const next = index + 1;
        if (walkable[next] && componentGrid[next] === 0) {
          componentGrid[next] = id;
          queue[qTail++] = next;
        }
      }
      if (cy > 0) {
        const next = index - W;
        if (walkable[next] && componentGrid[next] === 0) {
          componentGrid[next] = id;
          queue[qTail++] = next;
        }
      }
      if (cy + 1 < H) {
        const next = index + W;
        if (walkable[next] && componentGrid[next] === 0) {
          componentGrid[next] = id;
          queue[qTail++] = next;
        }
      }
    }

    components[String(id)] = {
      cells,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    };
  }
}

const rows = [];
const rects = [];
let activeRects = new Map();
for (let y = 0; y < H; y += 1) {
  const row = [];
  const nextActiveRects = new Map();
  let x = 0;
  while (x < W) {
    const c = componentGrid[y * W + x];
    let runLength = 1;
    while (x + runLength < W && componentGrid[y * W + x + runLength] === c) {
      runLength += 1;
    }
    row.push([c, runLength]);
    if (c !== 0) {
      const key = `${c}:${x}:${runLength}`;
      const rect = activeRects.get(key);
      if (rect) {
        rect.h += 1;
        nextActiveRects.set(key, rect);
      } else {
        const nextRect = { c, x, y, w: runLength, h: 1 };
        rects.push(nextRect);
        nextActiveRects.set(key, nextRect);
      }
    }
    x += runLength;
  }
  rows.push(row);
  activeRects = nextActiveRects;
}

const output = {
  schema: "swagbound.navmesh.v1",
  cellSize: CS,
  width: W,
  height: H,
  rows,
  components,
  rects
};

const json = `${JSON.stringify(output)}\n`;
fs.mkdirSync(path.dirname(GENERATED_OUT), { recursive: true });
fs.mkdirSync(path.dirname(CONTENT_OUT), { recursive: true });
fs.mkdirSync(path.dirname(SUMMARY_OUT), { recursive: true });
fs.writeFileSync(GENERATED_OUT, json);
fs.writeFileSync(CONTENT_OUT, json);

const generatedBytes = Buffer.byteLength(json);
const elapsedMs = performance.now() - started;
const largest = Object.entries(components)
  .map(([id, component]) => ({ id, cells: component.cells, bounds: component.bounds }))
  .sort((a, b) => b.cells - a.cells)
  .slice(0, 10);
const summary = [
  `schema: swagbound.navmesh.v1`,
  `cellSize: ${CS}`,
  `grid: ${W} x ${H}`,
  `walkableCells: ${walkableCells}`,
  `components: ${componentCount}`,
  `rects: ${rects.length}`,
  `jsonBytes: ${generatedBytes}`,
  `generationMs: ${Math.round(elapsedMs)}`,
  `largestComponents:`,
  ...largest.map((component) => (
    `  ${component.id}: cells=${component.cells} bounds=${component.bounds.x},${component.bounds.y},${component.bounds.w},${component.bounds.h}`
  ))
].join("\n");
fs.writeFileSync(SUMMARY_OUT, `${summary}\n`);

console.log(summary);
console.log(`wrote ${path.relative(ROOT, GENERATED_OUT)}`);
console.log(`wrote ${path.relative(ROOT, CONTENT_OUT)}`);
console.log(`wrote ${path.relative(ROOT, SUMMARY_OUT)}`);
