/**
 * Purpose-built readers for the narrow CoilSnake YAML shapes this project
 * consumes. These are not general YAML parsers; they only handle the
 * "<int>:" + two-space "Key: value" layout CoilSnake emits, plus the
 * map_sprites.yml placement lists. Unknown lines are ignored, never fatal.
 */

export type IntKeyedEntries = Map<number, Record<string, string>>;

const INTEGER_TOKEN = "(?:0x[0-9a-fA-F]+|\\$[0-9a-fA-F]+|\\d+)";

export function parseYamlInteger(value: string | undefined): number {
  const trimmed = value?.trim() ?? "";
  if (!new RegExp(`^${INTEGER_TOKEN}$`).test(trimmed)) {
    return Number.NaN;
  }
  if (trimmed.startsWith("$")) {
    return Number.parseInt(trimmed.slice(1), 16);
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

export type MapDoorEntry = {
  /** Outer key: vertical 256px door-area band index. */
  areaY: number;
  /** Inner key: horizontal 256px door-area band index. */
  areaX: number;
  type: string;
  /** 8px collision-cell X within the 256x256 door area. */
  x: number;
  /** 8px collision-cell Y within the 256x256 door area. */
  y: number;
  /** 8px warp-grid X destination; over-range outliers may already be world pixels. */
  destinationX?: number;
  /** 8px warp-grid Y destination; over-range outliers may already be world pixels. */
  destinationY?: number;
  direction?: string;
  style?: number;
  eventFlag?: string;
  textPointer?: string;
  line: number;
};

export type TeleportDestinationEntry = {
  id: number;
  /** World-pixel X coordinate, scaled from 8px warp-grid table units. */
  x: number;
  /** World-pixel Y coordinate, scaled from 8px warp-grid table units. */
  y: number;
  /** CCScript/stdarg direction id: 1 north, 3 east, 5 south, 7 west; 0 is a no-facing sentinel. */
  direction: number;
  warpStyle: number;
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

/** DoorModule and MapSpriteModule use the same 32x40 pointer-table area grid. */
export const DOOR_AREA_SIZE = SPRITE_AREA_SIZE;

/**
 * Door X/Y are collision-cell indexes inside a 256px area; one imported door
 * trigger occupies the corresponding 8x8 collision cell.
 */
export const DOOR_TRIGGER_CELL_SIZE = 8;

/**
 * Parses CoilSnake map_doors.yml. Layout:
 *   <areaY>:
 *     <areaX>:
 *     - Destination X: <8px warp-grid unit; over-range values may already be world px>
 *       Destination Y: <8px warp-grid unit; over-range values may already be world px>
 *       Direction: <direction>
 *       Event Flag: <raw>
 *       Style: <int>
 *       Text Pointer: <raw>
 *       Type: door
 *       X: <8px cell>
 *       Y: <8px cell>
 */
export function parseMapDoors(source: string): MapDoorEntry[] {
  const doors: MapDoorEntry[] = [];
  const lines = source.split(/\r?\n/);
  let areaY: number | undefined;
  let areaX: number | undefined;
  let current: Partial<MapDoorEntry> | undefined;
  const outerPattern = new RegExp(`^(${INTEGER_TOKEN}):\\s*$`);
  const innerPattern = new RegExp(`^ {2}(${INTEGER_TOKEN}):\\s*(?:null)?\\s*$`);
  const itemPattern = /^ {2}-\s*(?:(.*?):\s*(.*))?$/;
  const fieldPattern = /^ {4}([^:]+):\s*(.*)$/;

  const commit = () => {
    if (
      current?.type &&
      current.x !== undefined &&
      current.y !== undefined &&
      current.areaX !== undefined &&
      current.areaY !== undefined &&
      current.line !== undefined
    ) {
      doors.push(current as MapDoorEntry);
    }
    current = undefined;
  };

  const assign = (entry: Partial<MapDoorEntry>, key: string, rawValue: string): void => {
    const value = stripQuotes(rawValue.trim());
    switch (key.trim()) {
      case "Type":
        entry.type = value;
        break;
      case "X":
        entry.x = parseYamlInteger(value);
        break;
      case "Y":
        entry.y = parseYamlInteger(value);
        break;
      case "Destination X":
        entry.destinationX = parseYamlInteger(value);
        break;
      case "Destination Y":
        entry.destinationY = parseYamlInteger(value);
        break;
      case "Direction":
        entry.direction = value;
        break;
      case "Style":
        entry.style = parseYamlInteger(value);
        break;
      case "Event Flag":
        entry.eventFlag = value;
        break;
      case "Text Pointer":
        entry.textPointer = value;
        break;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const outerMatch = outerPattern.exec(line);
    if (outerMatch) {
      commit();
      areaY = parseYamlInteger(outerMatch[1]);
      areaX = undefined;
      continue;
    }
    const innerMatch = innerPattern.exec(line);
    if (innerMatch) {
      commit();
      areaX = parseYamlInteger(innerMatch[1]);
      continue;
    }
    const itemMatch = itemPattern.exec(line);
    if (itemMatch) {
      commit();
      current = { areaY: areaY ?? 0, areaX: areaX ?? 0, line: index + 1 };
      if (itemMatch[1]) {
        assign(current, itemMatch[1], itemMatch[2] ?? "");
      }
      continue;
    }
    const fieldMatch = fieldPattern.exec(line);
    if (fieldMatch && current) {
      assign(current, fieldMatch[1], fieldMatch[2]);
    }
  }
  commit();
  return doors.filter((door) => !Number.isNaN(door.x) && !Number.isNaN(door.y));
}

export function doorTriggerToWorldPixel(door: Pick<MapDoorEntry, "areaX" | "areaY" | "x" | "y">): { x: number; y: number } {
  return {
    x: door.areaX * DOOR_AREA_SIZE + door.x * DOOR_TRIGGER_CELL_SIZE,
    y: door.areaY * DOOR_AREA_SIZE + door.y * DOOR_TRIGGER_CELL_SIZE
  };
}

/** The Scripted Teleport Destination Table stores X/Y in 8-pixel "warp grid"
 * units; multiply by this to get world pixels. Verified against the full map:
 * table X/Y max ~1022/1276, and *8 spans the whole 8192x10240 map, whereas
 * treating them as raw pixels crams every destination into the top-left corner.
 * (e.g. dest 150 *8 = (2000,1424) lands in north Onett next to the canonical
 * new-game start; unscaled it resolves to the NW edge.) */
const TELEPORT_WARP_UNIT_PX = 8;
export const DOOR_WARP_UNIT_PX = TELEPORT_WARP_UNIT_PX;

/**
 * Parses CoilSnake teleport_destination_table.yml into WORLD-PIXEL coordinates.
 *
 * NOTE: this is a SEPARATE table from map_doors.yml, but both use 8px
 * warp-grid units. Door conversion applies the same scaling, except for
 * over-range map_doors.yml outliers that are already world pixels.
 */
export function parseTeleportDestinationTable(source: string): TeleportDestinationEntry[] {
  const entries = parseIntKeyedYaml(source);
  return [...entries.entries()]
    .map(([id, entry]) => ({
      id,
      x: parseYamlInteger(entry.X) * TELEPORT_WARP_UNIT_PX,
      y: parseYamlInteger(entry.Y) * TELEPORT_WARP_UNIT_PX,
      direction: parseYamlInteger(entry.Direction),
      warpStyle: parseYamlInteger(entry["Warp Style"])
    }))
    .filter((entry) =>
      !Number.isNaN(entry.id) &&
      !Number.isNaN(entry.x) &&
      !Number.isNaN(entry.y) &&
      !Number.isNaN(entry.direction) &&
      !Number.isNaN(entry.warpStyle)
    )
    .sort((a, b) => a.id - b.id);
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
