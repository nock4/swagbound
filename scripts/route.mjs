/**
 * A* over a boolean blocked-grid. Pure; no I/O. Used by play.mjs to route the overworld around
 * walls + doors (which dead-reckoning walks into). 8-connected, no corner-cutting.
 */
export function findPath(blocked, cols, rows, start, goal) {
  const inb = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  if (!inb(start.c, start.r) || !inb(goal.c, goal.r) || blocked[goal.r][goal.c]) return null;
  const key = (c, r) => r * cols + c;
  const h = (c, r) => Math.hypot(c - goal.c, r - goal.r);
  const startK = key(start.c, start.r);
  const goalK = key(goal.c, goal.r);
  const g = new Map([[startK, 0]]);
  const f = new Map([[startK, h(start.c, start.r)]]);
  const came = new Map();
  const open = new Set([startK]);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const k of open) { const fk = f.get(k) ?? Infinity; if (fk < best) { best = fk; cur = k; } }
    if (cur === goalK) {
      const path = [];
      let k = cur;
      while (k !== undefined) { path.unshift({ c: k % cols, r: Math.floor(k / cols) }); if (k === startK) break; k = came.get(k); }
      return path;
    }
    open.delete(cur);
    const cc = cur % cols, cr = Math.floor(cur / cols);
    for (const [dc, dr] of NB) {
      const nc = cc + dc, nr = cr + dr;
      if (!inb(nc, nr) || blocked[nr][nc]) continue;
      if (dc !== 0 && dr !== 0 && (blocked[cr][nc] || blocked[nr][cc])) continue; // no corner cutting
      const nk = key(nc, nr);
      const tentative = (g.get(cur) ?? Infinity) + (dc && dr ? 1.41421356 : 1);
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, cur);
        g.set(nk, tentative);
        f.set(nk, tentative + h(nc, nr));
        open.add(nk);
      }
    }
  }
  return null;
}

/** Nearest non-blocked cell to (c,r) within `radius` (BFS-ish ring scan). */
export function nearestOpen(blocked, cols, rows, c, r, radius = 12) {
  if (c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r][c]) return { c, r };
  for (let rad = 1; rad <= radius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && !blocked[nr][nc]) return { c: nc, r: nr };
      }
    }
  }
  return null;
}
