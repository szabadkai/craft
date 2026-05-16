import {
  Item,
  itemDefs,
  maxDurabilityFor,
  stackLimitFor,
} from './items';

export type InventorySlot = { item: Item; count: number; durability?: number } | null;

export type InventorySnapshot = {
  version: 2;
  slots: InventorySlot[];
};

const INVENTORY_SLOT_COUNT = 36;

export { INVENTORY_SLOT_COUNT };

export function emptyInventorySlots(): InventorySlot[] {
  return Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);
}

export function createInventorySlotsFromCounts(counts: Partial<Record<Item, number>>): InventorySlot[] {
  let slots = emptyInventorySlots();
  for (const def of itemDefs) {
    const count = sanitizeCount(counts[def.id] ?? 0);
    if (count <= 0) continue;
    const durability = maxDurabilityFor(def.id);
    if (durability !== null) {
      for (let index = 0; index < count; index++) addToolSlot(slots, def.id, durability);
      continue;
    }
    slots = applyItemDelta(slots, def.id, count).slots;
  }
  return slots;
}

export function applyItemDelta(
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

export function canFitItem(slots: InventorySlot[], item: Item, amount: number): boolean {
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

export function insertInventorySlot(
  slots: InventorySlot[],
  incoming: Exclude<InventorySlot, null>,
): { slots: InventorySlot[]; remainder: InventorySlot; inserted: boolean } {
  const next = slots.map((slot) => (slot ? { ...slot } : null));
  const slotToInsert = { ...incoming };
  const durability = maxDurabilityFor(slotToInsert.item);

  if (durability !== null) {
    const emptyIndex = next.findIndex((slot) => slot === null);
    if (emptyIndex < 0) return { slots, remainder: slotToInsert, inserted: false };
    next[emptyIndex] = slotToInsert;
    return { slots: next, remainder: null, inserted: true };
  }

  const limit = stackLimitFor(slotToInsert.item);
  for (const slot of next) {
    if (!slot || slot.item !== slotToInsert.item || slot.count >= limit) continue;
    const added = Math.min(slotToInsert.count, limit - slot.count);
    slot.count += added;
    slotToInsert.count -= added;
    if (slotToInsert.count <= 0) return { slots: next, remainder: null, inserted: true };
  }
  for (let index = 0; index < next.length; index++) {
    if (next[index]) continue;
    const added = Math.min(slotToInsert.count, limit);
    next[index] = { item: slotToInsert.item, count: added };
    slotToInsert.count -= added;
    if (slotToInsert.count <= 0) return { slots: next, remainder: null, inserted: true };
  }
  return { slots: next, remainder: slotToInsert, inserted: slotToInsert.count !== incoming.count };
}

export function normalizeInventorySnapshot(
  saved: InventorySnapshot | Partial<Record<Item, number>>,
  fallback: InventorySlot[],
): InventorySlot[] {
  if (isInventorySnapshot(saved)) return normalizeSlots(saved.slots);
  return createInventorySlotsFromCounts({ ...countsFromSlots(fallback), ...saved });
}

export function countsFromSlots(slots: InventorySlot[]): Partial<Record<Item, number>> {
  const counts: Partial<Record<Item, number>> = {};
  for (const slot of slots) {
    if (!slot) continue;
    counts[slot.item] = (counts[slot.item] ?? 0) + slot.count;
  }
  return counts;
}

export function mergeSlots(primary: InventorySlot[], secondary: InventorySlot[]): InventorySlot[] {
  const merged = primary.map((slot) => (slot ? { ...slot } : null));
  for (const slot of secondary) {
    if (!slot) continue;
    const index = merged.findIndex((candidate) => candidate === null);
    if (index < 0) break;
    merged[index] = { ...slot };
  }
  return merged;
}

export function isItem(value: unknown): value is Item {
  return typeof value === 'string' && itemDefs.some((def) => def.id === value);
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
    const durability = maxDurabilityFor(slot.item);
    if (durability !== null) {
      const d = sanitizeDurability(slot.durability ?? durability, durability);
      addToolSlot(slotsFromSnapshot, slot.item, d);
      continue;
    }
    counts[slot.item] = (counts[slot.item] ?? 0) + sanitizeCount(slot.count);
  }
  return mergeSlots(slotsFromSnapshot, createInventorySlotsFromCounts(counts));
}

function addToSlots(slots: InventorySlot[], item: Item, amount: number): number {
  const durability = maxDurabilityFor(item);
  if (durability !== null) return addToolsToSlots(slots, item, amount, durability);

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
  durability: number,
): number {
  let added = 0;
  for (let index = 0; index < slots.length && added < amount; index++) {
    if (slots[index]) continue;
    slots[index] = { item, count: 1, durability };
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

function sanitizeDurability(durability: number, max: number): number {
  const sanitized = Math.floor(Number.isFinite(durability) ? durability : max);
  return Math.max(1, Math.min(max, sanitized));
}

function addToolSlot(slots: InventorySlot[], item: Item, durability: number): void {
  const index = slots.findIndex((slot) => slot === null);
  if (index >= 0) slots[index] = { item, count: 1, durability };
}
