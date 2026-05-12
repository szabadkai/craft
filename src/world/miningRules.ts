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
    case Block.BirchLog:
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
    case Block.IronOre:
    case Block.GoldOre:
      return 1700 / speed;
    case Block.DiamondOre:
      return 2200 / speed;
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
    case Block.Leaves:
    case Block.BirchLeaves:
    case Block.Glass:
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
      return { item: 'wood', count: 1 };
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
    case Block.Furnace:
    case Block.Cobblestone:
    case Block.MossyCobblestone:
    case Block.Brick:
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
    case Block.MossyCobblestone:
    case Block.Brick:
      return tier >= 3 ? 3.35 : tier === 2 ? 2.5 : tier === 1 ? 1.8 : 1;
    case Block.IronOre:
    case Block.GoldOre:
    case Block.DiamondOre:
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
