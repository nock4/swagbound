export type Direction = "up" | "right" | "down" | "left";

export type SlicePaletteEntry = {
  symbol: string;
  name: string;
  solid: boolean;
  color: string;
  accent?: string;
};

export type SliceSprite = {
  id: string;
  groupId: number;
  role: "player" | "npc";
  colors: {
    hair: string;
    shirt: string;
    pants: string;
    accent: string;
    skin: string;
  };
};

export type SliceNpc = {
  id: number;
  name: string;
  sprite: string;
  position: { x: number; y: number };
  facing: Direction;
  dialogue: string[];
};

export type SliceSource = {
  id: string;
  title: string;
  description: string;
  tileSize: number;
  palette: SlicePaletteEntry[];
  grid: string[];
  player: {
    sprite: string;
    spawn: { x: number; y: number };
    facing: Direction;
  };
  sprites: SliceSprite[];
  npcs: SliceNpc[];
};

export type NormalizedSlice = SliceSource & {
  widthTiles: number;
  heightTiles: number;
  paletteBySymbol: Map<string, SlicePaletteEntry>;
  spritesById: Map<string, SliceSprite>;
};

export type AssetFile = {
  path: string;
  buffer: Buffer;
};
