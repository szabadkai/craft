import { blockColor } from '../blocks';
import { Block } from '../types';
import {
  defaultInventory,
  HeldItem,
  heldItemFor,
  Item,
  itemDefs,
  itemSwatch,
  labelItem,
  Recipe,
  recipes,
} from './items';

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
  private readonly inventory: Record<Item, number> = { ...defaultInventory };
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
    return this.inventory[item];
  }

  addItem(item: Item | null, amount: number): void {
    if (!item) return;
    this.inventory[item] += amount;
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
  }

  selectHotbarSlot(index: number): void {
    if (index < 0 || index >= this.hotbarEntries.length) return;
    this.selectedHotbarIndex = index;
    this.paintHotbar();
    this.callbacks.rebuildHeldItem();
  }

  applyInventory(saved: Partial<Record<Item, number>>): void {
    for (const item of Object.keys(this.inventory) as Item[]) {
      this.inventory[item] = Math.max(0, Math.floor(saved[item] ?? this.inventory[item]));
    }
    this.paintInventory();
    this.paintOverlay();
  }

  snapshotInventory(): Record<Item, number> {
    return { ...this.inventory };
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
    const visibleItems = (Object.entries(this.inventory) as Array<[Item, number]>).filter(
      ([, count]) => count > 0,
    );
    inventoryEl.innerHTML = '';
    if (visibleItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.textContent = 'Empty';
      inventoryEl.appendChild(empty);
    }
    for (const [item, count] of visibleItems) {
      const slot = document.createElement('button');
      slot.className = 'inventory-slot';
      slot.type = 'button';
      slot.title = labelItem(item);
      slot.disabled = heldItemFor(item) === null;
      slot.addEventListener('click', () => this.assignItemToSelectedSlot(item));

      const swatch = document.createElement('span');
      swatch.className = 'inventory-swatch';
      swatch.style.background = itemSwatch(item);
      const countEl = document.createElement('span');
      countEl.className = 'inventory-count';
      countEl.textContent = String(count);
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
      const count = this.inventory[def.id];
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
    return Object.entries(recipe.inputs).every(
      ([item, count]) => this.inventory[item as Item] >= (count ?? 0),
    );
  }

  private craft(recipe: Recipe): void {
    if (!this.canCraft(recipe)) return;
    for (const [item, count] of Object.entries(recipe.inputs))
      this.inventory[item as Item] -= count ?? 0;
    for (const [item, count] of Object.entries(recipe.outputs))
      this.inventory[item as Item] += count ?? 0;
    this.paintInventory();
    this.paintOverlay();
    this.callbacks.saveInventory();
  }
}
