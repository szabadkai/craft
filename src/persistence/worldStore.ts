import { Item } from '../inventory/items';
import type { InventorySnapshot } from '../inventory/inventorySystem';
import { ChunkKey } from '../types';

const CHUNK_STORAGE_VERSION = 2;

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

  private storedChunkKey(key: ChunkKey): string {
    return `${this.getSeed()}:v${CHUNK_STORAGE_VERSION}:${key}`;
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
