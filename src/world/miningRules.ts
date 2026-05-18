import { Item } from '../inventory/items';
import { Block } from '../types';

export type MiningTool = 'hand' | 'stick' | 'wood_pickaxe' | 'stone_pickaxe' | 'iron_pickaxe';

export type MiningDrop = {
  item: Item;
  count: number;
};

export function blockHardness(block: Block, tool: MiningTool): number {
  const speed = miningSpeedMultiplier(block, tool);
  switch (block) {
    case Block.Grass:
    case Block.Dirt:
    case Block.Sand:
    case Block.Snow:
      return 260 / speed;
    case Block.Leaves:
    case Block.BirchLeaves:
      return 180 / speed;
    case Block.Log:
    case Block.LogX:
    case Block.LogZ:
    case Block.BirchLog:
    case Block.BirchLogX:
    case Block.BirchLogZ:
    case Block.Planks:
    case Block.CraftingTable:
      return 520 / speed;
    case Block.Cactus:
    case Block.Pumpkin:
      return 360 / speed;
    case Block.Glass:
      return 300 / speed;
    case Block.Stone:
    case Block.CoalOre:
    case Block.CopperOre:
    case Block.Furnace:
    case Block.Cobblestone:
    case Block.MossyCobblestone:
    case Block.Brick:
      return 1300 / speed;
    case Block.OakSlab:
    case Block.OakSlabTop:
      return 450 / speed;
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return 520 / speed;
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return 1000 / speed;
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return 1000 / speed;
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return 520 / speed;
    case Block.IronOre:
    case Block.GoldOre:
      return 1700 / speed;
    case Block.DiamondOre:
    case Block.EmeraldOre:
      return 2200 / speed;
    case Block.RedstoneOre:
      return 1500 / speed;
    case Block.Amethyst:
      return 1300 / speed;
    case Block.AmethystCluster:
      return 400 / speed;
    case Block.MossBlock:
      return 260 / speed;
    case Block.GlowBerry:
      return 180 / speed;
    case Block.Basalt:
      return 1500 / speed;
    case Block.MossyStoneBrick:
      return 1300 / speed;
    case Block.IronBars:
      return 1000 / speed;
    case Block.Spawner:
      return 2500 / speed;
    case Block.Mycelium:
      return 260 / speed;
    case Block.MushroomStem:
      return 400 / speed;
    case Block.MushroomCapRed:
    case Block.MushroomCapBrown:
      return 300 / speed;
    case Block.Obsidian:
      return 9000 / speed;
    default:
      return 450 / speed;
  }
}

export function miningDrop(block: Block, tool: MiningTool): MiningDrop | null {
  switch (block) {
    case Block.Grass:
    case Block.Dirt:
      return { item: 'dirt', count: 1 };
    case Block.Stone:
      return toolTier(tool) >= 1 ? { item: 'cobblestone', count: 1 } : null;
    case Block.CoalOre:
      return toolTier(tool) >= 1 ? { item: 'coal', count: 1 } : null;
    case Block.CopperOre:
      return toolTier(tool) >= 1 ? { item: 'copper_ore', count: 1 } : null;
    case Block.IronOre:
      return toolTier(tool) >= 2 ? { item: 'iron_ore', count: 1 } : null;
    case Block.GoldOre:
      return toolTier(tool) >= 2 ? { item: 'gold_ore', count: 1 } : null;
    case Block.DiamondOre:
      return toolTier(tool) >= 3 ? { item: 'diamond', count: 1 } : null;
    case Block.EmeraldOre:
      return toolTier(tool) >= 3 ? { item: 'emerald', count: 1 } : null;
    case Block.RedstoneOre:
      return toolTier(tool) >= 2 ? { item: 'redstone', count: 1 + Math.floor(Math.random() * 4) } : null;
    case Block.Leaves:
    case Block.BirchLeaves:
      if (Math.random() < 0.08) return { item: 'apple', count: 1 };
      if (Math.random() < 0.22) return { item: 'sticks', count: 1 };
      return null;
    case Block.Sand:
      return { item: 'sand', count: 1 };
    case Block.Cobblestone:
      return { item: 'cobblestone', count: 1 };
    case Block.MossyCobblestone:
      return { item: 'mossy_cobble', count: 1 };
    case Block.Brick:
      return { item: 'brick', count: 1 };
    case Block.Log:
    case Block.LogX:
    case Block.LogZ:
      return { item: 'wood', count: 1 };
    case Block.BirchLogX:
    case Block.BirchLogZ:
      return { item: 'birch_wood', count: 1 };
    case Block.BirchLog:
      return { item: 'birch_wood', count: 1 };
    case Block.Gravel:
      return { item: 'gravel', count: 1 };
    case Block.Clay:
      return { item: 'clay', count: 1 };
    case Block.Snow:
      return { item: 'snow', count: 1 };
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
      return { item: 'flower', count: 1 };
    case Block.Mushroom:
      return { item: 'mushroom', count: 1 };
    case Block.BerryBush:
      return { item: 'berries', count: 1 };
    case Block.Cactus:
      return { item: 'cactus', count: 1 };
    case Block.Pumpkin:
      return { item: 'pumpkin', count: 1 };
    case Block.Planks:
      return { item: 'planks', count: 1 };
    case Block.CraftingTable:
      return { item: 'crafting_table', count: 1 };
    case Block.Furnace:
      return { item: 'furnace', count: 1 };
    case Block.Torch:
      return { item: 'torch', count: 1 };
    case Block.OakSlab:
    case Block.OakSlabTop:
      return { item: 'oak_slab', count: 1 };
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return { item: 'oak_stairs', count: 1 };
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return { item: 'cobblestone_stairs', count: 1 };
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return { item: 'cobblestone_slab', count: 1 };
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return { item: 'oak_door', count: 1 };
    case Block.Amethyst:
      return toolTier(tool) >= 2 ? { item: 'amethyst', count: 1 } : null;
    case Block.AmethystCluster:
      return { item: 'amethyst_cluster', count: 1 };
    case Block.MossBlock:
      return { item: 'moss_block', count: 1 };
    case Block.GlowBerry:
      return { item: 'glow_berry', count: 1 };
    case Block.Basalt:
      return toolTier(tool) >= 1 ? { item: 'basalt', count: 1 } : null;
    case Block.MossyStoneBrick:
      return toolTier(tool) >= 1 ? { item: 'mossy_stone_brick', count: 1 } : null;
    case Block.IronBars:
      return toolTier(tool) >= 1 ? { item: 'iron_bars', count: 1 } : null;
    case Block.Spawner:
      return null;
    case Block.Mycelium:
      return { item: 'mycelium', count: 1 };
    case Block.MushroomStem:
      return { item: 'mushroom_stem', count: 1 };
    case Block.MushroomCapRed:
      return { item: 'mushroom_cap_red', count: 1 };
    case Block.MushroomCapBrown:
      return { item: 'mushroom_cap_brown', count: 1 };
    case Block.Obsidian:
      return toolTier(tool) >= 3 ? { item: 'obsidian', count: 1 } : null;
    default:
      return null;
  }
}

export function damagesTool(block: Block, tool: MiningTool): boolean {
  if (tool !== 'wood_pickaxe' && tool !== 'stone_pickaxe' && tool !== 'iron_pickaxe')
    return false;
  switch (block) {
    case Block.Stone:
    case Block.CoalOre:
    case Block.CopperOre:
    case Block.IronOre:
    case Block.GoldOre:
    case Block.DiamondOre:
    case Block.EmeraldOre:
    case Block.RedstoneOre:
    case Block.Furnace:
    case Block.Cobblestone:
    case Block.MossyCobblestone:
    case Block.Brick:
    case Block.Amethyst:
    case Block.Basalt:
    case Block.MossyStoneBrick:
    case Block.IronBars:
    case Block.Spawner:
    case Block.Obsidian:
      return true;
    default:
      return false;
  }
}

function miningSpeedMultiplier(block: Block, tool: MiningTool): number {
  const tier = toolTier(tool);
  switch (block) {
    case Block.Stone:
    case Block.CoalOre:
    case Block.CopperOre:
    case Block.Furnace:
    case Block.Cobblestone:
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
    case Block.MossyCobblestone:
    case Block.Brick:
    case Block.Amethyst:
    case Block.Basalt:
    case Block.MossyStoneBrick:
    case Block.IronBars:
    case Block.Spawner:
    case Block.Obsidian:
      return tier >= 3 ? 3.35 : tier === 2 ? 2.5 : tier === 1 ? 1.8 : 1;
    case Block.IronOre:
    case Block.GoldOre:
    case Block.DiamondOre:
    case Block.EmeraldOre:
    case Block.RedstoneOre:
      return tier >= 3 ? 3 : tier === 2 ? 2.2 : tier === 1 ? 1.25 : 1;
    default:
      return 1;
  }
}

function toolTier(tool: MiningTool): number {
  if (tool === 'iron_pickaxe') return 3;
  if (tool === 'stone_pickaxe') return 2;
  if (tool === 'wood_pickaxe') return 1;
  return 0;
}
