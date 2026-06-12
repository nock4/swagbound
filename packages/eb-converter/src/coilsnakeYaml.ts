/**
 * Purpose-built readers for the narrow CoilSnake YAML shapes this project
 * consumes. These are not general YAML parsers; they only handle the
 * "<int>:" + two-space "Key: value" layout CoilSnake emits, plus the
 * map_sprites.yml placement lists. Unknown lines are ignored, never fatal.
 */

export type IntKeyedEntries = Map<number, Record<string, string>>;

/** Parses "<int>:" blocks with two-space-indented "Key: value" fields. */
export function parseIntKeyedYaml(source: string): IntKeyedEntries {
  const entries: IntKeyedEntries = new Map();
  let current: Record<string, string> | undefined;
  for (const line of source.split(/\r?\n/)) {
    const blockMatch = /^(\d+):\s*$/.exec(line);
    if (blockMatch) {
      current = {};
      entries.set(Number.parseInt(blockMatch[1], 10), current);
      continue;
    }
    if (!current) {
      continue;
    }
    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (fieldMatch && !line.startsWith("   ")) {
      current[fieldMatch[1].trim()] = stripQuotes(fieldMatch[2].trim());
    }
  }
  return entries;
}

function stripQuotes(value: string): string {
  const match = /^"(.*)"$|^'(.*)'$/.exec(value);
  if (match) {
    return match[1] ?? match[2] ?? value;
  }
  return value;
}

export type SpritePlacement = {
  /** Outer key: vertical 256px band index. */
  areaY: number;
  /** Inner key: horizontal 256px band index. */
  areaX: number;
  npcId: number;
  /** Pixel offset within the 256x256 area. */
  x: number;
  y: number;
  line: number;
};

/**
 * Parses CoilSnake map_sprites.yml. Layout:
 *   <areaY>:
 *     <areaX>:
 *     - NPC ID: <id>
 *       X: <px>
 *       Y: <px>
 * Inline flow entries ("- {NPC ID: 1, X: 2, Y: 3}") are also accepted.
 */
export function parseMapSprites(source: string): SpritePlacement[] {
  const placements: SpritePlacement[] = [];
  const lines = source.split(/\r?\n/);
  let areaY: number | undefined;
  let areaX: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const outerMatch = /^(\d+):\s*$/.exec(line);
    if (outerMatch) {
      areaY = Number.parseInt(outerMatch[1], 10);
      areaX = undefined;
      continue;
    }
    const innerMatch = /^ {2}(\d+):\s*$/.exec(line);
    if (innerMatch) {
      areaX = Number.parseInt(innerMatch[1], 10);
      continue;
    }

    const flowMatch = /-\s*\{\s*NPC ID:\s*(\d+)\s*,\s*X:\s*(\d+)\s*,\s*Y:\s*(\d+)\s*\}/.exec(line);
    if (flowMatch) {
      placements.push({
        areaY: areaY ?? 0,
        areaX: areaX ?? 0,
        npcId: Number.parseInt(flowMatch[1], 10),
        x: Number.parseInt(flowMatch[2], 10),
        y: Number.parseInt(flowMatch[3], 10),
        line: index + 1
      });
      continue;
    }

    const blockMatch = /^\s*-\s*NPC ID:\s*(\d+)\s*$/.exec(line);
    if (blockMatch) {
      let x: number | undefined;
      let y: number | undefined;
      for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
        const lookahead = lines[index + offset];
        // Never read past the start of the next placement or area key.
        if (/^\s*-\s*NPC ID:/.test(lookahead) || /^\s*\d+:\s*$/.test(lookahead)) {
          break;
        }
        const xMatch = /^\s+X:\s*(\d+)\s*$/.exec(lookahead);
        const yMatch = /^\s+Y:\s*(\d+)\s*$/.exec(lookahead);
        if (xMatch) {
          x = Number.parseInt(xMatch[1], 10);
        }
        if (yMatch) {
          y = Number.parseInt(yMatch[1], 10);
        }
        if (x !== undefined && y !== undefined) {
          break;
        }
      }
      if (x !== undefined && y !== undefined) {
        placements.push({
          areaY: areaY ?? 0,
          areaX: areaX ?? 0,
          npcId: Number.parseInt(blockMatch[1], 10),
          x,
          y,
          line: index + 1
        });
      }
    }
  }
  return placements;
}

/** Sprite-area bands are 256x256 pixels on the world map. */
export const SPRITE_AREA_SIZE = 256;

export function placementToWorldPixel(placement: SpritePlacement): { x: number; y: number } {
  return {
    x: placement.areaX * SPRITE_AREA_SIZE + placement.x,
    y: placement.areaY * SPRITE_AREA_SIZE + placement.y
  };
}

/** Parses map_tiles.map: rows of space-separated 3-digit hex arrangement ids. */
export function parseMapTiles(source: string): number[][] {
  const rows: number[][] = [];
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    rows.push(trimmed.split(/\s+/).map((token) => Number.parseInt(token, 16)));
  }
  return rows;
}
