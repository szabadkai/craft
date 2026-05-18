import { Block } from './types';

export const ATLAS_TILE_SIZE = 16;
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 14;

export const enum Tile {
  GrassTop = 0,
  GrassSide = 1,
  Dirt = 2,
  Stone = 3,
  LogSide = 4,
  LogTop = 5,
  Leaves = 6,
  Sand = 7,
  CoalOre = 8,
  IronOre = 9,
  Planks = 10,
  CraftingTable = 11,
  Furnace = 12,
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
  BirchLogSide = 23,
  BirchLogTop = 24,
  BirchLeaves = 25,
  MossyCobblestone = 26,
  Brick = 27,
  Glass = 28,
  CactusSide = 29,
  CactusTop = 30,
  Pumpkin = 31,
  BlueFlower = 32,
  Mushroom = 33,
  BerryBush = 34,
  Water = 35,
  Chest = 36,
  DoorOak = 37,
  Amethyst = 38,
  AmethystCluster = 39,
  MossBlock = 40,
  GlowBerry = 41,
  Lava = 42,
  Basalt = 43,
  MossyStoneBrick = 44,
  IronBars = 45,
  Spawner = 46,
  Mycelium = 47,
  MushroomStem = 48,
  MushroomCapRed = 49,
  MushroomCapBrown = 50,
  Obsidian = 51,
  Torch = 52,
  EmeraldOre = 53,
  RedstoneOre = 54,
}

export function tileForBlockFace(block: Block, normal: [number, number, number]): Tile {
  switch (block) {
    case Block.Grass:
      if (normal[1] > 0) return Tile.GrassTop;
      if (normal[1] < 0) return Tile.Dirt;
      return Tile.GrassSide;
    case Block.Dirt:
      return Tile.Dirt;
    case Block.Stone:
      return Tile.Stone;
    case Block.Log:
      return normal[1] === 0 ? Tile.LogSide : Tile.LogTop;
    case Block.Leaves:
      return Tile.Leaves;
    case Block.Sand:
      return Tile.Sand;
    case Block.Gravel:
      return Tile.Gravel;
    case Block.Clay:
      return Tile.Clay;
    case Block.Snow:
      return Tile.Snow;
    case Block.CoalOre:
      return Tile.CoalOre;
    case Block.IronOre:
      return Tile.IronOre;
    case Block.CopperOre:
      return Tile.CopperOre;
    case Block.GoldOre:
      return Tile.GoldOre;
    case Block.DiamondOre:
      return Tile.DiamondOre;
    case Block.Planks:
      return Tile.Planks;
    case Block.Cobblestone:
      return Tile.Cobblestone;
    case Block.BirchLog:
      return normal[1] === 0 ? Tile.BirchLogSide : Tile.BirchLogTop;
    case Block.BirchLeaves:
      return Tile.BirchLeaves;
    case Block.MossyCobblestone:
      return Tile.MossyCobblestone;
    case Block.Brick:
      return Tile.Brick;
    case Block.Glass:
      return Tile.Glass;
    case Block.Cactus:
      return normal[1] === 0 ? Tile.CactusSide : Tile.CactusTop;
    case Block.Pumpkin:
      return Tile.Pumpkin;
    case Block.TallGrass:
      return Tile.TallGrass;
    case Block.RedFlower:
      return Tile.RedFlower;
    case Block.YellowFlower:
      return Tile.YellowFlower;
    case Block.BlueFlower:
      return Tile.BlueFlower;
    case Block.Mushroom:
      return Tile.Mushroom;
    case Block.BerryBush:
      return Tile.BerryBush;
    case Block.Water:
      return Tile.Water;
    case Block.Chest:
      return Tile.Chest;
    case Block.Furnace:
      return Tile.Furnace;
    case Block.LogX:
      // horizontal along X: rings on X faces, bark on Y and Z
      return normal[0] !== 0 ? Tile.LogTop : Tile.LogSide;
    case Block.LogZ:
      // horizontal along Z: rings on Z faces, bark on X and Y
      return normal[2] !== 0 ? Tile.LogTop : Tile.LogSide;
    case Block.BirchLogX:
      // horizontal along X: rings on X faces, bark on Y and Z
      return normal[0] !== 0 ? Tile.BirchLogTop : Tile.BirchLogSide;
    case Block.BirchLogZ:
      // horizontal along Z: rings on Z faces, bark on X and Y
      return normal[2] !== 0 ? Tile.BirchLogTop : Tile.BirchLogSide;
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return Tile.DoorOak;
    case Block.Amethyst:
      return Tile.Amethyst;
    case Block.AmethystCluster:
      return Tile.AmethystCluster;
    case Block.MossBlock:
      return Tile.MossBlock;
    case Block.GlowBerry:
      return Tile.GlowBerry;
    case Block.Lava:
      return Tile.Lava;
    case Block.Basalt:
      return Tile.Basalt;
    case Block.MossyStoneBrick:
      return Tile.MossyStoneBrick;
    case Block.IronBars:
      return Tile.IronBars;
    case Block.Spawner:
      return Tile.Spawner;
    case Block.Mycelium:
      return Tile.Mycelium;
    case Block.MushroomStem:
      return Tile.MushroomStem;
    case Block.MushroomCapRed:
      return Tile.MushroomCapRed;
    case Block.MushroomCapBrown:
      return Tile.MushroomCapBrown;
    case Block.Obsidian:
      return Tile.Obsidian;
    case Block.Torch:
    case Block.TorchN:
    case Block.TorchS:
    case Block.TorchE:
    case Block.TorchW:
      return Tile.Torch;
    case Block.EmeraldOre:
      return Tile.EmeraldOre;
    case Block.RedstoneOre:
      return Tile.RedstoneOre;
    case Block.OakSlab:
    case Block.OakSlabTop:
      return Tile.Planks;
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return Tile.Cobblestone;
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return Tile.Planks;
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return Tile.Cobblestone;
    default:
      return Tile.Stone;
  }
}

export function tileUv(tile: Tile, u: number, v: number): [number, number] {
  const rect = tileRect(tile);
  return [rect[0] + rect[2] * u, rect[1] + rect[3] * v];
}

export function tileRect(tile: Tile): [number, number, number, number] {
  const col = tile % ATLAS_COLUMNS;
  const row = Math.floor(tile / ATLAS_COLUMNS);
  const minU = col / ATLAS_COLUMNS;
  const maxU = (col + 1) / ATLAS_COLUMNS;
  const minV = 1 - (row + 1) / ATLAS_ROWS;
  const maxV = 1 - row / ATLAS_ROWS;
  return [minU, minV, maxU - minU, maxV - minV];
}
