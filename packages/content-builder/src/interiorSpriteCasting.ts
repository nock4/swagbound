import type {
  InteriorSpriteCasting,
  InteriorSpriteFaction,
  InteriorSpritePool,
  SpriteOverride,
  SpriteOverrides,
  WorldChunked
} from "@eb/schemas";

type CastingWorld = Pick<WorldChunked, "collision" | "npcs" | "sectors">;

export type InteriorSpriteAssignment = {
  npcId: number;
  componentId: number;
  roomId?: string;
  faction: InteriorSpriteFaction;
  image: string;
};

export type InteriorSpriteCastingReport = {
  schema: "swagbound.interior-sprite-casting-report.v1";
  counts: {
    worldNpcs: number;
    eligibleInteriorNpcs: number;
    assigned: number;
    friendlyLswAssigned: number;
    hostileMiladyAssigned: number;
    preservedAuthoredNpcOverrides: number;
    preservedResolvedImageMarkers: number;
    protectedNpcs: number;
    coverageSkipped: number;
    unresolvedComponents: number;
  };
  rooms: Array<{
    id: string;
    faction: InteriorSpriteFaction;
    componentIds: number[];
    eligibleNpcs: number;
    assignedNpcs: number;
  }>;
  assignments: InteriorSpriteAssignment[];
};

export function compileInteriorSpriteCasting(
  world: CastingWorld,
  baseOverrides: SpriteOverrides,
  casting: InteriorSpriteCasting
): { byNpcId: Record<string, SpriteOverride>; report: InteriorSpriteCastingReport } {
  const sectors = world.sectors;
  if (!sectors) {
    throw new Error("Interior sprite casting requires world sector metadata");
  }
  const components = labelWalkableComponents(world.collision.solidRows, world.collision.width, world.collision.height);
  const componentAt = (point: { x: number; y: number }) => nearestComponent(
    components,
    world.collision.width,
    world.collision.height,
    world.collision.cellSize,
    point
  );
  const roomByComponent = new Map<number, InteriorSpriteCasting["rooms"][number]>();
  const componentIdsByRoom = new Map<string, Set<number>>();
  for (const room of casting.rooms) {
    const componentIds = componentIdsByRoom.get(room.id) ?? new Set<number>();
    for (const anchor of room.anchors) {
      const componentId = componentAt(anchor);
      if (componentId < 0) {
        throw new Error(`Interior sprite casting room ${room.id} has an anchor outside walkable space`);
      }
      const conflict = roomByComponent.get(componentId);
      if (conflict && conflict.id !== room.id) {
        throw new Error(`Interior sprite casting rooms ${conflict.id} and ${room.id} share component ${componentId}`);
      }
      roomByComponent.set(componentId, room);
      componentIds.add(componentId);
    }
    componentIdsByRoom.set(room.id, componentIds);
  }

  const protectedNpcIds = new Set(casting.protectedNpcIds);
  const eligibleTypes = new Set<string>(casting.policy.eligibleNpcTypes);
  const preservedMarkers = casting.policy.preserveResolvedImageMarkers.map((marker) => marker.toLowerCase());
  const byNpcId: Record<string, SpriteOverride> = {};
  const assignments: InteriorSpriteAssignment[] = [];
  const counts: InteriorSpriteCastingReport["counts"] = {
    worldNpcs: world.npcs.length,
    eligibleInteriorNpcs: 0,
    assigned: 0,
    friendlyLswAssigned: 0,
    hostileMiladyAssigned: 0,
    preservedAuthoredNpcOverrides: 0,
    preservedResolvedImageMarkers: 0,
    protectedNpcs: 0,
    coverageSkipped: 0,
    unresolvedComponents: 0
  };
  const roomEligible = new Map<string, number>();
  const roomAssigned = new Map<string, number>();
  const usedImagesByComponent = new Map<number, Set<string>>();

  for (const npc of world.npcs) {
    const sectorIndex = sectorIndexAt(npc.worldPixel, sectors);
    if (sectorIndex < 0
      || (casting.policy.requireIndoor && sectors.indoor[sectorIndex] !== 1)
      || (casting.policy.requireBounded && sectors.bounded[sectorIndex] !== 1)) {
      continue;
    }
    const componentId = componentAt(npc.worldPixel);
    if (componentId < 0) {
      counts.unresolvedComponents += 1;
      continue;
    }
    const room = roomByComponent.get(componentId);
    const explicitlyIncluded = room?.includeNpcIds?.includes(npc.npcId) ?? false;
    if ((!npc.type || !eligibleTypes.has(npc.type)) && !explicitlyIncluded) {
      continue;
    }
    counts.eligibleInteriorNpcs += 1;
    if (room) {
      roomEligible.set(room.id, (roomEligible.get(room.id) ?? 0) + 1);
    }
    if (protectedNpcIds.has(npc.npcId) || room?.excludeNpcIds?.includes(npc.npcId)) {
      counts.protectedNpcs += 1;
      continue;
    }
    const roomOverridesAuthoredIdentity = room?.overrideAuthoredNpcIds?.includes(npc.npcId) ?? false;
    if (
      casting.policy.preserveAuthoredByNpcId
      && !roomOverridesAuthoredIdentity
      && baseOverrides.byNpcId?.[String(npc.npcId)]
    ) {
      counts.preservedAuthoredNpcOverrides += 1;
      continue;
    }
    const resolvedBase = baseOverrides.bySpriteGroup?.[String(npc.spriteGroup)];
    const resolvedImage = resolvedBase?.image.toLowerCase() ?? "";
    if (!room && preservedMarkers.some((marker) => resolvedImage.includes(marker))) {
      counts.preservedResolvedImageMarkers += 1;
      continue;
    }

    const faction = room?.faction ?? casting.policy.defaultFaction;
    const coveragePercent = room?.coveragePercent ?? casting.policy.defaultCoveragePercent;
    if (stablePercent(`${casting.policy.seed}:coverage:${npc.npcId}`) >= coveragePercent) {
      counts.coverageSkipped += 1;
      continue;
    }
    const pool = casting.pools[faction];
    if (!pool) {
      throw new Error(`Interior sprite casting has no pool for ${faction}`);
    }
    const image = room?.fixedImage ?? (() => {
      const imageIndex = stablePercent(`${casting.policy.seed}:${faction}:${componentId}:${npc.npcId}`, pool.images.length);
      const usedImages = usedImagesByComponent.get(componentId) ?? new Set<string>();
      const selectedImage = firstUnusedImage(pool.images, imageIndex, usedImages);
      usedImages.add(selectedImage);
      usedImagesByComponent.set(componentId, usedImages);
      return selectedImage;
    })();
    byNpcId[String(npc.npcId)] = singleFrameOverride(image, pool, room);
    assignments.push({
      npcId: npc.npcId,
      componentId,
      ...(room ? { roomId: room.id } : {}),
      faction,
      image
    });
    counts.assigned += 1;
    if (faction === "friendly-lsw") {
      counts.friendlyLswAssigned += 1;
    } else {
      counts.hostileMiladyAssigned += 1;
    }
    if (room) {
      roomAssigned.set(room.id, (roomAssigned.get(room.id) ?? 0) + 1);
    }
  }

  return {
    byNpcId,
    report: {
      schema: "swagbound.interior-sprite-casting-report.v1",
      counts,
      rooms: casting.rooms.map((room) => ({
        id: room.id,
        faction: room.faction,
        componentIds: [...(componentIdsByRoom.get(room.id) ?? [])].sort((a, b) => a - b),
        eligibleNpcs: roomEligible.get(room.id) ?? 0,
        assignedNpcs: roomAssigned.get(room.id) ?? 0
      })),
      assignments
    }
  };
}

export function isLittleSwagWorldImage(image: string | undefined): boolean {
  return /\/(?:gns-|promo-)?lsw-/iu.test(image ?? "");
}

export function isMiladyFamilyImage(image: string | undefined): boolean {
  return /(?:milady|malady|midlady|mylady|vilady)/iu.test(image ?? "");
}

function singleFrameOverride(
  image: string,
  pool: InteriorSpritePool,
  room?: InteriorSpriteCasting["rooms"][number]
): SpriteOverride {
  return {
    image,
    frameWidth: pool.frameWidth,
    frameHeight: pool.frameHeight,
    animations: { down: [0], left: [0], right: [0], up: [0] },
    displayHeight: room?.displayHeight ?? pool.displayHeight,
    originX: pool.originX,
    originY: room?.originY ?? pool.originY,
    ...(room?.renderLayer ? { renderLayer: room.renderLayer } : {})
  };
}

function sectorIndexAt(
  point: { x: number; y: number },
  sectors: NonNullable<CastingWorld["sectors"]>
): number {
  const sectorWidth = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeight = sectors.sectorHeightTiles * sectors.tileSize;
  const col = Math.floor(point.x / sectorWidth);
  const row = Math.floor(point.y / sectorHeight);
  if (col < 0 || row < 0 || col >= sectors.cols || row >= sectors.rows) {
    return -1;
  }
  return row * sectors.cols + col;
}

function labelWalkableComponents(rows: readonly string[], width: number, height: number): Int32Array {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  let nextLabel = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (labels[start] !== 0 || rows[y]?.[x] === "1") {
        continue;
      }
      let head = 0;
      let tail = 0;
      labels[start] = nextLabel;
      queue[tail] = start;
      tail += 1;
      while (head < tail) {
        const index = queue[head];
        head += 1;
        const cellX = index % width;
        const cellY = Math.floor(index / width);
        enqueue(cellX + 1, cellY);
        enqueue(cellX - 1, cellY);
        enqueue(cellX, cellY + 1);
        enqueue(cellX, cellY - 1);
      }
      nextLabel += 1;

      function enqueue(cellX: number, cellY: number): void {
        if (cellX < 0 || cellY < 0 || cellX >= width || cellY >= height) {
          return;
        }
        const index = cellY * width + cellX;
        if (labels[index] !== 0 || rows[cellY]?.[cellX] === "1") {
          return;
        }
        labels[index] = nextLabel;
        queue[tail] = index;
        tail += 1;
      }
    }
  }
  return labels;
}

function nearestComponent(
  labels: Int32Array,
  width: number,
  height: number,
  cellSize: number,
  point: { x: number; y: number }
): number {
  const startX = Math.floor(point.x / cellSize);
  const startY = Math.floor(point.y / cellSize);
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const cellX = startX + dx;
        const cellY = startY + dy;
        if (cellX < 0 || cellY < 0 || cellX >= width || cellY >= height) {
          continue;
        }
        const label = labels[cellY * width + cellX];
        if (label > 0) {
          return label;
        }
      }
    }
  }
  return -1;
}

function stablePercent(value: string, modulus = 100): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % modulus;
}

function firstUnusedImage(images: readonly string[], startIndex: number, used: ReadonlySet<string>): string {
  for (let offset = 0; offset < images.length; offset += 1) {
    const image = images[(startIndex + offset) % images.length];
    if (!used.has(image)) {
      return image;
    }
  }
  return images[startIndex % images.length];
}
