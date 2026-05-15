import { Block } from '../types';
import { InventorySystem, InventorySlot } from './inventorySystem';
import {
  canOutputSmeltedItem,
  fuelBurnTimeFor,
  isFuelItem,
  smeltingRecipeFor,
} from './furnaceRecipes';
import { itemSwatch, labelItem, maxDurabilityFor, stackLimitFor } from './items';

export type FurnacePosition = { x: number; y: number; z: number };

export type FurnaceSnapshot = {
  input: InventorySlot;
  fuel: InventorySlot;
  output: InventorySlot;
  burnRemainingMs: number;
  burnTotalMs: number;
  cookProgressMs: number;
};

type FurnaceUiElements = {
  furnaceOverlayEl: HTMLDivElement;
  furnaceInputEl: HTMLButtonElement;
  furnaceFuelEl: HTMLButtonElement;
  furnaceOutputEl: HTMLButtonElement;
  furnaceInventoryEl: HTMLDivElement;
  furnaceBurnFillEl: HTMLSpanElement;
  furnaceProgressFillEl: HTMLSpanElement;
  furnaceStatusEl: HTMLSpanElement;
};

type FurnaceCallbacks = {
  save: () => void;
  spawnDrop: (slot: Exclude<InventorySlot, null>, position: FurnacePosition) => void;
  getBlock: (x: number, y: number, z: number) => Block;
};

type OpenFurnace = {
  key: string;
  position: FurnacePosition;
};

export class FurnaceSystem {
  private readonly furnaces = new Map<string, FurnaceSnapshot>();
  private openFurnace: OpenFurnace | null = null;

  constructor(
    private readonly inventory: InventorySystem,
    private readonly ui: FurnaceUiElements,
    private readonly callbacks: FurnaceCallbacks,
  ) {
    this.ui.furnaceInputEl.addEventListener('click', () => this.returnSlotToInventory('input'));
    this.ui.furnaceFuelEl.addEventListener('click', () => this.returnSlotToInventory('fuel'));
    this.ui.furnaceOutputEl.addEventListener('click', () => this.collectOutput());
  }

  get isOpen(): boolean {
    return this.openFurnace !== null;
  }

  get isBurning(): boolean {
    if (!this.openFurnace) return false;
    const state = this.furnaces.get(this.openFurnace.key);
    return state !== undefined && state.burnRemainingMs > 0;
  }

  load(snapshot: Record<string, FurnaceSnapshot> | null): void {
    this.furnaces.clear();
    if (!snapshot) {
      this.paint();
      return;
    }
    for (const [key, state] of Object.entries(snapshot)) {
      this.furnaces.set(key, {
        input: cloneSlot(state.input),
        fuel: cloneSlot(state.fuel),
        output: cloneSlot(state.output),
        burnRemainingMs: sanitizeMs(state.burnRemainingMs),
        burnTotalMs: sanitizeMs(state.burnTotalMs),
        cookProgressMs: sanitizeMs(state.cookProgressMs),
      });
    }
    this.paint();
  }

  snapshot(): Record<string, FurnaceSnapshot> {
    return Object.fromEntries(
      Array.from(this.furnaces.entries(), ([key, state]) => [key, cloneSnapshot(state)]),
    );
  }

  openAt(position: FurnacePosition): void {
    const key = furnaceKey(position);
    this.openFurnace = { key, position };
    if (!this.furnaces.has(key)) this.furnaces.set(key, createEmptyFurnaceSnapshot());
    this.paint();
  }

  close(): void {
    this.openFurnace = null;
    this.paint();
  }

  tick(dt: number): void {
    let changed = false;
    for (const [key, state] of this.furnaces) {
      changed = updateFurnaceState(state, dt) || changed;
      if (isEmptyFurnace(state) && (!this.openFurnace || this.openFurnace.key !== key)) {
        this.furnaces.delete(key);
        changed = true;
      }
    }

    if (
      this.openFurnace &&
      this.callbacks.getBlock(
        this.openFurnace.position.x,
        this.openFurnace.position.y,
        this.openFurnace.position.z,
      ) !== Block.Furnace
    ) {
      this.openFurnace = null;
      changed = true;
    }

    if (changed) this.callbacks.save();
    if (changed || this.isOpen) this.paint();
  }

  tryStoreInventorySlot(index: number): boolean {
    if (!this.openFurnace) return false;
    const slot = this.inventory.slotAt(index);
    if (!slot) return false;
    const targetKind = smeltingRecipeFor(slot.item) ? 'input' : isFuelItem(slot.item) ? 'fuel' : null;
    if (!targetKind) return false;

    const state = this.requireOpenFurnace();
    const taken = this.inventory.takeSlot(index);
    if (!taken) return false;
    const merged = mergeIntoContainerSlot(state[targetKind], taken);
    state[targetKind] = merged.target;
    if (merged.remainder) this.inventory.insertSlot(merged.remainder);
    this.onStateMutated();
    return true;
  }

  removeAt(position: FurnacePosition): void {
    const key = furnaceKey(position);
    const state = this.furnaces.get(key);
    if (!state) return;
    for (const slot of [state.input, state.fuel, state.output]) {
      if (slot) this.callbacks.spawnDrop(slot, position);
    }
    this.furnaces.delete(key);
    if (this.openFurnace?.key === key) this.openFurnace = null;
    this.callbacks.save();
    this.paint();
  }

  private collectOutput(): void {
    const state = this.requireOpenFurnace();
    if (!state.output) return;
    const remainder = this.inventory.insertSlot(state.output);
    state.output = remainder;
    this.onStateMutated();
  }

  private returnSlotToInventory(kind: 'input' | 'fuel'): void {
    const state = this.requireOpenFurnace();
    const slot = state[kind];
    if (!slot) return;
    const remainder = this.inventory.insertSlot(slot);
    state[kind] = remainder;
    this.onStateMutated();
  }

  private onStateMutated(): void {
    this.callbacks.save();
    this.paint();
  }

  private requireOpenFurnace(): FurnaceSnapshot {
    if (!this.openFurnace) throw new Error('No furnace open');
    let state = this.furnaces.get(this.openFurnace.key);
    if (!state) {
      state = createEmptyFurnaceSnapshot();
      this.furnaces.set(this.openFurnace.key, state);
    }
    return state;
  }

  private paint(): void {
    this.ui.furnaceOverlayEl.classList.toggle('hidden', !this.isOpen);
    const state = this.openFurnace ? this.requireOpenFurnace() : null;
    this.paintFurnaceSlot(this.ui.furnaceInputEl, state?.input ?? null, 'Input');
    this.paintFurnaceSlot(this.ui.furnaceFuelEl, state?.fuel ?? null, 'Fuel');
    this.paintFurnaceSlot(this.ui.furnaceOutputEl, state?.output ?? null, 'Output');
    this.ui.furnaceBurnFillEl.style.transform = `scaleY(${state ? burnRatio(state) : 0})`;
    this.ui.furnaceProgressFillEl.style.transform = `scaleX(${state ? progressRatio(state) : 0})`;
    this.ui.furnaceStatusEl.textContent = state ? furnaceStatusText(state) : 'Add ore and fuel.';

    this.ui.furnaceInventoryEl.innerHTML = '';
    if (!state) return;
    this.inventory.inventorySlotsSnapshot().forEach((slot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-slot${slot ? '' : ' empty'}`;
      button.title = slot ? slotTitle(slot) : 'Empty';
      button.addEventListener('click', () => this.tryStoreInventorySlot(index));
      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      if (slot) swatch.style.background = itemSwatch(slot.item);
      const count = document.createElement('span');
      count.className = 'inventory-count';
      count.textContent = slot ? slotCountText(slot) : '';
      button.append(swatch, count);
      this.ui.furnaceInventoryEl.appendChild(button);
    });
  }

  private paintFurnaceSlot(button: HTMLButtonElement, slot: InventorySlot, label: string): void {
    button.innerHTML = '';
    button.title = slot ? `${label}: ${slotTitle(slot)}` : `${label}: Empty`;
    button.className = `furnace-slot${slot ? '' : ' empty'}`;
    const swatch = document.createElement('span');
    swatch.className = 'inventory-swatch';
    if (slot) swatch.style.background = itemSwatch(slot.item);
    const count = document.createElement('span');
    count.className = 'inventory-count';
    count.textContent = slot ? slotCountText(slot) : '';
    button.append(swatch, count);
  }
}

function updateFurnaceState(state: FurnaceSnapshot, dt: number): boolean {
  let changed = false;
  const recipe = smeltingRecipeFor(state.input?.item ?? null);
  const canCook = Boolean(recipe && state.input && canOutputSmeltedItem(state.output, recipe.output));

  if (state.burnRemainingMs > 0) {
    const nextBurn = Math.max(0, state.burnRemainingMs - dt * 1000);
    changed = changed || nextBurn !== state.burnRemainingMs;
    state.burnRemainingMs = nextBurn;
  }

  if (canCook && state.burnRemainingMs <= 0 && state.fuel) {
    const burnMs = fuelBurnTimeFor(state.fuel.item);
    if (burnMs > 0) {
      state.burnRemainingMs = burnMs;
      state.burnTotalMs = burnMs;
      state.fuel = decrementSlot(state.fuel);
      changed = true;
    }
  }

  if (!recipe || !canCook) {
    if (state.cookProgressMs !== 0) {
      state.cookProgressMs = 0;
      changed = true;
    }
    if (state.burnRemainingMs <= 0 && state.burnTotalMs !== 0) {
      state.burnTotalMs = 0;
      changed = true;
    }
    return changed;
  }

  if (state.burnRemainingMs <= 0) return changed;
  state.cookProgressMs += dt * 1000;
  changed = true;
  if (state.cookProgressMs < recipe.cookTimeMs) return changed;

  state.cookProgressMs -= recipe.cookTimeMs;
  state.input = decrementSlot(state.input);
  state.output = appendItemToSlot(state.output, recipe.output);
  return true;
}

function mergeIntoContainerSlot(
  current: InventorySlot,
  incoming: Exclude<InventorySlot, null>,
): { target: InventorySlot; remainder: InventorySlot } {
  if (maxDurabilityFor(incoming.item) !== null) return { target: cloneSlot(current), remainder: incoming };
  const limit = stackLimitFor(incoming.item);

  if (!current) {
    const stored = Math.min(limit, incoming.count);
    return {
      target: { item: incoming.item, count: stored },
      remainder: incoming.count > stored ? { item: incoming.item, count: incoming.count - stored } : null,
    };
  }

  if (current.item !== incoming.item) return { target: { ...current }, remainder: incoming };
  const space = Math.max(0, limit - current.count);
  const stored = Math.min(space, incoming.count);
  return {
    target: { ...current, count: current.count + stored },
    remainder: incoming.count > stored ? { item: incoming.item, count: incoming.count - stored } : null,
  };
}

function appendItemToSlot(slot: InventorySlot, item: Exclude<InventorySlot, null>['item']): InventorySlot {
  if (!slot) return { item, count: 1 };
  return { ...slot, count: slot.count + 1 };
}

function decrementSlot(slot: InventorySlot): InventorySlot {
  if (!slot) return null;
  if (slot.count <= 1) return null;
  return { ...slot, count: slot.count - 1 };
}

function burnRatio(state: FurnaceSnapshot): number {
  if (state.burnTotalMs <= 0) return 0;
  return Math.max(0, Math.min(1, state.burnRemainingMs / state.burnTotalMs));
}

function progressRatio(state: FurnaceSnapshot): number {
  const recipe = smeltingRecipeFor(state.input?.item ?? null);
  if (!recipe) return 0;
  return Math.max(0, Math.min(1, state.cookProgressMs / recipe.cookTimeMs));
}

function furnaceStatusText(state: FurnaceSnapshot): string {
  const recipe = smeltingRecipeFor(state.input?.item ?? null);
  if (!state.input) return 'Add a smeltable item.';
  if (!recipe) return 'Input item cannot be smelted.';
  if (!canOutputSmeltedItem(state.output, recipe.output)) return 'Output slot is full.';
  if (state.burnRemainingMs > 0) return `Smelting ${labelItem(recipe.output)}...`;
  if (!state.fuel) return 'Add fuel.';
  if (!isFuelItem(state.fuel.item)) return 'Fuel slot needs burnable fuel.';
  return `Ready to smelt ${labelItem(recipe.output)}.`;
}

function slotTitle(slot: Exclude<InventorySlot, null>): string {
  const maxDurability = maxDurabilityFor(slot.item);
  if (maxDurability === null) return `${labelItem(slot.item)} x${slot.count}`;
  return `${labelItem(slot.item)} ${slot.durability ?? maxDurability}/${maxDurability}`;
}

function slotCountText(slot: Exclude<InventorySlot, null>): string {
  const maxDurability = maxDurabilityFor(slot.item);
  if (maxDurability === null) return String(slot.count);
  return String(slot.durability ?? maxDurability);
}

function createEmptyFurnaceSnapshot(): FurnaceSnapshot {
  return {
    input: null,
    fuel: null,
    output: null,
    burnRemainingMs: 0,
    burnTotalMs: 0,
    cookProgressMs: 0,
  };
}

function cloneSnapshot(state: FurnaceSnapshot): FurnaceSnapshot {
  return {
    input: cloneSlot(state.input),
    fuel: cloneSlot(state.fuel),
    output: cloneSlot(state.output),
    burnRemainingMs: state.burnRemainingMs,
    burnTotalMs: state.burnTotalMs,
    cookProgressMs: state.cookProgressMs,
  };
}

function cloneSlot(slot: InventorySlot): InventorySlot {
  return slot ? { ...slot } : null;
}

function furnaceKey(position: FurnacePosition): string {
  return `${position.x},${position.y},${position.z}`;
}

function sanitizeMs(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function isEmptyFurnace(state: FurnaceSnapshot): boolean {
  return (
    !state.input &&
    !state.fuel &&
    !state.output &&
    state.burnRemainingMs <= 0 &&
    state.burnTotalMs <= 0 &&
    state.cookProgressMs <= 0
  );
}
