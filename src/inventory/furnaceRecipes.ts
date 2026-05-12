import { Item, stackLimitFor } from './items';
import type { InventorySlot } from './inventorySystem';

export type FurnaceRecipe = {
  input: Item;
  output: Item;
  cookTimeMs: number;
};

const FURNACE_RECIPES: FurnaceRecipe[] = [
  { input: 'iron_ore', output: 'iron_ingot', cookTimeMs: 4000 },
  { input: 'copper_ore', output: 'copper_ingot', cookTimeMs: 4000 },
  { input: 'gold_ore', output: 'gold_ingot', cookTimeMs: 4000 },
  { input: 'sand', output: 'glass', cookTimeMs: 3200 },
  { input: 'clay', output: 'brick', cookTimeMs: 3200 },
];

const FUEL_BURN_MS: Partial<Record<Item, number>> = {
  coal: 16000,
  wood: 6000,
  birch_wood: 6000,
  planks: 3000,
  sticks: 1500,
  cactus: 2500,
};

export function smeltingRecipeFor(item: Item | null): FurnaceRecipe | null {
  if (!item) return null;
  return FURNACE_RECIPES.find((recipe) => recipe.input === item) ?? null;
}

export function fuelBurnTimeFor(item: Item | null): number {
  if (!item) return 0;
  return FUEL_BURN_MS[item] ?? 0;
}

export function isFuelItem(item: Item | null): boolean {
  return fuelBurnTimeFor(item) > 0;
}

export function canOutputSmeltedItem(output: InventorySlot, item: Item): boolean {
  if (!output) return true;
  return output.item === item && output.count < stackLimitFor(item);
}
