import type { FgClearRect } from "@eb/schemas";
import type { ChunkCoord } from "./chunkStreaming";

export type ChunkLocalFgClear = FgClearRect & {
  worldX: number;
  worldY: number;
};

export function fgClearsForChunk(
  clears: readonly FgClearRect[],
  chunk: ChunkCoord,
  chunkSize: number
): ChunkLocalFgClear[] {
  if (chunkSize <= 0) {
    return [];
  }
  const chunkX = chunk.cx * chunkSize;
  const chunkY = chunk.cy * chunkSize;
  const chunkRight = chunkX + chunkSize;
  const chunkBottom = chunkY + chunkSize;
  const result: ChunkLocalFgClear[] = [];

  for (const clear of clears) {
    const left = Math.max(clear.x, chunkX);
    const top = Math.max(clear.y, chunkY);
    const right = Math.min(clear.x + clear.w, chunkRight);
    const bottom = Math.min(clear.y + clear.h, chunkBottom);
    if (right <= left || bottom <= top) {
      continue;
    }
    result.push({
      x: left - chunkX,
      y: top - chunkY,
      w: right - left,
      h: bottom - top,
      worldX: left,
      worldY: top,
      ...(clear.note ? { note: clear.note } : {})
    });
  }

  return result;
}

export function fgClearTextureHash(clears: readonly ChunkLocalFgClear[]): string {
  let hash = 2166136261;
  for (const clear of clears) {
    const encoded = `${clear.worldX},${clear.worldY},${clear.x},${clear.y},${clear.w},${clear.h},${clear.note ?? ""};`;
    for (let i = 0; i < encoded.length; i += 1) {
      hash ^= encoded.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}
