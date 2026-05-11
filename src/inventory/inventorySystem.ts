import { blockColor } from '../blocks';
import { Block } from '../types';
import {
  defaultInventoryCounts,
  HeldItem,
  heldItemFor,
  Item,
  itemDefs,
  itemSwatch,
  labelItem,
  maxDurabilityFor,
  Recipe,
  recipes,
  stackLimitFor,
} from './items';

const INVENTORY_SLOT_COUNT = 36;
const HOTBAR_SLOT_COUNT = 9;

export type InventorySlot = { item: Item; count: number; durability?: number } | null;

export type InventorySnapshot = {
  version: 2;
  slots: InventorySlot[];
};

type InventoryElements = {
  hotbarEl: HTMLDivElement;
  inventoryEl: HTMLDivElement;
  recipesEl: HTMLDivElement;
  inventoryOverlayEl: HTMLDivElement;
  inventoryTabsEl: HTMLDivElement;
  inventoryGridLargeEl: HTMLDivElement;
};

type InventoryCallbacks = {
  saveInventory: () => void;
  saveHotbar: () => void;
  rebuildHeldItem: () => void;
};

export class InventorySystem {
  private inventorySlots: InventorySlot[] = createInventorySlotsFromCounts(defaultInventoryCounts);
  private selectedHotbarIndex = 0;
  private category: (typeof itemDefs)[number]['category'] = 'Blocks';
  private open = false;

  constructor(
    private readonly elements: InventoryElements,
    private readonly callbacks: InventoryCallbacks,
  ) {}

  init(): void {
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
  }

  get isOpen(): boolean {
    return this.open;
  }

  get hotbarSize(): number {
    return HOTBAR_SLOT_COUNT;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.paintOverlay();
  }

  toggleOpen(): boolean {
    this.setOpen(!this.open);
    return this.open;
  }

  selectedEntry(): HeldItem | null {
    const slot = this.selectedHotbarSlot();
    return slot ? heldItemFor(slot.item) : null;
  }

  selectedPlaceBlock(): Block | null {
    const entry = this.selectedEntry();
    return entry?.kind === 'block' ? entry.block : null;
  }

  selectedPlaceItem(): Item | null {
    const entry = this.selectedEntry();
    return entry?.kind === 'block' ? entry.item : null;
  }

  selectedTool(): Extract<HeldItem, { kind: 'tool' }> | null {
    const entry = this.selectedEntry();
    return entry?.kind === 'tool' ? entry : null;
  }

  itemCount(item: Item): number {
    return this.inventorySlots.reduce(
      (total, slot) => total + (slot?.item === item ? slot.count : 0),
      0,
    );
  }

  addItem(item: Item | null, amount: number): number {
    if (!item || amount === 0) return 0;
    const result = applyItemDelta(this.inventorySlots, item, amount);
    if (result.applied === 0) return 0;
    this.inventorySlots = result.slots;
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
    return result.applied;
  }

  consumeSelectedItem(amount: number): number {
    const slot = this.selectedHotbarSlot();
    if (!slot || amount <= 0) return 0;
    const consumed = Math.min(slot.count, amount);
    const remaining = slot.count - consumed;
    this.inventorySlots[this.selectedHotbarIndex] =
      remaining > 0 ? { ...slot, count: remaining } : null;
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
    this.callbacks.rebuildHeldItem();
    return consumed;
  }

  damageSelectedTool(amount: number): boolean {
    const tool = this.selectedTool();
    if (!tool) return false;
    const slot = this.selectedHotbarSlot();
    const maxDurability = maxDurabilityFor(tool.item);
    if (!slot || maxDurability === null) return false;
    const durability = Math.max(0, (slot.durability ?? maxDurability) - amount);
    if (durability <= 0) this.inventorySlots[this.selectedHotbarIndex] = null;
    else this.inventorySlots[this.selectedHotbarIndex] = { ...slot, durability };
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
    this.callbacks.rebuildHeldItem();
    return true;
  }

  selectHotbarSlot(index: number): void {
    if (index < 0 || index >= HOTBAR_SLOT_COUNT) return;
    this.selectedHotbarIndex = index;
    this.paintHotbar();
    this.callbacks.rebuildHeldItem();
  }

  applyInventory(saved: InventorySnapshot | Partial<Record<Item, number>>): void {
    this.inventorySlots = normalizeInventorySnapshot(saved, this.inventorySlots);
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.rebuildHeldItem();
  }

  resetInventory(): void {
    this.inventorySlots = createInventorySlotsFromCounts(defaultInventoryCounts);
    this.selectedHotbarIndex = 0;
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.rebuildHeldItem();
  }

  snapshotInventory(): InventorySnapshot {
    return {
      version: 2,
      slots: this.inventorySlots.map((slot) => (slot ? { ...slot } : null)),
    };
  }

  applyHotbar(saved: Item[]): void {
    if (this.inventorySlots.slice(0, HOTBAR_SLOT_COUNT).some((slot) => slot)) return;
    saved.slice(0, HOTBAR_SLOT_COUNT).forEach((item, index) => {
      if (!heldItemFor(item) || this.itemCount(item) <= 0) return;
      const source = this.inventorySlots.findIndex(
        (slot, slotIndex) => slotIndex >= HOTBAR_SLOT_COUNT && slot?.item === item,
      );
      if (source >= 0) this.swapSlots(index, source);
    });
    this.paintHotbar();
    this.paintInventory();
    this.callbacks.rebuildHeldItem();
  }

  snapshotHotbar(): Item[] {
    return this.inventorySlots
      .slice(0, HOTBAR_SLOT_COUNT)
      .map((slot) => slot?.item)
      .filter((item): item is Item => Boolean(item));
  }

  private paintHotbar(): void {
    const { hotbarEl } = this.elements;
    hotbarEl.innerHTML = '';
    for (let index = 0; index < HOTBAR_SLOT_COUNT; index++) {
      const inventorySlot = this.inventorySlots[index];
      const entry = inventorySlot ? heldItemFor(inventorySlot.item) : null;
      const slot = document.createElement('button');
      slot.className = `slot${index === this.selectedHotbarIndex ? ' active' : ''}`;
      slot.type = 'button';
      slot.title = inventorySlot ? this.slotLabel(inventorySlot) : 'Empty';
      slot.addEventListener('click', () => this.selectHotbarSlot(index));
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      if (entry?.kind === 'block') {
        const [r, g, b] = blockColor(entry.block);
        swatch.style.background = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
      } else if (entry?.kind === 'tool') {
        swatch.style.background =
          entry.tool === 'stick'
            ? 'linear-gradient(135deg, transparent 35%, #8b5a2b 36%, #8b5a2b 64%, transparent 65%)'
            : 'linear-gradient(135deg, #7a4a23 0 35%, #c2c7c4 36% 68%, transparent 69%)';
      } else {
        swatch.classList.add('empty');
      }
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(index + 1);
      const count = document.createElement('span');
      count.className = 'hotbar-count';
      count.textContent = inventorySlot ? this.slotCountText(inventorySlot) : '';
      slot.appendChild(swatch);
      slot.appendChild(key);
      slot.appendChild(count);
      hotbarEl.appendChild(slot);
    }
  }

  private paintInventory(): void {
    const { inventoryEl, recipesEl } = this.elements;
    inventoryEl.innerHTML = '';
    this.inventorySlots.forEach((inventorySlot, index) => {
      const slot = document.createElement('button');
      slot.className = `inventory-slot${index < HOTBAR_SLOT_COUNT ? ' quick' : ''}${
        index === this.selectedHotbarIndex ? ' selected' : ''
      }${inventorySlot ? '' : ' empty'}`;
      slot.type = 'button';
      slot.title = inventorySlot ? `${this.slotLabel(inventorySlot)} (${index + 1})` : 'Empty';
      slot.addEventListener('click', () => this.swapWithSelectedHotbar(index));

      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      if (inventorySlot) swatch.style.background = itemSwatch(inventorySlot.item);
      const countEl = document.createElement('span');
      countEl.className = 'inventory-count';
      countEl.textContent = inventorySlot ? this.slotCountText(inventorySlot) : '';
      slot.append(swatch, countEl);
      inventoryEl.appendChild(slot);
    });
    recipesEl.innerHTML = '';
    for (const recipe of recipes) {
      recipesEl.appendChild(this.createRecipeButton(recipe));
    }
  }

  private paintOverlay(): void {
    const { inventoryOverlayEl, inventoryTabsEl, inventoryGridLargeEl } = this.elements;
    inventoryOverlayEl.classList.toggle('hidden', !this.open);
    inventoryTabsEl.innerHTML = '';
    for (const category of ['Blocks', 'Materials', 'Tools'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = category === this.category ? 'active' : '';
      button.textContent = category;
      button.addEventListener('click', () => {
        this.category = category;
        this.paintOverlay();
      });
      inventoryTabsEl.appendChild(button);
    }

    inventoryGridLargeEl.innerHTML = '';
    for (const def of itemDefs.filter((entry) => entry.category === this.category)) {
      const count = this.itemCount(def.id);
      const slot = document.createElement('button');
      slot.className = `inventory-large-slot${count > 0 ? '' : ' empty'}`;
      slot.type = 'button';
      slot.disabled = count <= 0 || heldItemFor(def.id) === null;
      slot.title = def.label;
      slot.addEventListener('click', () => this.moveItemToSelectedHotbar(def.id, true));

      const swatch = document.createElement('span');
      swatch.className = 'inventory-large-swatch';
      swatch.style.background = itemSwatch(def.id);
      const label = document.createElement('span');
      label.className = 'inventory-large-label';
      label.textContent = def.label;
      const countEl = document.createElement('span');
      countEl.className = 'inventory-large-count';
      countEl.textContent = String(count);
      slot.append(swatch, label, countEl);
      inventoryGridLargeEl.appendChild(slot);
    }
  }

  private moveItemToSelectedHotbar(item: Item, repaintOverlay = false): void {
    if (!heldItemFor(item)) return;
    const source = this.inventorySlots.findIndex(
      (slot, index) => index !== this.selectedHotbarIndex && slot?.item === item,
    );
    if (source < 0) return;
    this.swapWithSelectedHotbar(source, repaintOverlay);
  }

  private swapWithSelectedHotbar(index: number, repaintOverlay = false): void {
    if (index === this.selectedHotbarIndex) return;
    this.swapSlots(this.selectedHotbarIndex, index);
    this.paintHotbar();
    this.paintInventory();
    this.callbacks.rebuildHeldItem();
    if (repaintOverlay) this.paintOverlay();
    this.callbacks.saveInventory();
    this.callbacks.saveHotbar();
  }

  private canCraft(recipe: Recipe): boolean {
    if (
      !Object.entries(recipe.inputs).every(
        ([item, count]) => this.itemCount(item as Item) >= (count ?? 0),
      )
    )
      return false;

    let simulated = this.inventorySlots.map((slot) => (slot ? { ...slot } : null));
    for (const [item, count] of Object.entries(recipe.inputs)) {
      simulated = applyItemDelta(simulated, item as Item, -(count ?? 0)).slots;
    }
    for (const [item, count] of Object.entries(recipe.outputs)) {
      if (!canFitItem(simulated, item as Item, count ?? 0)) return false;
      simulated = applyItemDelta(simulated, item as Item, count ?? 0).slots;
    }
    return true;
  }

  private craft(recipe: Recipe): void {
    if (!this.canCraft(recipe)) return;
    for (const [item, count] of Object.entries(recipe.inputs))
      this.inventorySlots = applyItemDelta(this.inventorySlots, item as Item, -(count ?? 0)).slots;
    for (const [item, count] of Object.entries(recipe.outputs))
      this.inventorySlots = applyItemDelta(this.inventorySlots, item as Item, count ?? 0).slots;
    this.paintInventory();
    this.paintHotbar();
    this.paintOverlay();
    this.callbacks.saveInventory();
    this.callbacks.rebuildHeldItem();
  }

  private createRecipeButton(recipe: Recipe): HTMLButtonElement {
    const button = document.createElement('button');
    const craftable = this.canCraft(recipe);
    button.type = 'button';
    button.className = `recipe-card${craftable ? '' : ' unavailable'}`;
    button.disabled = !craftable;
    button.title = craftable ? `Craft ${recipe.name}` : `Missing ingredients for ${recipe.name}`;
    button.addEventListener('click', () => this.craft(recipe));

    const output = document.createElement('div');
    output.className = 'recipe-output';
    for (const [item, count] of Object.entries(recipe.outputs) as Array<[Item, number]>) {
      output.appendChild(this.createRecipeItem(item, count, true));
    }

    const body = document.createElement('div');
    body.className = 'recipe-body';
    const name = document.createElement('span');
    name.className = 'recipe-name';
    name.textContent = recipe.name;
    const requirements = document.createElement('div');
    requirements.className = 'recipe-requirements';
    for (const [item, count] of Object.entries(recipe.inputs) as Array<[Item, number]>) {
      requirements.appendChild(this.createRecipeRequirement(item, count));
    }
    body.append(name, requirements);
    button.append(output, body);
    return button;
  }

  private createRecipeRequirement(item: Item, count: number): HTMLElement {
    const have = this.itemCount(item);
    const chip = this.createRecipeItem(item, count, false);
    chip.classList.toggle('missing', have < count);
    chip.title = `${labelItem(item)} ${have}/${count}`;
    const amount = chip.querySelector('.recipe-item-count');
    if (amount) amount.textContent = `${have}/${count}`;
    return chip;
  }

  private createRecipeItem(item: Item, count: number, output: boolean): HTMLElement {
    const chip = document.createElement('span');
    chip.className = `recipe-item${output ? ' output' : ''}`;
    chip.title = `${labelItem(item)} x${count}`;
    const swatch = document.createElement('span');
    swatch.className = 'recipe-item-swatch';
    swatch.style.background = itemSwatch(item);
    const amount = document.createElement('span');
    amount.className = 'recipe-item-count';
    amount.textContent = String(count);
    chip.append(swatch, amount);
    return chip;
  }

  private selectedHotbarSlot(): InventorySlot {
    return this.inventorySlots[this.selectedHotbarIndex];
  }

  private swapSlots(a: number, b: number): void {
    const next = this.inventorySlots.slice();
    [next[a], next[b]] = [next[b], next[a]];
    this.inventorySlots = next;
  }

  private slotLabel(slot: Exclude<InventorySlot, null>): string {
    const maxDurability = maxDurabilityFor(slot.item);
    if (maxDurability === null) return labelItem(slot.item);
    return `${labelItem(slot.item)} ${slot.durability ?? maxDurability}/${maxDurability}`;
  }

  private slotCountText(slot: Exclude<InventorySlot, null>): string {
    const maxDurability = maxDurabilityFor(slot.item);
    if (maxDurability === null) return String(slot.count);
    return `${slot.durability ?? maxDurability}`;
  }
}

function normalizeInventorySnapshot(
  saved: InventorySnapshot | Partial<Record<Item, number>>,
  fallback: InventorySlot[],
): InventorySlot[] {
  if (isInventorySnapshot(saved)) return normalizeSlots(saved.slots);
  return createInventorySlotsFromCounts({ ...countsFromSlots(fallback), ...saved });
}

function isInventorySnapshot(value: unknown): value is InventorySnapshot {
  if (!value || typeof value !== 'object') return false;
  return (
    (value as { version?: unknown }).version === 2 &&
    Array.isArray((value as { slots?: unknown }).slots)
  );
}

function normalizeSlots(slots: InventorySlot[]): InventorySlot[] {
  const counts: Partial<Record<Item, number>> = {};
  const slotsFromSnapshot = emptyInventorySlots();
  for (const slot of slots) {
    if (!slot || !isItem(slot.item)) continue;
    const maxDurability = maxDurabilityFor(slot.item);
    if (maxDurability !== null) {
      const durability = sanitizeDurability(slot.durability ?? maxDurability, maxDurability);
      addToolSlot(slotsFromSnapshot, slot.item, durability);
      continue;
    }
    counts[slot.item] = (counts[slot.item] ?? 0) + sanitizeCount(slot.count);
  }
  return mergeSlots(slotsFromSnapshot, createInventorySlotsFromCounts(counts));
}

function createInventorySlotsFromCounts(counts: Partial<Record<Item, number>>): InventorySlot[] {
  let slots = emptyInventorySlots();
  for (const def of itemDefs) {
    const count = sanitizeCount(counts[def.id] ?? 0);
    if (count <= 0) continue;
    const maxDurability = maxDurabilityFor(def.id);
    if (maxDurability !== null) {
      for (let index = 0; index < count; index++) addToolSlot(slots, def.id, maxDurability);
      continue;
    }
    slots = applyItemDelta(slots, def.id, count).slots;
  }
  return slots;
}

function emptyInventorySlots(): InventorySlot[] {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);
}

function countsFromSlots(slots: InventorySlot[]): Partial<Record<Item, number>> {
  const counts: Partial<Record<Item, number>> = {};
  for (const slot of slots) {
    if (!slot) continue;
    counts[slot.item] = (counts[slot.item] ?? 0) + slot.count;
  }
  return counts;
}

function applyItemDelta(
  slots: InventorySlot[],
  item: Item,
  amount: number,
): { slots: InventorySlot[]; applied: number } {
  const next = slots.map((slot) => (slot ? { ...slot } : null));
  let applied = 0;
  if (amount > 0) applied = addToSlots(next, item, amount);
  if (amount < 0) applied = removeFromSlots(next, item, -amount);
  return { slots: next, applied };
}

function canFitItem(slots: InventorySlot[], item: Item, amount: number): boolean {
  if (amount <= 0) return true;
  const limit = stackLimitFor(item);
  let remaining = amount;
  for (const slot of slots) {
    if (slot?.item === item) remaining -= Math.max(0, limit - slot.count);
    if (!slot) remaining -= limit;
    if (remaining <= 0) return true;
  }
  return false;
}

function addToSlots(slots: InventorySlot[], item: Item, amount: number): number {
  const maxDurability = maxDurabilityFor(item);
  if (maxDurability !== null) return addToolsToSlots(slots, item, amount, maxDurability);

  const limit = stackLimitFor(item);
  let remaining = amount;
  for (const slot of slots) {
    if (remaining <= 0) return amount;
    if (slot?.item !== item || slot.count >= limit) continue;
    const added = Math.min(remaining, limit - slot.count);
    slot.count += added;
    remaining -= added;
  }
  for (let index = 0; index < slots.length && remaining > 0; index++) {
    if (slots[index]) continue;
    const added = Math.min(remaining, limit);
    slots[index] = { item, count: added };
    remaining -= added;
  }
  return amount - remaining;
}

function addToolsToSlots(
  slots: InventorySlot[],
  item: Item,
  amount: number,
  maxDurability: number,
): number {
  let added = 0;
  for (let index = 0; index < slots.length && added < amount; index++) {
    if (slots[index]) continue;
    slots[index] = { item, count: 1, durability: maxDurability };
    added++;
  }
  return added;
}

function removeFromSlots(slots: InventorySlot[], item: Item, amount: number): number {
  let remaining = amount;
  for (let index = slots.length - 1; index >= 0 && remaining > 0; index--) {
    const slot = slots[index];
    if (slot?.item !== item) continue;
    const removed = Math.min(remaining, slot.count);
    slot.count -= removed;
    remaining -= removed;
    if (slot.count <= 0) slots[index] = null;
  }
  return amount - remaining;
}

function sanitizeCount(count: number): number {
  return Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
}

function sanitizeDurability(durability: number, maxDurability: number): number {
  const sanitized = Math.floor(Number.isFinite(durability) ? durability : maxDurability);
  return Math.max(1, Math.min(maxDurability, sanitized));
}

function addToolSlot(slots: InventorySlot[], item: Item, durability: number): void {
  const index = slots.findIndex((slot) => slot === null);
  if (index >= 0) slots[index] = { item, count: 1, durability };
}

function mergeSlots(primary: InventorySlot[], secondary: InventorySlot[]): InventorySlot[] {
  const merged = primary.map((slot) => (slot ? { ...slot } : null));
  for (const slot of secondary) {
    if (!slot) continue;
    const index = merged.findIndex((candidate) => candidate === null);
    if (index < 0) break;
    merged[index] = { ...slot };
  }
  return merged;
}

function isItem(value: unknown): value is Item {
  return typeof value === 'string' && itemDefs.some((def) => def.id === value);
}
