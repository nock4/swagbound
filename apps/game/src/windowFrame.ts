import type Phaser from "phaser";
import type { WindowCollection } from "@eb/schemas";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type WindowRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type WindowFlavor = WindowCollection["flavors"][number];

export type PreparedWindowFrames = {
  collection: WindowCollection;
  flavor: WindowFlavor;
  rawTextureKey: string;
  textureKey: string;
};

export type WindowFramePart = "corner" | "hEdge" | "vEdge";

export type WindowFramePlacement = {
  part: WindowFramePart;
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  flipX: boolean;
  flipY: boolean;
};

export type WindowFrameLayout = {
  interior: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  corners: {
    topLeft: WindowFramePlacement;
    topRight: WindowFramePlacement;
    bottomLeft: WindowFramePlacement;
    bottomRight: WindowFramePlacement;
  };
  top: WindowFramePlacement[];
  bottom: WindowFramePlacement[];
  left: WindowFramePlacement[];
  right: WindowFramePlacement[];
};

export type ProcessedWindowImage = {
  imageData: ImageData;
  transparentKey: RgbColor;
  transparentPixels: number;
  opaquePixels: number;
  verified: boolean;
};

export type WindowFrameOptions = {
  scale?: number;
};

export type MoreArrowPlacementOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  arrowWidth: number;
  arrowHeight: number;
  horizontalPadding: number;
  verticalPadding: number;
  rightFrameThickness: number;
  bottomFrameThickness: number;
  innerPadding?: number;
  bottomInnerPadding?: number;
};

export type MoreArrowPlacement = {
  x: number;
  y: number;
  right: number;
  bottom: number;
  rightInnerEdge: number;
  bottomInnerEdge: number;
};

const DEFAULT_WINDOW_SCALE = 2;
const WINDOW_FRAME_NAMES: Record<WindowFramePart | "moreArrow", string> = {
  corner: "corner",
  hEdge: "h-edge",
  vEdge: "v-edge",
  moreArrow: "more-arrow"
};

export function rawWindowTextureKey(flavor: Pick<WindowFlavor, "id">): string {
  return `earthbound-window-raw-${flavor.id}`;
}

export function processedWindowTextureKey(flavor: Pick<WindowFlavor, "id">): string {
  return `earthbound-window-processed-${flavor.id}`;
}

export function windowFrameName(part: WindowFramePart | "moreArrow"): string {
  return WINDOW_FRAME_NAMES[part];
}

export function moreArrowPlacement(options: MoreArrowPlacementOptions): MoreArrowPlacement {
  const arrowWidth = Math.max(0, options.arrowWidth);
  const arrowHeight = Math.max(0, options.arrowHeight);
  const innerPadding = Math.max(0, options.innerPadding ?? 0);
  const bottomInnerPadding = Math.max(0, options.bottomInnerPadding ?? innerPadding);
  const rightInnerEdge = Math.max(
    options.x,
    options.x + Math.max(0, options.width) - Math.max(0, options.rightFrameThickness) - innerPadding
  );
  const bottomInnerEdge = Math.max(
    options.y,
    options.y + Math.max(0, options.height) - Math.max(0, options.bottomFrameThickness) - bottomInnerPadding
  );
  const preferredX = options.x + Math.max(0, options.width) - Math.max(0, options.horizontalPadding) - arrowWidth;
  const maxX = rightInnerEdge - arrowWidth;
  const arrowX = Math.round(Math.min(preferredX, maxX));
  const preferredY = options.y + Math.max(0, options.height) - Math.max(0, options.verticalPadding) - arrowHeight;
  const maxY = bottomInnerEdge - arrowHeight;
  const arrowY = Math.round(Math.min(preferredY, maxY));

  return {
    x: arrowX,
    y: arrowY,
    right: arrowX + arrowWidth,
    bottom: arrowY + arrowHeight,
    rightInnerEdge,
    bottomInnerEdge
  };
}

export function queueWindowFrameAssets(
  scene: Phaser.Scene,
  window: WindowCollection | undefined,
  flavorId?: number
): void {
  if (!window) {
    return;
  }
  const flavors = flavorId === undefined ? window.flavors : [selectWindowFlavor(window, flavorId)].filter(isWindowFlavor);
  for (const flavor of flavors) {
    const key = rawWindowTextureKey(flavor);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `/generated/${flavor.file}`);
    }
  }
}

export function prepareWindowFrames(
  scene: Phaser.Scene,
  window: WindowCollection | undefined,
  flavorId?: number
): PreparedWindowFrames | undefined {
  const flavor = selectWindowFlavor(window, flavorId);
  if (!window || !flavor) {
    return undefined;
  }

  const rawTextureKey = rawWindowTextureKey(flavor);
  const textureKey = processedWindowTextureKey(flavor);
  if (!scene.textures.exists(textureKey)) {
    if (!scene.textures.exists(rawTextureKey)) {
      return undefined;
    }
    if (!createProcessedWindowTexture(scene, rawTextureKey, textureKey, flavor, window.transparentKey)) {
      return undefined;
    }
  }

  const texture = scene.textures.get(textureKey);
  const frames: Array<[WindowFramePart | "moreArrow", WindowRect]> = [
    ["corner", flavor.corner],
    ["hEdge", flavor.hEdge],
    ["vEdge", flavor.vEdge],
    ["moreArrow", flavor.moreArrow]
  ];
  for (const [part, rect] of frames) {
    const frameName = windowFrameName(part);
    if (!texture.has(frameName)) {
      texture.add(frameName, 0, rect.x, rect.y, rect.w, rect.h);
    }
  }

  return { collection: window, flavor, rawTextureKey, textureKey };
}

export function processWindowImageData(
  imageData: ImageData,
  transparentKey: RgbColor
): ProcessedWindowImage {
  const data = imageData.data;
  let transparentPixels = 0;
  let opaquePixels = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const isTransparentKey =
      data[offset] === transparentKey.r &&
      data[offset + 1] === transparentKey.g &&
      data[offset + 2] === transparentKey.b;
    if (isTransparentKey) {
      data[offset + 3] = 0;
      transparentPixels += 1;
      continue;
    }
    opaquePixels += 1;
  }

  return {
    imageData,
    transparentKey,
    transparentPixels,
    opaquePixels,
    verified: transparentPixels > 0 && opaquePixels > 0
  };
}

export function buildWindowFrameLayout(
  width: number,
  height: number,
  rects: Pick<WindowFlavor, "corner" | "hEdge" | "vEdge">,
  scale = DEFAULT_WINDOW_SCALE
): WindowFrameLayout {
  const integerWidth = Math.max(0, Math.round(width));
  const integerHeight = Math.max(0, Math.round(height));
  const integerScaleValue = integerScale(scale);
  const cornerWidth = rects.corner.w * integerScaleValue;
  const cornerHeight = rects.corner.h * integerScaleValue;
  const hEdgeWidth = rects.hEdge.w * integerScaleValue;
  const vEdgeHeight = rects.vEdge.h * integerScaleValue;
  const frameWidth = Math.min(cornerWidth, integerWidth);
  const frameHeight = Math.min(cornerHeight, integerHeight);
  const rightX = Math.max(0, integerWidth - frameWidth);
  const bottomY = Math.max(0, integerHeight - frameHeight);
  const horizontalStart = frameWidth;
  const horizontalLength = Math.max(0, integerWidth - frameWidth * 2);
  const verticalStart = frameHeight;
  const verticalLength = Math.max(0, integerHeight - frameHeight * 2);
  const cornerSourceWidth = frameWidth / integerScaleValue;
  const cornerSourceHeight = frameHeight / integerScaleValue;
  const interiorX = Math.min(cornerWidth, integerWidth);
  const interiorY = Math.min(cornerHeight, integerHeight);

  return {
    interior: {
      x: interiorX,
      y: interiorY,
      width: Math.max(0, integerWidth - cornerWidth * 2),
      height: Math.max(0, integerHeight - cornerHeight * 2)
    },
    corners: {
      topLeft: placement("corner", 0, 0, frameWidth, frameHeight, cornerSourceWidth, cornerSourceHeight, false, false),
      topRight: placement("corner", rightX, 0, frameWidth, frameHeight, cornerSourceWidth, cornerSourceHeight, true, false),
      bottomLeft: placement("corner", 0, bottomY, frameWidth, frameHeight, cornerSourceWidth, cornerSourceHeight, false, true),
      bottomRight: placement("corner", rightX, bottomY, frameWidth, frameHeight, cornerSourceWidth, cornerSourceHeight, true, true)
    },
    top: horizontalTiles("hEdge", horizontalStart, 0, horizontalLength, hEdgeWidth, frameHeight, rects.hEdge, integerScaleValue, false),
    bottom: horizontalTiles(
      "hEdge",
      horizontalStart,
      bottomY,
      horizontalLength,
      hEdgeWidth,
      frameHeight,
      rects.hEdge,
      integerScaleValue,
      true
    ),
    left: verticalTiles("vEdge", 0, verticalStart, verticalLength, frameWidth, vEdgeHeight, rects.vEdge, integerScaleValue, false),
    right: verticalTiles(
      "vEdge",
      rightX,
      verticalStart,
      verticalLength,
      frameWidth,
      vEdgeHeight,
      rects.vEdge,
      integerScaleValue,
      true
    )
  };
}

export function drawWindowFrame(
  scene: Phaser.Scene,
  prepared: PreparedWindowFrames,
  x: number,
  y: number,
  width: number,
  height: number,
  options: WindowFrameOptions = {}
): Phaser.GameObjects.Container {
  const scale = integerScale(options.scale ?? DEFAULT_WINDOW_SCALE);
  const layout = buildWindowFrameLayout(width, height, prepared.flavor, scale);
  const container = scene.add.container(Math.round(x), Math.round(y));
  if (layout.interior.width > 0 && layout.interior.height > 0) {
    const interior = scene.add.rectangle(
      layout.interior.x,
      layout.interior.y,
      layout.interior.width,
      layout.interior.height,
      rgbToNumber(prepared.flavor.interiorColor),
      1
    ).setOrigin(0, 0);
    container.add(interior);
  }

  const placements = [
    layout.corners.topLeft,
    layout.corners.topRight,
    layout.corners.bottomLeft,
    layout.corners.bottomRight,
    ...layout.top,
    ...layout.bottom,
    ...layout.left,
    ...layout.right
  ];

  for (const item of placements) {
    if (item.displayWidth <= 0 || item.displayHeight <= 0 || item.sourceWidth <= 0 || item.sourceHeight <= 0) {
      continue;
    }
    const image = scene.add.image(
      item.x,
      item.y,
      prepared.textureKey,
      windowFrameName(item.part)
    ).setOrigin(0, 0).setFlip(item.flipX, item.flipY);
    if (item.sourceWidth !== prepared.flavor[item.part].w || item.sourceHeight !== prepared.flavor[item.part].h) {
      image.setCrop(0, 0, item.sourceWidth, item.sourceHeight);
    }
    image.setScale(item.displayWidth / item.sourceWidth, item.displayHeight / item.sourceHeight);
    container.add(image);
  }

  return container;
}

function selectWindowFlavor(
  window: WindowCollection | undefined,
  flavorId?: number
): WindowFlavor | undefined {
  if (!window) {
    return undefined;
  }
  const selectedFlavorId = flavorId ?? window.defaultFlavorId;
  return window.flavors.find((flavor) => flavor.id === selectedFlavorId);
}

function isWindowFlavor(flavor: WindowFlavor | undefined): flavor is WindowFlavor {
  return Boolean(flavor);
}

function createProcessedWindowTexture(
  scene: Phaser.Scene,
  rawTextureKey: string,
  textureKey: string,
  flavor: WindowFlavor,
  transparentKey: RgbColor
): boolean {
  const source = scene.textures.get(rawTextureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return false;
  }

  const width = source.width;
  const height = source.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, width, height);
  const result = processWindowImageData(context.getImageData(0, 0, width, height), transparentKey);
  if (!result.verified || !rectsFitSource(flavor, width, height)) {
    return false;
  }
  context.clearRect(0, 0, width, height);
  context.putImageData(result.imageData, 0, 0);
  scene.textures.addCanvas(textureKey, canvas);
  return true;
}

function horizontalTiles(
  part: "hEdge",
  x: number,
  y: number,
  length: number,
  tileWidth: number,
  tileHeight: number,
  sourceRect: Pick<WindowRect, "w" | "h">,
  scale: number,
  flipY: boolean
): WindowFramePlacement[] {
  if (length <= 0) {
    return [];
  }
  // The edge tile is a uniform double-line; stretch ONE full tile across the
  // whole span (visually identical to tiling) so there are no partial tiles —
  // partial tiles need setCrop, which misrenders when combined with setFlip
  // under the Canvas renderer and leaves a notch hanging past the frame.
  void scale;
  return [placement(part, x, y, length, tileHeight, sourceRect.w, sourceRect.h, false, flipY)];
}

function verticalTiles(
  part: "vEdge",
  x: number,
  y: number,
  length: number,
  tileWidth: number,
  tileHeight: number,
  sourceRect: Pick<WindowRect, "w" | "h">,
  scale: number,
  flipX: boolean
): WindowFramePlacement[] {
  if (length <= 0) {
    return [];
  }
  // Stretch ONE full vertical edge tile across the whole span (see note in
  // horizontalTiles) — avoids partial-tile setCrop+setFlip notch artifacts.
  void scale;
  return [placement(part, x, y, tileWidth, length, sourceRect.w, sourceRect.h, flipX, false)];
}

function placement(
  part: WindowFramePart,
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  flipX: boolean,
  flipY: boolean
): WindowFramePlacement {
  return {
    part,
    x,
    y,
    displayWidth,
    displayHeight,
    sourceWidth,
    sourceHeight,
    flipX,
    flipY
  };
}

function rectsFitSource(flavor: WindowFlavor, width: number, height: number): boolean {
  return [flavor.corner, flavor.hEdge, flavor.vEdge, flavor.moreArrow].every((rect) => (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= width &&
    rect.y + rect.h <= height
  ));
}

function rgbToNumber(color: RgbColor): number {
  return ((color.r & 0xff) << 16) | ((color.g & 0xff) << 8) | (color.b & 0xff);
}

function integerScale(scale = 1): number {
  return Math.max(1, Math.round(scale));
}
