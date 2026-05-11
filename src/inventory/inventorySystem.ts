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
  Recipe,
  recipes,
  stackLimitFor,
} from './items';

const INVENTORY_SLOT_COUNT = 36;

export type InventorySlot = { item: Item; count: number } | null;

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
  private readonly hotbarEntries: HeldItem[] = [
    heldItemFor('dirt')!,
    heldItemFor('wood')!,
    heldItemFor('stone')!,
    heldItemFor('planks')!,
    heldItemFor('crafting_table')!,
    heldItemFor('cobblestone')!,
    heldItemFor('gravel')!,
    heldItemFor('clay')!,
    heldItemFor('snow')!,
    heldItemFor('sticks')!,
    heldItemFor('wood_pickaxe')!,
    heldItemFor('stone_pickaxe')!,
  ];
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
    return this.hotbarEntries.length;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.paintOverlay();
  }

  toggleOpen(): boolean {
    this.setOpen(!this.open);
    return this.open;
  }

  selectedEntry(): HeldItem {
    return this.hotbarEntries[this.selectedHotbarIndex];
  }

  selectedPlaceBlock(): Block | null {
    const entry = this.selectedEntry();
    return entry.kind === 'block' ? entry.block : null;
  }

  selectedPlaceItem(): Item | null {
    const entry = this.selectedEntry();
    return entry.kind === 'block' ? entry.item : null;
  }

  selectedTool(): Extract<HeldItem, { kind: 'tool' }> | null {
    const entry = this.selectedEntry();
    return entry.kind === 'tool' ? entry : null;
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

  selectHotbarSlot(index: number): void {
    if (index < 0 || index >= this.hotbarEntries.length) return;
    this.selectedHotbarIndex = index;
    this.paintHotbar();
    this.callbacks.rebuildHeldItem();
  }

  applyInventory(saved: InventorySnapshot | Partial<Record<Item, number>>): void {
    this.inventorySlots = normalizeInventorySnapshot(saved, this.inventorySlots);
    this.paintInventory();
    this.paintOverlay();
  }

  snapshotInventory(): InventorySnapshot {
    return {
      version: 2,
      slots: this.inventorySlots.map((slot) => (slot ? { ...slot } : null)),
    };
  }

  applyHotbar(saved: Item[]): void {
    saved.slice(0, this.hotbarEntries.length).forEach((item, index) => {
      const held = heldItemFor(item);
      if (held) this.hotbarEntries[index] = held;
    });
    this.paintHotbar();
    this.callbacks.rebuildHeldItem();
  }

  snapshotHotbar(): Item[] {
    return this.hotbarEntries.map((entry) => entry.item).filter((item): item is Item => Boolean(item));
  }

  private paintHotbar(): void {
    const { hotbarEl } = this.elements;
    hotbarEl.innerHTML = '';
    this.hotbarEntries.forEach((entry, index) => {
      const slot = document.createElement('button');
      slot.className = `slot${index === this.selectedHotbarIndex ? ' active' : ''}`;
      slot.type = 'button';
      slot.title = entry.label;
      slot.addEventListener('click', () => this.selectHotbarSlot(index));
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      if (entry.kind === 'block') {
        const [r, g, b] = blockColor(entry.block);
        swatch.style.background = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
      } else {
        swatch.style.background =
          entry.tool === 'stick'
            ? 'linear-gradient(135deg, transparent 35%, #8b5a2b 36%, #8b5a2b 64%, transparent 65%)'
            : 'linear-gradient(135deg, #7a4a23 0 35%, #c2c7c4 36% 68%, transparent 69%)';
      }
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = index < 9 ? String(index + 1) : index === 9 ? '0' : index === 10 ? '-' : '=';
      slot.appendChild(swatch);
      slot.appendChild(key);
      hotbarEl.appendChild(slot);
    });
  }

  private paintInventory(): void {
    const { inventoryEl, recipesEl } = this.elements;
    const visibleItems = this.inventorySlots
      .map((slot, index) => ({ slot, index }))
      .filter((entry): entry is { slot: Exclude<InventorySlot, null>; index: number } =>
        Boolean(entry.slot),
      );
    inventoryEl.innerHTML = '';
    if (visibleItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'Empty';
      inventoryEl.appendChild(empty);
    }
    for (const { slot: inventorySlot, index } of visibleItems) {
      const slot = document.createElement('button');
      slot.className = 'inventory-slot';
      slot.type = 'button';
      slot.title = `${labelItem(inventorySlot.item)} (${index + 1})`;
      slot.disabled = heldItemFor(inventorySlot.item) === null;
      slot.addEventListener('click', () => this.assignItemToSelectedSlot(inventorySlot.item));

      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      swatch.style.background = itemSwatch(inventorySlot.item);
      const countEl = document.createElement('span');
      countEl.className = 'inventory-count';
      countEl.textContent = String(inventorySlot.count);
      slot.append(swatch, countEl);
      inventoryEl.appendChild(slot);
    }
    recipesEl.innerHTML = '';
    for (const recipe of recipes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = recipe.name;
      button.disabled = !this.canCraft(recipe);
      button.addEventListener('click', () => this.craft(recipe));
      recipesEl.appendChild(button);
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
      slot.addEventListener('click', () => this.assignItemToSelectedSlot(def.id, true));

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

  private assignItemToSelectedSlot(item: Item, repaintOverlay = false): void {
    const held = heldItemFor(item);
    if (!held) return;
    this.hotbarEntries[this.selectedHotbarIndex] = held;
    this.paintHotbar();
    this.callbacks.rebuildHeldItem();
    if (repaintOverlay) this.paintOverlay();
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
    this.paintOverlay();
    this.callbacks.saveInventory();
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
  for (const slot of slots) {
    if (!slot || !isItem(slot.item)) continue;
    counts[slot.item] = (counts[slot.item] ?? 0) + sanitizeCount(slot.count);
  }
  return createInventorySlotsFromCounts(counts);
}

function createInventorySlotsFromCounts(counts: Partial<Record<Item, number>>): InventorySlot[] {
  let slots = emptyInventorySlots();
  for (const def of itemDefs) {
    const count = sanitizeCount(counts[def.id] ?? 0);
    if (count > 0) slots = applyItemDelta(slots, def.id, count).slots;
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

function isItem(value: unknown): value is Item {
  return typeof value === 'string' && itemDefs.some((def) => def.id === value);
}
