/**
 * Purpose-built readers for the narrow CoilSnake YAML shapes this project
 * consumes. These are not general YAML parsers; they only handle the
 * "<int>:" + two-space "Key: value" layout CoilSnake emits, plus the
 * map_sprites.yml placement lists. Unknown lines are ignored, never fatal.
 */

export type IntKeyedEntries = Map<number, Record<string, string>>;

const INTEGER_TOKEN = "(?:0x[0-9a-fA-F]+|\\d+)";

export function parseYamlInteger(value: string | undefined): number {
  const trimmed = value?.trim() ?? "";
  if (!new RegExp(`^${INTEGER_TOKEN}$`).test(trimmed)) {
    return Number.NaN;
  }
  return Number.parseInt(trimmed, trimmed.toLowerCase().startsWith("0x") ? 16 : 10);
}

/** Parses "<int>:" blocks with two-space-indented "Key: value" fields. */
export function parseIntKeyedYaml(source: string): IntKeyedEntries {
  const entries: IntKeyedEntries = new Map();
  let current: Record<string, string> | undefined;
  for (const line of source.split(/\r?\n/)) {
    const blockMatch = new RegExp(`^(${INTEGER_TOKEN}):\\s*$`).exec(line);
    if (blockMatch) {
      current = {};
      entries.set(parseYamlInteger(blockMatch[1]), current);
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
  const outerPattern = new RegExp(`^(${INTEGER_TOKEN}):\\s*$`);
  const innerPattern = new RegExp(`^ {2}(${INTEGER_TOKEN}):\\s*$`);
  const flowPattern = new RegExp(`-\\s*\\{\\s*NPC ID:\\s*(${INTEGER_TOKEN})\\s*,\\s*X:\\s*(${INTEGER_TOKEN})\\s*,\\s*Y:\\s*(${INTEGER_TOKEN})\\s*\\}`);
  const blockPattern = new RegExp(`^\\s*-\\s*NPC ID:\\s*(${INTEGER_TOKEN})\\s*$`);
  const xPattern = new RegExp(`^\\s+X:\\s*(${INTEGER_TOKEN})\\s*$`);
  const yPattern = new RegExp(`^\\s+Y:\\s*(${INTEGER_TOKEN})\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const outerMatch = outerPattern.exec(line);
    if (outerMatch) {
      areaY = parseYamlInteger(outerMatch[1]);
      areaX = undefined;
      continue;
    }
    const innerMatch = innerPattern.exec(line);
    if (innerMatch) {
      areaX = parseYamlInteger(innerMatch[1]);
      continue;
    }

    const flowMatch = flowPattern.exec(line);
    if (flowMatch) {
      placements.push({
        areaY: areaY ?? 0,
        areaX: areaX ?? 0,
        npcId: parseYamlInteger(flowMatch[1]),
        x: parseYamlInteger(flowMatch[2]),
        y: parseYamlInteger(flowMatch[3]),
        line: index + 1
      });
      continue;
    }

    const blockMatch = blockPattern.exec(line);
    if (blockMatch) {
      let x: number | undefined;
      let y: number | undefined;
      for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
        const lookahead = lines[index + offset];
        // Never read past the start of the next placement or area key.
        if (/^\s*-\s*NPC ID:/.test(lookahead) || new RegExp(`^\\s*${INTEGER_TOKEN}:\\s*$`).test(lookahead)) {
          break;
        }
        const xMatch = xPattern.exec(lookahead);
        const yMatch = yPattern.exec(lookahead);
        if (xMatch) {
          x = parseYamlInteger(xMatch[1]);
        }
        if (yMatch) {
          y = parseYamlInteger(yMatch[1]);
        }
        if (x !== undefined && y !== undefined) {
          break;
        }
      }
      if (x !== undefined && y !== undefined) {
        placements.push({
          areaY: areaY ?? 0,
          areaX: areaX ?? 0,
          npcId: parseYamlInteger(blockMatch[1]),
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
