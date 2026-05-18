import { Block } from './types';

export const solidBlocks = new Set<Block>([
  Block.Grass,
  Block.Dirt,
  Block.Stone,
  Block.Log,
  Block.Leaves,
  Block.Sand,
  Block.CoalOre,
  Block.IronOre,
  Block.CopperOre,
  Block.GoldOre,
  Block.DiamondOre,
  Block.Planks,
  Block.Gravel,
  Block.Clay,
  Block.Snow,
  Block.Cobblestone,
  Block.BirchLog,
  Block.BirchLeaves,
  Block.MossyCobblestone,
  Block.Brick,
  Block.Glass,
  Block.Cactus,
  Block.Pumpkin,
  Block.CraftingTable,
  Block.Furnace,
  Block.LogX,
  Block.LogZ,
  Block.BirchLogX,
  Block.BirchLogZ,
  Block.OakSlab,
  Block.OakSlabTop,
  Block.CobblestoneSlab,
  Block.CobblestoneSlabTop,
  Block.Amethyst,
  Block.MossBlock,
  Block.Basalt,
  Block.MossyStoneBrick,
  Block.Spawner,
  Block.Mycelium,
  Block.MushroomStem,
  Block.MushroomCapRed,
  Block.MushroomCapBrown,
  Block.Obsidian,
  Block.EmeraldOre,
  Block.RedstoneOre,
]);

export const selectableBlocks = [
  Block.Grass,
  Block.Dirt,
  Block.Stone,
  Block.Log,
  Block.BirchLog,
  Block.Planks,
  Block.MossyCobblestone,
  Block.Brick,
  Block.Glass,
  Block.Cactus,
  Block.Pumpkin,
  Block.CraftingTable,
  Block.Chest,
  Block.LogX,
  Block.LogZ,
  Block.BirchLogX,
  Block.BirchLogZ,
  Block.OakSlab,
  Block.OakSlabTop,
  Block.CobblestoneSlab,
  Block.CobblestoneSlabTop,
  Block.OakStairsN,
  Block.CobblestoneStairsN,
  Block.OakDoor,
] as const;

export function isSolid(block: Block): boolean {
  return solidBlocks.has(block);
}

export function blockColor(block: Block): [number, number, number] {
  switch (block) {
    case Block.Grass:
      return [0.42, 0.46, 0.25];
    case Block.Dirt:
      return [0.49, 0.33, 0.22];
    case Block.Stone:
      return [0.45, 0.46, 0.45];
    case Block.Log:
      return [0.47, 0.29, 0.13];
    case Block.Leaves:
      return [0.34, 0.4, 0.24];
    case Block.Sand:
      return [0.74, 0.66, 0.45];
    case Block.Gravel:
      return [0.42, 0.42, 0.4];
    case Block.Clay:
      return [0.46, 0.55, 0.58];
    case Block.Snow:
      return [0.82, 0.87, 0.88];
    case Block.CoalOre:
      return [0.22, 0.22, 0.21];
    case Block.IronOre:
      return [0.62, 0.48, 0.35];
    case Block.CopperOre:
      return [0.55, 0.38, 0.25];
    case Block.GoldOre:
      return [0.76, 0.62, 0.22];
    case Block.DiamondOre:
      return [0.28, 0.72, 0.78];
    case Block.Planks:
      return [0.64, 0.45, 0.24];
    case Block.Cobblestone:
      return [0.38, 0.39, 0.38];
    case Block.BirchLog:
      return [0.78, 0.72, 0.58];
    case Block.BirchLeaves:
      return [0.49, 0.53, 0.28];
    case Block.MossyCobblestone:
      return [0.32, 0.43, 0.28];
    case Block.Brick:
      return [0.58, 0.25, 0.19];
    case Block.Glass:
      return [0.62, 0.84, 0.9];
    case Block.Cactus:
      return [0.2, 0.56, 0.27];
    case Block.Pumpkin:
      return [0.86, 0.45, 0.12];
    case Block.RedFlower:
      return [0.78, 0.12, 0.11];
    case Block.YellowFlower:
      return [0.95, 0.78, 0.18];
    case Block.BlueFlower:
      return [0.24, 0.36, 0.9];
    case Block.Mushroom:
      return [0.72, 0.32, 0.22];
    case Block.BerryBush:
      return [0.25, 0.48, 0.2];
    case Block.TallGrass:
      return [0.48, 0.51, 0.28];
    case Block.Water:
      return [0.25, 0.48, 0.82];
    case Block.CraftingTable:
      return [0.58, 0.36, 0.18];
    case Block.Furnace:
      return [0.32, 0.33, 0.34];
    case Block.LogX:
    case Block.LogZ:
      return [0.47, 0.29, 0.13];
    case Block.BirchLogX:
    case Block.BirchLogZ:
      return [0.78, 0.72, 0.58];
    case Block.OakSlab:
    case Block.OakSlabTop:
      return [0.64, 0.45, 0.24];
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return [0.38, 0.39, 0.38];
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return [0.64, 0.45, 0.24];
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return [0.38, 0.39, 0.38];
    case Block.Torch:
    case Block.TorchN:
    case Block.TorchS:
    case Block.TorchE:
    case Block.TorchW:
      return [1.0, 0.78, 0.25];
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return [0.64, 0.45, 0.24];
    case Block.Amethyst:
      return [0.55, 0.32, 0.72];
    case Block.AmethystCluster:
      return [0.68, 0.45, 0.82];
    case Block.MossBlock:
      return [0.28, 0.52, 0.22];
    case Block.GlowBerry:
      return [0.85, 0.72, 0.18];
    case Block.Lava:
      return [0.92, 0.42, 0.08];
    case Block.Basalt:
      return [0.25, 0.24, 0.26];
    case Block.MossyStoneBrick:
      return [0.38, 0.44, 0.34];
    case Block.IronBars:
      return [0.52, 0.52, 0.52];
    case Block.Spawner:
      return [0.22, 0.28, 0.22];
    case Block.Mycelium:
      return [0.52, 0.42, 0.55];
    case Block.MushroomStem:
      return [0.82, 0.78, 0.72];
    case Block.MushroomCapRed:
      return [0.72, 0.15, 0.12];
    case Block.MushroomCapBrown:
      return [0.52, 0.32, 0.18];
    case Block.Obsidian:
      return [0.12, 0.08, 0.16];
    case Block.EmeraldOre:
      return [0.22, 0.72, 0.32];
    case Block.RedstoneOre:
      return [0.72, 0.18, 0.18];
    default:
      return [1, 1, 1];
  }
}
