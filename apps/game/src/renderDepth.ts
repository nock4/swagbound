export type SpriteDepthAnchor = {
  y: number;
  originY: number;
  displayHeight: number;
};

export type SpriteRenderLayer = "world" | "foreground";
export const FOREGROUND_OCCLUDER_DEPTH = 100_000;

export function npcRenderLayer(npcType: string | undefined, inInterior: boolean): SpriteRenderLayer {
  return npcType === "person" && inInterior ? "foreground" : "world";
}

export function spriteBottomY(anchor: SpriteDepthAnchor): number {
  const y = finiteOr(anchor.y, 0);
  const originY = finiteOr(anchor.originY, 1);
  const displayHeight = Math.abs(finiteOr(anchor.displayHeight, 0));
  return y + (1 - originY) * displayHeight;
}

export function spriteSortDepth(worldBottomY: number, renderLayer: SpriteRenderLayer = "world"): number {
  const bottomY = finiteOr(worldBottomY, 0);
  return renderLayer === "foreground" ? FOREGROUND_OCCLUDER_DEPTH + 1 + bottomY : bottomY;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
