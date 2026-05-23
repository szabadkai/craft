import { Block } from '../types';
import {
  defaultInventoryCounts,
  foodValueFor,
  HeldItem,
  heldItemFor,
  Item,
  itemDefs,
  itemSwatch,
  labelItem,
  maxDurabilityFor,
  Recipe,
  recipes,
} from './items';
import {
  type InventorySlot,
  type InventorySnapshot,
  createInventorySlotsFromCounts,
  applyItemDelta,
  canFitItem,
  insertInventorySlot,
  normalizeInventorySnapshot,
} from './inventorySlots';

export type { InventorySlot, InventorySnapshot };

const HOTBAR_SLOT_COUNT = 9;

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
  private hotbarIndex = 0;
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

  get selectedHotbarIndex(): number {
    return this.hotbarIndex;
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
    this.commitInventoryChange();
    return result.applied;
  }

  inventorySlotsSnapshot(): InventorySlot[] {
    return this.inventorySlots.map((slot) => (slot ? { ...slot } : null));
  }

  slotAt(index: number): InventorySlot {
    if (index < 0 || index >= this.inventorySlots.length) return null;
    const slot = this.inventorySlots[index];
    return slot ? { ...slot } : null;
  }

  takeSlot(index: number): InventorySlot {
    if (index < 0 || index >= this.inventorySlots.length) return null;
    const slot = this.inventorySlots[index];
    if (!slot) return null;
    const taken = { ...slot };
    this.inventorySlots[index] = null;
    this.commitInventoryChange(true);
    return taken;
  }

  insertSlot(slot: Exclude<InventorySlot, null>): InventorySlot {
    const result = insertInventorySlot(this.inventorySlots, slot);
    if (!result.inserted) return { ...slot };
    this.inventorySlots = result.slots;
    this.commitInventoryChange(true);
    return result.remainder;
  }

  consumeSelectedItem(amount: number): number {
    const slot = this.selectedHotbarSlot();
    if (!slot || amount <= 0) return 0;
    const consumed = Math.min(slot.count, amount);
    const remaining = slot.count - consumed;
    this.inventorySlots[this.hotbarIndex] =
      remaining > 0 ? { ...slot, count: remaining } : null;
    this.commitInventoryChange();
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
    if (durability <= 0) this.inventorySlots[this.hotbarIndex] = null;
    else this.inventorySlots[this.hotbarIndex] = { ...slot, durability };
    this.commitInventoryChange();
    this.callbacks.rebuildHeldItem();
    return true;
  }

  selectHotbarSlot(index: number): void {
    if (index < 0 || index >= HOTBAR_SLOT_COUNT) return;
    this.hotbarIndex = index;
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
    this.hotbarIndex = 0;
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
      if ((!heldItemFor(item) && foodValueFor(item) <= 0) || this.itemCount(item) <= 0) return;
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
      slot.className = `slot${index === this.hotbarIndex ? ' active' : ''}`;
      slot.type = 'button';
      slot.title = inventorySlot ? this.slotLabel(inventorySlot) : 'Empty';
      slot.addEventListener('click', () => this.selectHotbarSlot(index));
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      if (inventorySlot && entry) {
        swatch.style.background = itemSwatch(inventorySlot.item);
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
        index === this.hotbarIndex ? ' selected' : ''
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
    for (const category of ['Blocks', 'Materials', 'Tools', 'Food'] as const) {
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
      slot.disabled = count <= 0 || (heldItemFor(def.id) === null && foodValueFor(def.id) <= 0);
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
    if (!heldItemFor(item) && foodValueFor(item) <= 0) return;
    const source = this.inventorySlots.findIndex(
      (slot, index) => index !== this.hotbarIndex && slot?.item === item,
    );
    if (source < 0) return;
    this.swapWithSelectedHotbar(source, repaintOverlay);
  }

  private swapWithSelectedHotbar(index: number, repaintOverlay = false): void {
    if (index === this.hotbarIndex) return;
    this.swapSlots(this.hotbarIndex, index);
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
    return this.inventorySlots[this.hotbarIndex];
  }

  private commitInventoryChange(saveHotbar = false): void {
    this.paintHotbar();
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
    if (saveHotbar) this.callbacks.saveHotbar();
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
