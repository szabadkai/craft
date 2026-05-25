import type { InventorySystem } from '../inventory/inventorySystem';
import type { FurnaceSystem } from '../inventory/furnaceSystem';
import type { ChestSystem } from '../inventory/chestSystem';
import type { EatingSystem } from '../player/eating';
import type { PlayerState } from '../player/playerController';
import { TouchControls } from '../ui/touchControls';
import type { BlockInteractionSystem } from '../world/blockInteractionSystem';

type TouchSetupOptions = {
  isMobile: boolean;
  keys: Set<string>;
  player: PlayerState;
  getMouseSensitivity: () => number;
  getWorldReady: () => boolean;
  inventorySystem: InventorySystem;
  furnaceSystem: FurnaceSystem;
  chestSystem: ChestSystem;
  interactionSystem: BlockInteractionSystem;
  eatingSystem: EatingSystem;
  handlePrimaryAction: () => void;
  handleSecondaryAction: () => void;
  audioResume: () => void;
};

export function setupTouchControls(options: TouchSetupOptions): TouchControls | null {
  if (!options.isMobile) return null;
  return new TouchControls(options.keys, options.player, options.getMouseSensitivity, {
    onMineStart: () => {
      if (
        !options.getWorldReady() ||
        options.inventorySystem.isOpen ||
        options.furnaceSystem.isOpen ||
        options.chestSystem.isOpen
      ) return;
      options.handlePrimaryAction();
    },
    onMineStop: () => {
      options.interactionSystem.stopMining();
      options.eatingSystem.cancel();
    },
    onPlace: () => {
      if (
        !options.getWorldReady() ||
        options.inventorySystem.isOpen ||
        options.furnaceSystem.isOpen ||
        options.chestSystem.isOpen
      ) return;
      options.handleSecondaryAction();
    },
    onPlaceStop: () => {
      options.eatingSystem.cancel();
    },
    onAudioResume: () => {
      options.audioResume();
    },
  });
}
