export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const DETAIL_RADIUS = 8;
export const PRELOAD_RADIUS = 10;
export const FAR_RADIUS = 42;

export enum Block {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Log = 4,
  Leaves = 5,
  Sand = 6,
  CoalOre = 7,
  IronOre = 8,
  Planks = 9,
  CraftingTable = 10,
  Furnace = 11,
  Torch = 12,
  Gravel = 13,
  Clay = 14,
  Snow = 15,
  CopperOre = 16,
  GoldOre = 17,
  DiamondOre = 18,
  TallGrass = 19,
  RedFlower = 20,
  YellowFlower = 21,
  Cobblestone = 22,
  BirchLog = 23,
  BirchLeaves = 24,
  MossyCobblestone = 25,
  Brick = 26,
  Glass = 27,
  Cactus = 28,
  Pumpkin = 29,
  BlueFlower = 30,
  Mushroom = 31,
  BerryBush = 32,
  Water = 33,
  Chest = 34,
  LogX = 35,
  LogZ = 36,
  OakDoor = 37,
  OakDoorOpen = 38,
  BirchLogX = 39,
  BirchLogZ = 40,
  OakSlab = 41,
  OakSlabTop = 42,
  CobblestoneSlab = 43,
  CobblestoneSlabTop = 44,
  OakStairsN = 45,
  OakStairsS = 46,
  OakStairsE = 47,
  OakStairsW = 48,
  CobblestoneStairsN = 49,
  CobblestoneStairsS = 50,
  CobblestoneStairsE = 51,
  CobblestoneStairsW = 52,
  Amethyst = 53,
  AmethystCluster = 54,
  MossBlock = 55,
  GlowBerry = 56,
  Lava = 57,
  Basalt = 58,
  MossyStoneBrick = 59,
  IronBars = 60,
  Spawner = 61,
  Mycelium = 62,
  MushroomStem = 63,
  MushroomCapRed = 64,
  MushroomCapBrown = 65,
  Obsidian = 66,
}

export type ChunkKey = `${number},${number}`;

export type ChunkMeshPayload = {
  key: ChunkKey;
  cx: number;
  cz: number;
  blocks: Uint16Array;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  atlas: Float32Array;
  indices: Uint32Array;
  waterPositions: Float32Array | null;
  waterNormals: Float32Array | null;
  waterIndices: Uint32Array | null;
  transparentPositions: Float32Array | null;
  transparentNormals: Float32Array | null;
  transparentColors: Float32Array | null;
  transparentUvs: Float32Array | null;
  transparentAtlas: Float32Array | null;
  transparentIndices: Uint32Array | null;
  decoPositions: Float32Array | null;
  decoNormals: Float32Array | null;
  decoColors: Float32Array | null;
  decoUvs: Float32Array | null;
  decoAtlas: Float32Array | null;
  decoIndices: Uint32Array | null;
};

/** Neighbor block data sent alongside a remesh so the mesher can look up
 *  player-modified blocks in adjacent chunks instead of falling back to
 *  generatedBlockAt(). Keys: 'px' (+X), 'nx' (-X), 'pz' (+Z), 'nz' (-Z). */
export type NeighborBlocks = {
  px?: Uint16Array; // chunk at (cx+1, cz)
  nx?: Uint16Array; // chunk at (cx-1, cz)
  pz?: Uint16Array; // chunk at (cx, cz+1)
  nz?: Uint16Array; // chunk at (cx, cz-1)
};

export type WorkerIn =
  | { type: 'generate'; cx: number; cz: number; seed: number }
  | { type: 'remesh'; cx: number; cz: number; seed: number; blocks: Uint16Array; neighbors?: NeighborBlocks };

export type WorkerOut =
  | { type: 'chunk'; payload: ChunkMeshPayload }
  | { type: 'error'; message: string; cx?: number; cz?: number };

export function chunkKey(cx: number, cz: number): ChunkKey {
  return `${cx},${cz}`;
}

export function blockIndex(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}

export function divFloor(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
