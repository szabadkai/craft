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
  | 'obsidian'
  | 'emerald'
  | 'redstone';

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
    }
  | { kind: 'food'; item: Item; label: string }
  | { kind: 'item'; item: Item; label: string };

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
  emerald: 0,
  redstone: 0,
};

export const recipes: Recipe[] = [
  { name: 'Planks', inputs: { wood: 1 }, outputs: { planks: 4 } },
  { name: 'Birch Planks', inputs: { birch_wood: 1 }, outputs: { planks: 4 } },
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
  { name: 'Iron Bars', inputs: { iron_ingot: 6 }, outputs: { iron_bars: 16 } },
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
  { id: 'sticks', label: 'Stick', category: 'Materials', tool: 'stick', stackLimit: 64 },
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
  { id: 'emerald', label: 'Emerald', category: 'Materials' },
  { id: 'redstone', label: 'Redstone', category: 'Materials' },
  { id: 'iron_ingot', label: 'Iron Ingot', category: 'Materials' },
  { id: 'copper_ingot', label: 'Copper Ingot', category: 'Materials' },
  { id: 'gold_ingot', label: 'Gold Ingot', category: 'Materials' },
  { id: 'torch', label: 'Torch', category: 'Blocks', block: Block.Torch },
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
    case Block.EmeraldOre:
      return 'emerald';
    case Block.RedstoneOre:
      return 'redstone';
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
    case Block.TorchN:
    case Block.TorchS:
    case Block.TorchE:
    case Block.TorchW:
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
  if (foodValueFor(item) > 0) return { kind: 'food', item, label: def.label };
  if (def.category === 'Materials') return { kind: 'item', item, label: def.label };
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
  if (def?.durability !== undefined) return 1;
  return 64;
}

export function maxDurabilityFor(item: Item): number | null {
  return itemDefs.find((entry) => entry.id === item)?.durability ?? null;
}

export function foodValueFor(item: Item): number {
  return itemDefs.find((entry) => entry.id === item)?.foodValue ?? 0;
}

export function itemSwatch(item: Item): string {
  switch (item) {
    case 'wood':
      return logIcon('#6f421f', '#a66a34', '#d5b276');
    case 'birch_wood':
      return logIcon('#e2d39d', '#6f5d37', '#f4edcc');
    case 'planks':
      return stripeIcon('#c28a49', '#8f5f2f', '#e0b56b');
    case 'dirt':
      return speckledIcon('#7c5437', '#5d3b26', '#9b704d');
    case 'stone':
      return speckledIcon('#777976', '#5b5d5b', '#9a9c98');
    case 'sand':
      return speckledIcon('#d4bd7e', '#b69b5b', '#ead99e');
    case 'gravel':
      return speckledIcon('#77776f', '#565650', '#9a9a92');
    case 'clay':
      return speckledIcon('#7f9ba3', '#5f7880', '#a2b8bd');
    case 'snow':
      return blockIcon('#eef8fb', '#ffffff', '#b8d6df');
    case 'cobblestone':
      return cobbleIcon('#696a66', '#4f504d', '#90918c');
    case 'mossy_cobble':
      return cobbleIcon('#596f45', '#394b32', '#7f955f');
    case 'brick':
      return brickIcon('#a84834', '#6e2f27', '#d16a50');
    case 'glass':
      return glassIcon();
    case 'cactus':
      return cactusIcon();
    case 'pumpkin':
      return pumpkinIcon();
    case 'flower':
      return flowerIcon('#d63b2e');
    case 'mushroom':
      return mushroomIcon();
    case 'berries':
      return berryIcon();
    case 'torch':
      return torchIcon();
    case 'crafting_table':
      return tableIcon();
    case 'furnace':
      return furnaceIcon();
    case 'chest':
      return chestIcon();
    case 'oak_door':
      return doorIcon();
    case 'oak_slab':
      return slabIcon('#c28a49', '#8f5f2f');
    case 'cobblestone_slab':
      return slabIcon('#696a66', '#4f504d');
    case 'oak_stairs':
      return stairIcon('#c28a49', '#8f5f2f');
    case 'cobblestone_stairs':
      return stairIcon('#696a66', '#4f504d');
    case 'amethyst':
      return gemBlockIcon('#8b52b8', '#c58be1', '#5b327c');
    case 'amethyst_cluster':
      return clusterIcon('#b576d4');
    case 'moss_block':
      return speckledIcon('#4d8c38', '#326927', '#70a95a');
    case 'glow_berry':
      return glowBerryIcon();
    case 'basalt':
      return stripeIcon('#444247', '#2d2c30', '#626066');
    case 'mossy_stone_brick':
      return brickIcon('#69775a', '#46513d', '#8a9a73');
    case 'iron_bars':
      return barsIcon();
    case 'mycelium':
      return speckledIcon('#8b7890', '#5d5263', '#b9a7bf');
    case 'mushroom_stem':
      return speckledIcon('#d7cdbb', '#b8aa91', '#f2eadb');
    case 'mushroom_cap_red':
      return capIcon('#b83228');
    case 'mushroom_cap_brown':
      return capIcon('#865330');
    case 'obsidian':
      return gemBlockIcon('#24182d', '#4a2d60', '#110c18');
    case 'sticks':
      return 'linear-gradient(135deg, transparent 0 33%, #7a4a23 34% 45%, #b1773a 46% 58%, transparent 59%), linear-gradient(45deg, transparent 0 43%, #6b3e1f 44% 56%, transparent 57%)';
    case 'wood_pickaxe':
      return pickaxeIcon('#9a6835');
    case 'stone_pickaxe':
      return pickaxeIcon('#aeb3ae');
    case 'iron_pickaxe':
      return pickaxeIcon('#d6d8db');
    case 'coal':
      return nuggetIcon('#252525', '#444444');
    case 'iron_ore':
      return oreIcon('#777976', '#b68155');
    case 'copper_ore':
      return oreIcon('#777976', '#c8743f');
    case 'gold_ore':
      return oreIcon('#777976', '#e0b83c');
    case 'diamond':
      return gemIcon('#56d5dd', '#d8ffff');
    case 'emerald':
      return gemIcon('#35c75a', '#cbffd3');
    case 'redstone':
      return dustIcon('#c72929');
    case 'iron_ingot':
      return ingotIcon('#cfd4d8', '#8b9398');
    case 'copper_ingot':
      return ingotIcon('#d08856', '#9a4f30');
    case 'gold_ingot':
      return ingotIcon('#f0cb56', '#ad7d22');
    case 'apple':
      return appleIcon();
    case 'raw_meat':
      return meatIcon('#c46e5a', '#f0b3a6');
    case 'cooked_meat':
      return meatIcon('#8b4a30', '#c47848');
    default:
      return fallbackItemIcon(item);
  }
}

function blockIcon(base: string, highlight: string, shadow: string): string {
  return `linear-gradient(135deg, ${highlight} 0 24%, transparent 25%), linear-gradient(315deg, ${shadow} 0 22%, transparent 23%), ${base}`;
}

function speckledIcon(base: string, dark: string, light: string): string {
  return `radial-gradient(circle at 30% 28%, ${light} 0 9%, transparent 10%), radial-gradient(circle at 70% 62%, ${dark} 0 10%, transparent 11%), radial-gradient(circle at 46% 76%, ${light} 0 6%, transparent 7%), ${base}`;
}

function stripeIcon(base: string, dark: string, light: string): string {
  return `linear-gradient(90deg, transparent 0 20%, ${light} 21% 27%, transparent 28% 48%, ${dark} 49% 55%, transparent 56% 76%, ${light} 77% 83%, transparent 84%), ${base}`;
}

function logIcon(bark: string, ring: string, center: string): string {
  return `radial-gradient(circle at 50% 50%, ${center} 0 19%, ${ring} 20% 32%, transparent 33%), linear-gradient(90deg, ${bark} 0 22%, transparent 23% 77%, ${bark} 78%), #8a572b`;
}

function cobbleIcon(base: string, dark: string, light: string): string {
  return `linear-gradient(90deg, transparent 0 45%, ${dark} 46% 52%, transparent 53%), linear-gradient(0deg, transparent 0 46%, ${dark} 47% 53%, transparent 54%), radial-gradient(circle at 25% 25%, ${light} 0 10%, transparent 11%), ${base}`;
}

function brickIcon(base: string, dark: string, light: string): string {
  return `linear-gradient(0deg, transparent 0 30%, ${dark} 31% 36%, transparent 37% 64%, ${dark} 65% 70%, transparent 71%), linear-gradient(90deg, transparent 0 45%, ${dark} 46% 52%, transparent 53%), linear-gradient(135deg, ${light} 0 18%, transparent 19%), ${base}`;
}

function glassIcon(): string {
  return 'linear-gradient(135deg, rgba(255,255,255,0.95) 0 16%, transparent 17% 47%, rgba(255,255,255,0.7) 48% 57%, transparent 58%), linear-gradient(315deg, rgba(80,150,170,0.45) 0 22%, transparent 23%), rgba(135,210,230,0.45)';
}

function cactusIcon(): string {
  return 'linear-gradient(90deg, #1f6d31 0 18%, #3fa54a 19% 78%, #1f6d31 79%), linear-gradient(0deg, transparent 0 18%, #d8e6b8 19% 24%, transparent 25% 48%, #d8e6b8 49% 54%, transparent 55%), #2f8e3c';
}

function pumpkinIcon(): string {
  return 'linear-gradient(90deg, #b65314 0 16%, #e8791c 17% 38%, #b65314 39% 45%, #e8791c 46% 72%, #b65314 73%), linear-gradient(0deg, transparent 0 72%, #556b28 73% 91%, transparent 92%), #d66b18';
}

function flowerIcon(petal: string): string {
  return `radial-gradient(circle at 50% 30%, #f2d74a 0 7%, transparent 8%), radial-gradient(circle at 42% 24%, ${petal} 0 10%, transparent 11%), radial-gradient(circle at 58% 24%, ${petal} 0 10%, transparent 11%), linear-gradient(90deg, transparent 0 46%, #4d8f35 47% 55%, transparent 56%), linear-gradient(135deg, transparent 0 48%, #4d8f35 49% 63%, transparent 64%)`;
}

function mushroomIcon(): string {
  return 'radial-gradient(ellipse at 50% 35%, #b94732 0 31%, transparent 32%), radial-gradient(circle at 42% 28%, #f1dfca 0 6%, transparent 7%), linear-gradient(90deg, transparent 0 42%, #d9c19d 43% 58%, transparent 59%)';
}

function berryIcon(): string {
  return 'radial-gradient(circle at 35% 34%, #bd2830 0 8%, transparent 9%), radial-gradient(circle at 65% 62%, #d44045 0 7%, transparent 8%), radial-gradient(ellipse at 50% 54%, #3f7a35 0 37%, transparent 38%)';
}

function glowBerryIcon(): string {
  return 'radial-gradient(circle at 38% 36%, #ffd85a 0 10%, transparent 11%), radial-gradient(circle at 64% 60%, #f0c53a 0 9%, transparent 10%), radial-gradient(ellipse at 50% 54%, #4f8a31 0 37%, transparent 38%)';
}

function torchIcon(): string {
  return 'radial-gradient(circle at 62% 20%, #ffe071 0 12%, #e78a24 13% 22%, transparent 23%), linear-gradient(135deg, transparent 0 40%, #8b5a2b 41% 56%, transparent 57%)';
}

function tableIcon(): string {
  return 'linear-gradient(90deg, transparent 0 43%, #5c351b 44% 56%, transparent 57%), linear-gradient(0deg, transparent 0 43%, #5c351b 44% 56%, transparent 57%), linear-gradient(135deg, #d09a55 0 20%, transparent 21%), #8a562c';
}

function furnaceIcon(): string {
  return 'radial-gradient(ellipse at 50% 58%, #1e2022 0 24%, transparent 25%), linear-gradient(0deg, transparent 0 16%, #d57a2a 17% 26%, transparent 27%), #55575a';
}

function chestIcon(): string {
  return 'linear-gradient(0deg, transparent 0 42%, #5f3a20 43% 52%, transparent 53%), linear-gradient(90deg, transparent 0 43%, #d6b552 44% 56%, transparent 57%), linear-gradient(135deg, #b77a35 0 34%, #8b5e2d 35%)';
}

function doorIcon(): string {
  return 'radial-gradient(circle at 72% 52%, #d8c070 0 7%, transparent 8%), linear-gradient(0deg, transparent 0 45%, #8f5728 46% 51%, transparent 52%), linear-gradient(90deg, transparent 0 46%, #8f5728 47% 53%, transparent 54%), #b27635';
}

function slabIcon(base: string, dark: string): string {
  return `linear-gradient(0deg, transparent 0 44%, ${base} 45% 78%, ${dark} 79% 88%, transparent 89%)`;
}

function stairIcon(base: string, dark: string): string {
  return `linear-gradient(0deg, transparent 0 22%, ${base} 23% 43%, transparent 44% 57%, ${base} 58% 78%, ${dark} 79% 86%, transparent 87%), linear-gradient(90deg, transparent 0 47%, ${dark} 48% 54%, transparent 55%)`;
}

function gemBlockIcon(base: string, highlight: string, shadow: string): string {
  return `radial-gradient(circle at 35% 28%, ${highlight} 0 10%, transparent 11%), linear-gradient(315deg, ${shadow} 0 28%, transparent 29%), ${base}`;
}

function clusterIcon(color: string): string {
  return `linear-gradient(70deg, transparent 0 30%, ${color} 31% 42%, transparent 43%), linear-gradient(110deg, transparent 0 42%, #d8a9eb 43% 57%, transparent 58%), linear-gradient(250deg, transparent 0 28%, #8b52b8 29% 42%, transparent 43%)`;
}

function barsIcon(): string {
  return 'linear-gradient(90deg, transparent 0 15%, #a9aaa5 16% 25%, transparent 26% 45%, #c8cac6 46% 55%, transparent 56% 75%, #8d8e8a 76% 85%, transparent 86%), linear-gradient(0deg, transparent 0 20%, #7a7b78 21% 29%, transparent 30% 70%, #c8cac6 71% 79%, transparent 80%)';
}

function capIcon(color: string): string {
  return `radial-gradient(circle at 32% 26%, #f2e6d4 0 7%, transparent 8%), radial-gradient(circle at 65% 52%, #f2e6d4 0 6%, transparent 7%), ${blockIcon(color, '#d78570', '#6a2e22')}`;
}

function pickaxeIcon(head: string): string {
  return `linear-gradient(135deg, transparent 0 42%, #7a4a23 43% 55%, transparent 56%), linear-gradient(25deg, transparent 0 23%, ${head} 24% 39%, transparent 40% 60%, ${head} 61% 76%, transparent 77%)`;
}

function nuggetIcon(base: string, light: string): string {
  return `radial-gradient(circle at 36% 34%, ${light} 0 10%, transparent 11%), radial-gradient(ellipse at 50% 55%, ${base} 0 34%, transparent 35%)`;
}

function oreIcon(stone: string, ore: string): string {
  return `radial-gradient(circle at 32% 30%, ${ore} 0 9%, transparent 10%), radial-gradient(circle at 65% 57%, ${ore} 0 10%, transparent 11%), ${speckledIcon(stone, '#565650', '#9a9a92')}`;
}

function ingotIcon(base: string, shadow: string): string {
  return `linear-gradient(0deg, transparent 0 33%, ${shadow} 34% 43%, ${base} 44% 68%, #ffffff99 69% 76%, transparent 77%)`;
}

function gemIcon(base: string, shine: string): string {
  return `linear-gradient(45deg, transparent 0 28%, ${base} 29% 70%, transparent 71%), radial-gradient(circle at 44% 35%, ${shine} 0 9%, transparent 10%)`;
}

function dustIcon(base: string): string {
  return `radial-gradient(circle at 33% 58%, ${base} 0 8%, transparent 9%), radial-gradient(circle at 61% 40%, ${base} 0 9%, transparent 10%), linear-gradient(20deg, transparent 0 35%, ${base} 36% 48%, transparent 49%)`;
}

function appleIcon(): string {
  return 'radial-gradient(circle at 48% 55%, #d63b2e 0 30%, transparent 31%), linear-gradient(0deg, transparent 0 68%, #6b4423 69% 86%, transparent 87%), radial-gradient(ellipse at 66% 25%, #4a8b35 0 13%, transparent 14%)';
}

function meatIcon(base: string, light: string): string {
  return `radial-gradient(circle at 70% 50%, #e0d0b5 0 12%, transparent 13%), radial-gradient(ellipse at 45% 52%, ${base} 0 35%, transparent 36%), radial-gradient(circle at 36% 36%, ${light} 0 8%, transparent 9%)`;
}

function fallbackItemIcon(item: Item): string {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def?.block !== undefined) {
    const [r, g, b] = blockColor(def.block);
    const base = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
    return blockIcon(base, 'rgba(255,255,255,0.22)', 'rgba(0,0,0,0.22)');
  }
  return blockIcon('#90999c', '#c8d0d2', '#5f6669');
}
