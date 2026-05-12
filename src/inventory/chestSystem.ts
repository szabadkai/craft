import { Block } from '../types';
import { InventorySystem, InventorySlot } from './inventorySystem';
import { itemSwatch, labelItem, maxDurabilityFor, stackLimitFor } from './items';

export type ChestPosition = { x: number; y: number; z: number };

export type ChestSnapshot = {
  slots: (InventorySlot | null)[];
};

type ChestUiElements = {
  chestOverlayEl: HTMLDivElement;
  chestGridEl: HTMLDivElement;
  chestInventoryEl: HTMLDivElement;
};

type ChestCallbacks = {
  save: () => void;
  spawnDrop: (slot: Exclude<InventorySlot, null>, position: ChestPosition) => void;
  getBlock: (x: number, y: number, z: number) => Block;
};

type OpenChest = {
  key: string;
  position: ChestPosition;
};

const CHEST_SIZE = 27;

export class ChestSystem {
  private readonly chests = new Map<string, ChestSnapshot>();
  private openChest: OpenChest | null = null;

  constructor(
    private readonly inventory: InventorySystem,
    private readonly ui: ChestUiElements,
    private readonly callbacks: ChestCallbacks,
  ) {}

  get isOpen(): boolean {
    return this.openChest !== null;
  }

  tick(): void {
    if (
      this.openChest &&
      this.callbacks.getBlock(
        this.openChest.position.x,
        this.openChest.position.y,
        this.openChest.position.z,
      ) !== Block.Chest
    ) {
      this.openChest = null;
    }
    this.paint();
  }

  load(snapshot: Record<string, ChestSnapshot> | null): void {
    this.chests.clear();
    if (!snapshot) {
      this.paint();
      return;
    }
    for (const [key, state] of Object.entries(snapshot)) {
      this.chests.set(key, {
        slots: state.slots.map(cloneSlot),
      });
    }
    this.paint();
  }

  snapshot(): Record<string, ChestSnapshot> {
    return Object.fromEntries(
      Array.from(this.chests.entries(), ([key, state]) => [
        key,
        { slots: state.slots.map(cloneSlot) },
      ]),
    );
  }

  openAt(position: ChestPosition): void {
    const key = chestKey(position);
    this.openChest = { key, position };
    if (!this.chests.has(key)) {
      this.chests.set(key, { slots: Array.from({ length: CHEST_SIZE }, () => null) });
    }
    this.paint();
  }

  close(): void {
    this.openChest = null;
    this.paint();
  }

  removeAt(position: ChestPosition): void {
    const key = chestKey(position);
    const state = this.chests.get(key);
    if (!state) return;
    for (const slot of state.slots) {
      if (slot) this.callbacks.spawnDrop(slot, position);
    }
    this.chests.delete(key);
    if (this.openChest?.key === key) this.openChest = null;
    this.callbacks.save();
    this.paint();
  }

  private requireOpenChest(): ChestSnapshot {
    if (!this.openChest) throw new Error('No chest open');
    let state = this.chests.get(this.openChest.key);
    if (!state) {
      state = { slots: Array.from({ length: CHEST_SIZE }, () => null) };
      this.chests.set(this.openChest.key, state);
    }
    return state;
  }

  private transferToChest(inventoryIndex: number): void {
    const state = this.requireOpenChest();
    const slot = this.inventory.slotAt(inventoryIndex);
    if (!slot) return;
    const emptySlot = state.slots.findIndex((s) => !s);
    const stackSlot = state.slots.findIndex((s) => s && s.item === slot.item && s.count < stackLimitFor(slot.item));
    const targetIndex = stackSlot >= 0 ? stackSlot : emptySlot;
    if (targetIndex < 0) return;

    const taken = this.inventory.takeSlot(inventoryIndex);
    if (!taken) return;

    const target = state.slots[targetIndex];
    if (!target) {
      state.slots[targetIndex] = taken;
    } else {
      const space = stackLimitFor(taken.item) - target.count;
      const moved = Math.min(space, taken.count);
      state.slots[targetIndex] = { ...target, count: target.count + moved };
      if (taken.count > moved) {
        this.inventory.insertSlot({ ...taken, count: taken.count - moved });
      }
    }

    this.callbacks.save();
    this.paint();
  }

  private transferFromChest(chestIndex: number): void {
    const state = this.requireOpenChest();
    const slot = state.slots[chestIndex];
    if (!slot) return;
    const remainder = this.inventory.insertSlot(slot);
    state.slots[chestIndex] = remainder;
    this.callbacks.save();
    this.paint();
  }

  private paint(): void {
    this.ui.chestOverlayEl.classList.toggle('hidden', !this.isOpen);
    if (!this.isOpen) return;

    const state = this.requireOpenChest();

    // chest slots
    this.ui.chestGridEl.innerHTML = '';
    for (let i = 0; i < CHEST_SIZE; i++) {
      const slot = state.slots[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-slot${slot ? '' : ' empty'}`;
      button.title = slot ? slotTitle(slot) : 'Empty';
      button.addEventListener('click', () => this.transferFromChest(i));
      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      if (slot) swatch.style.background = itemSwatch(slot.item);
      const count = document.createElement('span');
      count.className = 'inventory-count';
      count.textContent = slot ? slotCountText(slot) : '';
      button.append(swatch, count);
      this.ui.chestGridEl.appendChild(button);
    }

    // player inventory
    this.ui.chestInventoryEl.innerHTML = '';
    this.inventory.inventorySlotsSnapshot().forEach((slot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `inventory-slot${slot ? '' : ' empty'}`;
      button.title = slot ? slotTitle(slot) : 'Empty';
      button.addEventListener('click', () => this.transferToChest(index));
      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      if (slot) swatch.style.background = itemSwatch(slot.item);
      const count = document.createElement('span');
      count.className = 'inventory-count';
      count.textContent = slot ? slotCountText(slot) : '';
      button.append(swatch, count);
      this.ui.chestInventoryEl.appendChild(button);
    });
  }
}

function cloneSlot(slot: InventorySlot): InventorySlot {
  return slot ? { ...slot } : null;
}

function chestKey(position: ChestPosition): string {
  return `${position.x},${position.y},${position.z}`;
}

function slotTitle(slot: Exclude<InventorySlot, null>): string {
  const dur = maxDurabilityFor(slot.item);
  if (dur === null) return `${labelItem(slot.item)} x${slot.count}`;
  return `${labelItem(slot.item)} ${slot.durability ?? dur}/${dur}`;
}

function slotCountText(slot: Exclude<InventorySlot, null>): string {
  const dur = maxDurabilityFor(slot.item);
  if (dur === null) return String(slot.count);
  return String(slot.durability ?? dur);
}
