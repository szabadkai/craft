import { ChestSnapshot } from '../inventory/chestSystem';
import { FurnaceSnapshot } from '../inventory/furnaceSystem';
import { Item } from '../inventory/items';
import type { InventorySnapshot } from '../inventory/inventorySystem';
import { ChunkKey } from '../types';

export type DoorSnapshot = Record<string, 'x' | 'z'>;

const CHUNK_STORAGE_VERSION = 4;

export class WorldStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly getSeed: () => number) {}

  async loadSavedChunk(key: ChunkKey): Promise<Uint16Array | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const request = tx.objectStore('chunks').get(this.storedChunkKey(key));
      request.onsuccess = () => {
        const value = request.result as ArrayBuffer | undefined;
        resolve(value ? new Uint16Array(value) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveChunk(key: ChunkKey, blocks: Uint16Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const copy = blocks.buffer.slice(0);
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(copy, this.storedChunkKey(key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadInventory(): Promise<InventorySnapshot | Partial<Record<Item, number>> | null> {
    const value =
      await this.loadState<InventorySnapshot | Partial<Record<Item, number>>>('inventory');
    return value ?? null;
  }

  async loadHotbar(): Promise<Item[] | null> {
    const value = await this.loadState<Item[]>('hotbar');
    return Array.isArray(value) ? value : null;
  }

  async saveInventory(inventory: InventorySnapshot): Promise<void> {
    await this.saveState('inventory', inventory);
  }

  async saveHotbar(hotbar: Item[]): Promise<void> {
    await this.saveState('hotbar', hotbar);
  }

  async loadFurnaces(): Promise<Record<string, FurnaceSnapshot> | null> {
    const value = await this.loadState<Record<string, FurnaceSnapshot>>(this.furnaceStateKey());
    return value ?? null;
  }

  async saveFurnaces(furnaces: Record<string, FurnaceSnapshot>): Promise<void> {
    await this.saveState(this.furnaceStateKey(), furnaces);
  }

  async loadChests(): Promise<Record<string, ChestSnapshot> | null> {
    const value = await this.loadState<Record<string, ChestSnapshot>>(this.chestStateKey());
    return value ?? null;
  }

  async saveChests(chests: Record<string, ChestSnapshot>): Promise<void> {
    await this.saveState(this.chestStateKey(), chests);
  }

  async loadDoors(): Promise<Record<string, 'x' | 'z'> | null> {
    const value = await this.loadState<Record<string, 'x' | 'z'>>(this.doorStateKey());
    return value ?? null;
  }

  async saveDoors(doors: Record<string, 'x' | 'z'>): Promise<void> {
    await this.saveState(this.doorStateKey(), doors);
  }

  async hasSavedWorld(): Promise<boolean> {
    const db = await this.open();
    const prefix = this.storedChunkPrefix();
    return new Promise((resolve) => {
      const tx = db.transaction('chunks', 'readonly');
      const request = tx.objectStore('chunks').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(false);
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) return resolve(true);
        cursor.continue();
      };
      request.onerror = () => resolve(false);
    });
  }

  async clearCurrentWorld(): Promise<void> {
    const db = await this.open();
    await Promise.all([
      this.clearChunksForCurrentSeed(db),
      this.deleteState(db, 'inventory'),
      this.deleteState(db, 'hotbar'),
      this.deleteState(db, this.furnaceStateKey()),
      this.deleteState(db, this.chestStateKey()),
      this.deleteState(db, this.doorStateKey()),
    ]);
  }

  private storedChunkKey(key: ChunkKey): string {
    return `${this.getSeed()}:v${CHUNK_STORAGE_VERSION}:${key}`;
  }

  private storedChunkPrefix(): string {
    return `${this.getSeed()}:v${CHUNK_STORAGE_VERSION}:`;
  }

  private furnaceStateKey(): string {
    return `furnaces:${this.getSeed()}`;
  }

  private chestStateKey(): string {
    return `chests:${this.getSeed()}`;
  }

  private doorStateKey(): string {
    return `doors:${this.getSeed()}`;
  }

  private async loadState<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction('state', 'readonly');
      const request = tx.objectStore('state').get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => resolve(undefined);
    });
  }

  private async saveState<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  private clearChunksForCurrentSeed(db: IDBDatabase): Promise<void> {
    const prefix = this.storedChunkPrefix();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private deleteState(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('craft-world-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });
    return this.dbPromise;
  }
}
