/**
 * Authored collision-override rects (content/collision-overrides.json) applied onto
 * solidRows. EarthBound's roof/behind-building pockets convert to walkable
 * (surface-00 — indistinguishable from grass), so the player could walk on roofs;
 * the authored rects force those cells solid.
 *
 * Pure module (no Phaser): shared by chunkedWorldScene at scene init and by the
 * offline reachability/audit tooling, so the runtime and the tools can never
 * disagree about what is solid.
 */

export type CollisionOverrideRect = { x: number; y: number; w: number; h: number };

/**
 * Mark every cell covered by the rects (world px) solid. Mutates `solidRows`
 * entries in place (rows are replaced strings). Touched-row copy keeps the cost
 * proportional to the overridden area, not the map.
 */
export function applySolidOverrideRects(
  solidRows: string[],
  rects: readonly CollisionOverrideRect[],
  cellSize: number
): void {
  if (rects.length === 0 || solidRows.length === 0 || cellSize <= 0) {
    return;
  }
  const height = solidRows.length;
  const width = solidRows[0].length;
  const patched = new Map<number, string[]>();
  const rowChars = (row: number): string[] => {
    let chars = patched.get(row);
    if (!chars) {
      chars = solidRows[row].split("");
      patched.set(row, chars);
    }
    return chars;
  };
  for (const rect of rects) {
    const c0 = Math.max(0, Math.floor(rect.x / cellSize));
    const c1 = Math.min(width - 1, Math.floor((rect.x + rect.w - 1) / cellSize));
    const r0 = Math.max(0, Math.floor(rect.y / cellSize));
    const r1 = Math.min(height - 1, Math.floor((rect.y + rect.h - 1) / cellSize));
    for (let r = r0; r <= r1; r += 1) {
      const chars = rowChars(r);
      for (let c = c0; c <= c1; c += 1) {
        chars[c] = "1";
      }
    }
  }
  for (const [row, chars] of patched) {
    solidRows[row] = chars.join("");
  }
}
