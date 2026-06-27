// Reachability audit: flood-fill walkable cells from the new-game start, warping
// through doors, to find which shops/areas a player can actually reach.
import { readFileSync, existsSync } from "node:fs";
const root = "/Users/nickgeorge-studio/Projects/coilsnake-tutorial-experiment/";
const w = JSON.parse(readFileSync(root + "apps/game/public/generated/world.json", "utf8"));
const c = w.collision;
const CS = c.cellSize, W = c.width, H = c.height;
const solid = c.solidRows.map((row) => row); // string per row, '1'=solid
const isSolid = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || solid[cy][cx] === "1";
const cell = (px, py) => [Math.floor(px / CS), Math.floor(py / CS)];

// Doors: from each door trigger, a player on an adjacent WALKABLE cell can warp to dest.
// Precompute: for each walkable cell adjacent to a door trigger, the dest walkable cell.
const doorWarps = new Map(); // key "cx,cy" -> [destCx,destCy]
for (const d of w.doors) {
  if (!d.destinationWorldPixel) continue;
  const [dcx, dcy] = cell(d.worldPixel.x, d.worldPixel.y);
  const [tcx, tcy] = cell(d.destinationWorldPixel.x, d.destinationWorldPixel.y);
  // snap dest to nearest walkable within 3 cells
  let dest = null;
  for (let r = 0; r <= 3 && !dest; r++) for (let oy = -r; oy <= r && !dest; oy++) for (let ox = -r; ox <= r && !dest; ox++) if (!isSolid(tcx + ox, tcy + oy)) dest = [tcx + ox, tcy + oy];
  if (!dest) continue;
  // any walkable neighbour of the door trigger can use it
  for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) {
    const ax = dcx + ox, ay = dcy + oy;
    if (!isSolid(ax, ay)) { const k = ax + "," + ay; if (!doorWarps.has(k)) doorWarps.set(k, []); doorWarps.get(k).push(dest); }
  }
}

// BFS flood-fill from start
const [sx, sy] = cell(w.player.spawnWorldPixel.x, w.player.spawnWorldPixel.y);
const seen = new Uint8Array(W * H);
const idx = (cx, cy) => cy * W + cx;
const q = [[sx, sy]]; seen[idx(sx, sy)] = 1;
const enq = (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H && !isSolid(cx, cy) && !seen[idx(cx, cy)]) { seen[idx(cx, cy)] = 1; q.push([cx, cy]); } };
let head = 0;
while (head < q.length) {
  const [cx, cy] = q[head++];
  enq(cx + 1, cy); enq(cx - 1, cy); enq(cx, cy + 1); enq(cx, cy - 1);
  const warps = doorWarps.get(cx + "," + cy);
  if (warps) for (const [tx, ty] of warps) enq(tx, ty);
}
const reachableCell = (px, py) => {
  const [cx, cy] = cell(px, py);
  for (let r = 0; r <= 3; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { const nx = cx + ox, ny = cy + oy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && seen[idx(nx, ny)]) return true; }
  return false;
};

const total = W * H; let reached = 0; for (let i = 0; i < total; i++) if (seen[i]) reached++;
console.log("walkable-cell flood-fill from start (" + sx + "," + sy + "): reached " + reached + " cells");

// Shops
const clerksPath = root + "scripts/.shop-clerks.json";
if (existsSync(clerksPath)) {
  const clerks = JSON.parse(readFileSync(clerksPath, "utf8"));
  const unreach = clerks.filter((c) => !reachableCell(c.clerkX, c.clerkY));
  console.log("SHOPS: " + clerks.length + " wired clerks, " + (clerks.length - unreach.length) + " REACHABLE, " + unreach.length + " unreachable");
  if (unreach.length) console.log("  unreachable shops: " + unreach.map((c) => "store" + c.storeId + "@npc" + c.npcId + "(" + c.clerkX + "," + c.clerkY + ")").join(" "));
}
// Orphaned doors' destinations
for (const [x, y] of [[3104, 5424], [6440, 4808], [6448, 4808]]) {
  const d = w.doors.find((z) => z.worldPixel.x === x && z.worldPixel.y === y);
  console.log("orphan door(" + x + "," + y + ") dest(" + d.destinationWorldPixel.x + "," + d.destinationWorldPixel.y + ") destReachable=" + reachableCell(d.destinationWorldPixel.x, d.destinationWorldPixel.y) + " doorReachable=" + reachableCell(x, y));
}

// Are there doors FROM a reachable spot whose destination is unreachable? (dangling/broken bridges)
let bridges = 0; const samples = [];
for (const d of w.doors) {
  if (!d.destinationWorldPixel) continue;
  if (reachableCell(d.worldPixel.x, d.worldPixel.y) && !reachableCell(d.destinationWorldPixel.x, d.destinationWorldPixel.y)) {
    bridges++; if (samples.length < 8) samples.push(`(${d.worldPixel.x},${d.worldPixel.y})->(${d.destinationWorldPixel.x},${d.destinationWorldPixel.y})`);
  }
}
console.log("DOORS from reachable -> unreachable dest (potential dropped connections):", bridges);
if (samples.length) console.log("  samples:", samples.join("  "));
