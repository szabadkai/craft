import type { InventorySystem } from '../inventory/inventorySystem';
import type { FurnaceSystem } from '../inventory/furnaceSystem';
import type { ChestSystem } from '../inventory/chestSystem';
import type { WorldStore } from '../persistence/worldStore';
import type { BlockInteractionSystem } from '../world/blockInteractionSystem';
import type { ChunkWorldSystem } from '../world/chunkWorldSystem';
import type { DoorSystem } from '../world/doorSystem';
import type { HostileSystem } from '../world/hostileMobs';
import type { ItemPickupSystem } from '../world/itemPickups';
import type { WaterSimSystem } from '../world/waterSim';
import { randomSeedText, seedFromString } from '../world/seed';

type StartScreenElements = {
  seedInputEl: HTMLInputElement;
  startFormEl: HTMLFormElement;
  randomSeedEl: HTMLButtonElement;
  seedPreviewEl: HTMLElement;
  continueWorldEl: HTMLButtonElement;
  clearWorldEl: HTMLButtonElement;
  clearWorldStatusEl: HTMLElement;
};

type StartScreenHandlersOptions = {
  elements: StartScreenElements;
  worldStore: WorldStore;
  chunkWorld: ChunkWorldSystem;
  itemPickups: ItemPickupSystem;
  interactionSystem: BlockInteractionSystem;
  inventorySystem: InventorySystem;
  furnaceSystem: FurnaceSystem;
  chestSystem: ChestSystem;
  doorSystem: DoorSystem;
  waterSim: WaterSimSystem;
  hostile: HostileSystem;
  getWorldStarted: () => boolean;
  setWorldReady: (ready: boolean) => void;
  setSeed: (seed: number) => void;
  startWorld: (seedText: string) => void;
};

export function setupStartScreenHandlers(options: StartScreenHandlersOptions): void {
  const { elements } = options;

  const updateSeedPreview = (): void => {
    options.setSeed(seedFromString(elements.seedInputEl.value));
    elements.seedPreviewEl.textContent = String(seedFromString(elements.seedInputEl.value));
  };

  const refreshContinueButton = async (): Promise<void> => {
    const hasSave = await options.worldStore.hasSavedWorld();
    elements.continueWorldEl.style.display = hasSave ? '' : 'none';
  };

  elements.startFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    options.startWorld(elements.seedInputEl.value);
  });

  elements.continueWorldEl.addEventListener('click', () => {
    options.startWorld(elements.seedInputEl.value);
  });

  elements.seedInputEl.addEventListener('input', () => {
    updateSeedPreview();
    refreshContinueButton().catch(console.error);
  });

  elements.clearWorldEl.addEventListener('click', () => {
    clearSavedWorld(options).catch((error) => {
      console.error(error);
      elements.clearWorldStatusEl.textContent = 'Clear failed. Check console.';
      elements.clearWorldEl.disabled = false;
    });
  });

  elements.randomSeedEl.addEventListener('click', () => {
    elements.seedInputEl.value = randomSeedText();
    updateSeedPreview();
    refreshContinueButton().catch(console.error);
  });

  updateSeedPreview();
  refreshContinueButton().catch(console.error);
}

async function clearSavedWorld(options: StartScreenHandlersOptions): Promise<void> {
  const { elements } = options;
  elements.clearWorldEl.disabled = true;
  elements.clearWorldStatusEl.textContent = 'Clearing saves...';
  const normalizedSeedText = elements.seedInputEl.value.trim() || '0';
  options.setSeed(seedFromString(normalizedSeedText));
  elements.seedPreviewEl.textContent = String(seedFromString(normalizedSeedText));
  await options.worldStore.clearCurrentWorld();
  options.chunkWorld.clearLoadedChunks();
  options.itemPickups.clear();
  options.interactionSystem.stopMining();
  options.inventorySystem.resetInventory();
  options.furnaceSystem.load(null);
  options.chestSystem.load(null);
  options.doorSystem.clear();
  options.waterSim.clear();
  options.hostile.clear();
  options.setWorldReady(false);
  if (options.getWorldStarted()) {
    options.startWorld(normalizedSeedText);
  }
  elements.clearWorldStatusEl.textContent = 'Saved chunks and inventory cleared.';
  elements.clearWorldEl.disabled = false;
  elements.continueWorldEl.style.display = 'none';
}
