import { blockColor } from '../blocks';
import { Block } from '../types';

export type Item =
  | 'wood'
  | 'planks'
  | 'sticks'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'coal'
  | 'iron_ore'
  | 'copper_ore'
  | 'gold_ore'
  | 'diamond'
  | 'iron_ingot'
  | 'copper_ingot'
  | 'gold_ingot'
  | 'gravel'
  | 'clay'
  | 'snow'
  | 'cobblestone'
  | 'flower'
  | 'birch_wood'
  | 'mossy_cobble'
  | 'brick'
  | 'glass'
  | 'cactus'
  | 'pumpkin'
  | 'mushroom'
  | 'berries'
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  | 'torch'
  | 'crafting_table'
  | 'furnace'
  | 'chest'
  | 'apple'
  | 'raw_meat'
  | 'cooked_meat'
  | 'oak_door'
  | 'oak_slab'
  | 'cobblestone_slab'
  | 'oak_stairs'
  | 'cobblestone_stairs'
  | 'amethyst'
  | 'amethyst_cluster'
  | 'moss_block'
  | 'glow_berry'
  | 'basalt'
  | 'mossy_stone_brick'
  | 'iron_bars'
  | 'mycelium'
  | 'mushroom_stem'
  | 'mushroom_cap_red'
  | 'mushroom_cap_brown'
  | 'obsidian';

export type Recipe = {
  name: string;
  inputs: Partial<Record<Item, number>>;
  outputs: Partial<Record<Item, number>>;
};

export type HeldItem =
  | { kind: 'block'; block: Block; label: string; item: Item | null }
  | {
      kind: 'tool';
      tool: 'stick' | 'wood_pickaxe' | 'stone_pickaxe' | 'iron_pickaxe';
      label: string;
      item: Item;
    };

export type ItemDef = {
  id: Item;
  label: string;
  category: 'Blocks' | 'Materials' | 'Tools' | 'Food';
  block?: Block;
  tool?: 'stick' | 'wood_pickaxe' | 'stone_pickaxe' | 'iron_pickaxe';
  stackLimit?: number;
  durability?: number;
  foodValue?: number;
};

export const defaultInventoryCounts: Record<Item, number> = {
  wood: 0,
  planks: 8,
  sticks: 0,
  dirt: 0,
  stone: 0,
  sand: 0,
  coal: 0,
  iron_ore: 0,
  copper_ore: 0,
  gold_ore: 0,
  diamond: 0,
  iron_ingot: 0,
  copper_ingot: 0,
  gold_ingot: 0,
  gravel: 0,
  clay: 0,
  snow: 0,
  cobblestone: 0,
  flower: 0,
  birch_wood: 0,
  mossy_cobble: 0,
  brick: 0,
  glass: 0,
  cactus: 0,
  pumpkin: 0,
  mushroom: 0,
  berries: 0,
  wood_pickaxe: 0,
  stone_pickaxe: 0,
  iron_pickaxe: 0,
  torch: 0,
  crafting_table: 0,
  furnace: 0,
  chest: 0,
  apple: 0,
  raw_meat: 0,
  cooked_meat: 0,
  oak_door: 0,
  oak_slab: 0,
  cobblestone_slab: 0,
  oak_stairs: 0,
  cobblestone_stairs: 0,
  amethyst: 0,
  amethyst_cluster: 0,
  moss_block: 0,
  glow_berry: 0,
  basalt: 0,
  mossy_stone_brick: 0,
  iron_bars: 0,
  mycelium: 0,
  mushroom_stem: 0,
  mushroom_cap_red: 0,
  mushroom_cap_brown: 0,
  obsidian: 0,
};

export const recipes: Recipe[] = [
  { name: 'Planks', inputs: { wood: 1 }, outputs: { planks: 4 } },
  { name: 'Sticks', inputs: { planks: 2 }, outputs: { sticks: 4 } },
  { name: 'Wood Pick', inputs: { planks: 3, sticks: 2 }, outputs: { wood_pickaxe: 1 } },
  { name: 'Stone Pick', inputs: { cobblestone: 3, sticks: 2 }, outputs: { stone_pickaxe: 1 } },
  { name: 'Iron Pick', inputs: { iron_ingot: 3, sticks: 2 }, outputs: { iron_pickaxe: 1 } },
  { name: 'Torch', inputs: { coal: 1, sticks: 1 }, outputs: { torch: 4 } },
  { name: 'Table', inputs: { planks: 4 }, outputs: { crafting_table: 1 } },
  { name: 'Furnace', inputs: { cobblestone: 8 }, outputs: { furnace: 1 } },
  { name: 'Bricks', inputs: { clay: 2 }, outputs: { brick: 2 } },
  { name: 'Glass', inputs: { sand: 2 }, outputs: { glass: 2 } },
  { name: 'Chest', inputs: { planks: 8 }, outputs: { chest: 1 } },
  { name: 'Oak Door', inputs: { planks: 6 }, outputs: { oak_door: 3 } },
  { name: 'Oak Slab', inputs: { planks: 3 }, outputs: { oak_slab: 6 } },
  { name: 'Cobble Slab', inputs: { cobblestone: 3 }, outputs: { cobblestone_slab: 6 } },
  { name: 'Oak Stairs', inputs: { planks: 6 }, outputs: { oak_stairs: 4 } },
  { name: 'Cobble Stairs', inputs: { cobblestone: 6 }, outputs: { cobblestone_stairs: 4 } },
];

export const itemDefs: ItemDef[] = [
  { id: 'dirt', label: 'Dirt', category: 'Blocks', block: Block.Dirt },
  { id: 'stone', label: 'Stone', category: 'Blocks', block: Block.Stone },
  { id: 'sand', label: 'Sand', category: 'Blocks', block: Block.Sand },
  { id: 'wood', label: 'Log', category: 'Blocks', block: Block.Log },
  { id: 'birch_wood', label: 'Birch Log', category: 'Blocks', block: Block.BirchLog },
  { id: 'planks', label: 'Planks', category: 'Blocks', block: Block.Planks },
  { id: 'crafting_table', label: 'Table', category: 'Blocks', block: Block.CraftingTable },
  { id: 'furnace', label: 'Furnace', category: 'Blocks', block: Block.Furnace },
  { id: 'chest', label: 'Chest', category: 'Blocks', block: Block.Chest },
  { id: 'cobblestone', label: 'Cobble', category: 'Blocks', block: Block.Cobblestone },
  { id: 'mossy_cobble', label: 'Mossy', category: 'Blocks', block: Block.MossyCobblestone },
  { id: 'brick', label: 'Brick', category: 'Blocks', block: Block.Brick },
  { id: 'glass', label: 'Glass', category: 'Blocks', block: Block.Glass },
  { id: 'gravel', label: 'Gravel', category: 'Blocks', block: Block.Gravel },
  { id: 'clay', label: 'Clay', category: 'Blocks', block: Block.Clay },
  { id: 'snow', label: 'Snow', category: 'Blocks', block: Block.Snow },
  { id: 'cactus', label: 'Cactus', category: 'Blocks', block: Block.Cactus },
  { id: 'pumpkin', label: 'Pumpkin', category: 'Blocks', block: Block.Pumpkin },
  { id: 'flower', label: 'Flower', category: 'Blocks', block: Block.RedFlower },
  { id: 'mushroom', label: 'Mushroom', category: 'Blocks', block: Block.Mushroom },
  { id: 'berries', label: 'Berries', category: 'Blocks', block: Block.BerryBush },
  { id: 'sticks', label: 'Stick', category: 'Tools', tool: 'stick' },
  {
    id: 'wood_pickaxe',
    label: 'Wood Pick',
    category: 'Tools',
    tool: 'wood_pickaxe',
    durability: 32,
  },
  {
    id: 'stone_pickaxe',
    label: 'Stone Pick',
    category: 'Tools',
    tool: 'stone_pickaxe',
    durability: 80,
  },
  {
    id: 'iron_pickaxe',
    label: 'Iron Pick',
    category: 'Tools',
    tool: 'iron_pickaxe',
    durability: 160,
  },
  { id: 'coal', label: 'Coal', category: 'Materials' },
  { id: 'iron_ore', label: 'Iron Ore', category: 'Materials' },
  { id: 'copper_ore', label: 'Copper Ore', category: 'Materials' },
  { id: 'gold_ore', label: 'Gold Ore', category: 'Materials' },
  { id: 'diamond', label: 'Diamond', category: 'Materials' },
  { id: 'iron_ingot', label: 'Iron Ingot', category: 'Materials' },
  { id: 'copper_ingot', label: 'Copper Ingot', category: 'Materials' },
  { id: 'gold_ingot', label: 'Gold Ingot', category: 'Materials' },
  { id: 'torch', label: 'Torch', category: 'Materials' },
  { id: 'apple', label: 'Apple', category: 'Food', foodValue: 4, stackLimit: 16 },
  { id: 'raw_meat', label: 'Raw Meat', category: 'Food', foodValue: 3, stackLimit: 16 },
  { id: 'cooked_meat', label: 'Cooked Meat', category: 'Food', foodValue: 7, stackLimit: 16 },
  { id: 'oak_door', label: 'Oak Door', category: 'Blocks', block: Block.OakDoor },
  { id: 'oak_slab', label: 'Oak Slab', category: 'Blocks', block: Block.OakSlab },
  { id: 'cobblestone_slab', label: 'Cobble Slab', category: 'Blocks', block: Block.CobblestoneSlab },
  { id: 'oak_stairs', label: 'Oak Stairs', category: 'Blocks', block: Block.OakStairsN },
  { id: 'cobblestone_stairs', label: 'Cobble Stairs', category: 'Blocks', block: Block.CobblestoneStairsN },
  { id: 'amethyst', label: 'Amethyst', category: 'Blocks', block: Block.Amethyst },
  { id: 'amethyst_cluster', label: 'Amethyst Cluster', category: 'Blocks', block: Block.AmethystCluster },
  { id: 'moss_block', label: 'Moss Block', category: 'Blocks', block: Block.MossBlock },
  { id: 'glow_berry', label: 'Glow Berry', category: 'Blocks', block: Block.GlowBerry },
  { id: 'basalt', label: 'Basalt', category: 'Blocks', block: Block.Basalt },
  { id: 'mossy_stone_brick', label: 'Mossy Brick', category: 'Blocks', block: Block.MossyStoneBrick },
  { id: 'iron_bars', label: 'Iron Bars', category: 'Blocks', block: Block.IronBars },
  { id: 'mycelium', label: 'Mycelium', category: 'Blocks', block: Block.Mycelium },
  { id: 'mushroom_stem', label: 'Shroom Stem', category: 'Blocks', block: Block.MushroomStem },
  { id: 'mushroom_cap_red', label: 'Red Cap', category: 'Blocks', block: Block.MushroomCapRed },
  { id: 'mushroom_cap_brown', label: 'Brown Cap', category: 'Blocks', block: Block.MushroomCapBrown },
  { id: 'obsidian', label: 'Obsidian', category: 'Blocks', block: Block.Obsidian },
];

export function blockToItem(block: Block): Item | null {
  switch (block) {
    case Block.Grass:
    case Block.Dirt:
      return 'dirt';
    case Block.Stone:
      return 'stone';
    case Block.Sand:
      return 'sand';
    case Block.Cobblestone:
      return 'cobblestone';
    case Block.MossyCobblestone:
      return 'mossy_cobble';
    case Block.Brick:
      return 'brick';
    case Block.Glass:
      return 'glass';
    case Block.Log:
      return 'wood';
    case Block.BirchLog:
      return 'birch_wood';
    case Block.CoalOre:
      return 'coal';
    case Block.IronOre:
      return 'iron_ore';
    case Block.CopperOre:
      return 'copper_ore';
    case Block.GoldOre:
      return 'gold_ore';
    case Block.DiamondOre:
      return 'diamond';
    case Block.Gravel:
      return 'gravel';
    case Block.Clay:
      return 'clay';
    case Block.Snow:
      return 'snow';
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
      return 'flower';
    case Block.Mushroom:
      return 'mushroom';
    case Block.BerryBush:
      return 'berries';
    case Block.Cactus:
      return 'cactus';
    case Block.Pumpkin:
      return 'pumpkin';
    case Block.Planks:
      return 'planks';
    case Block.CraftingTable:
      return 'crafting_table';
    case Block.Furnace:
      return 'furnace';
    case Block.Chest:
      return 'chest';
    case Block.LogX:
    case Block.LogZ:
      return 'wood';
    case Block.BirchLogX:
    case Block.BirchLogZ:
      return 'birch_wood';
    case Block.Torch:
      return 'torch';
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return 'oak_door';
    case Block.OakSlab:
    case Block.OakSlabTop:
      return 'oak_slab';
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return 'cobblestone_slab';
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return 'oak_stairs';
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return 'cobblestone_stairs';
    case Block.Amethyst:
      return 'amethyst';
    case Block.AmethystCluster:
      return 'amethyst_cluster';
    case Block.MossBlock:
      return 'moss_block';
    case Block.GlowBerry:
      return 'glow_berry';
    case Block.Basalt:
      return 'basalt';
    case Block.MossyStoneBrick:
      return 'mossy_stone_brick';
    case Block.IronBars:
      return 'iron_bars';
    case Block.Mycelium:
      return 'mycelium';
    case Block.MushroomStem:
      return 'mushroom_stem';
    case Block.MushroomCapRed:
      return 'mushroom_cap_red';
    case Block.MushroomCapBrown:
      return 'mushroom_cap_brown';
    case Block.Obsidian:
      return 'obsidian';
    default:
      return null;
  }
}

export function heldItemFor(item: Item): HeldItem | null {
  const def = itemDefs.find((entry) => entry.id === item);
  if (!def) return null;
  if (def.block !== undefined) return { kind: 'block', block: def.block, label: def.label, item };
  if (def.tool) return { kind: 'tool', tool: def.tool, label: def.label, item };
  return null;
}

export function labelItem(item: Item): string {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def) return def.label;
  return item
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function stackLimitFor(item: Item): number {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def?.stackLimit !== undefined) return def.stackLimit;
  return def?.tool ? 1 : 64;
}

export function maxDurabilityFor(item: Item): number | null {
  return itemDefs.find((entry) => entry.id === item)?.durability ?? null;
}

export function foodValueFor(item: Item): number {
  return itemDefs.find((entry) => entry.id === item)?.foodValue ?? 0;
}

export function itemSwatch(item: Item): string {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def?.block !== undefined) {
    const [r, g, b] = blockColor(def.block);
    return `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
  }
  switch (item) {
    case 'sticks':
      return 'linear-gradient(135deg, transparent 35%, #8b5a2b 36%, #8b5a2b 64%, transparent 65%)';
    case 'wood_pickaxe':
      return 'linear-gradient(135deg, #7a4a23 0 35%, #9a6835 36% 68%, transparent 69%)';
    case 'stone_pickaxe':
      return 'linear-gradient(135deg, #7a4a23 0 35%, #c2c7c4 36% 68%, transparent 69%)';
    case 'iron_pickaxe':
      return 'linear-gradient(135deg, #7a4a23 0 35%, #d6d8db 36% 68%, transparent 69%)';
    case 'coal':
      return '#252525';
    case 'iron_ore':
      return '#b68155';
    case 'copper_ore':
      return '#b56a3a';
    case 'gold_ore':
      return '#e0b83c';
    case 'diamond':
      return '#56d5dd';
    case 'iron_ingot':
      return '#cfd4d8';
    case 'copper_ingot':
      return '#d08856';
    case 'gold_ingot':
      return '#f0cb56';
    case 'flower':
      return 'linear-gradient(135deg, #4d8f35 0 45%, #d63b2e 46% 70%, #e7c52a 71%)';
    case 'snow':
      return '#e8f1f4';
    case 'chest':
      return 'linear-gradient(135deg, #8b5e3c 0 44%, #d4a05a 45% 79%, transparent 80%)';
    case 'apple':
      return '#d63b2e';
    case 'raw_meat':
      return '#c46e5a';
    case 'cooked_meat':
      return '#8b4a30';
    default:
      return '#90999c';
  }
}
