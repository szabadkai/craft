export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
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
};

export type WorkerIn =
  | { type: 'generate'; cx: number; cz: number; seed: number }
  | { type: 'remesh'; cx: number; cz: number; seed: number; blocks: Uint16Array };

export type WorkerOut =
  | { type: 'chunk'; payload: ChunkMeshPayload }
  | { type: 'error'; message: string };

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
