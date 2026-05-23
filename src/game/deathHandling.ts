import * as THREE from 'three';
import type { InventorySystem } from '../inventory/inventorySystem';
import { createHealth } from '../player/health';
import type { PlayerState } from '../player/playerController';
import type { SfxSystem } from '../audio/sfx';
import type { ItemPickupSystem } from '../world/itemPickups';

type DeathHandlingOptions = {
  player: PlayerState;
  renderer: THREE.WebGLRenderer;
  inventorySystem: InventorySystem;
  itemPickups: ItemPickupSystem;
  sfx: SfxSystem;
  heartsEl: HTMLElement;
  damageOverlayEl: HTMLElement;
  deathScreenEl: HTMLElement;
  deathMessageEl: HTMLElement;
  respawnBtnEl: HTMLButtonElement;
  getSpawnY: () => number;
  saveInventory: () => Promise<void>;
};

const deathMessages: Record<string, string> = {
  fall: 'You fell from a high place.',
  mob: 'You were slain by a hostile creature.',
  lava: 'You tried to swim in lava.',
  unknown: 'You died.',
};

export function setupDeathHandling(options: DeathHandlingOptions): ReturnType<typeof createHealth> {
  let deathScreenShownAt = -Infinity;

  const showDeathScreen = (health: ReturnType<typeof createHealth>): void => {
    const cause = health.state.deathCause;
    options.deathMessageEl.textContent = deathMessages[cause] ?? deathMessages.unknown;
    deathScreenShownAt = performance.now();
    options.respawnBtnEl.disabled = false;
    options.deathScreenEl.classList.remove('hidden');
    if (document.pointerLockElement === options.renderer.domElement) document.exitPointerLock();
  };

  const hideDeathScreen = (): void => {
    deathScreenShownAt = -Infinity;
    options.deathScreenEl.classList.add('hidden');
  };

  const health = createHealth(
    options.getSpawnY,
    (spawnY) => {
      options.player.position.set(8, spawnY, 8);
      options.player.velocity.set(0, 0, 0);
    },
    () => options.sfx.playerHurt(),
    () => {
      const slots = options.inventorySystem.snapshotInventory().slots;
      for (const slot of slots) {
        if (slot) options.itemPickups.spawn(slot.item, slot.count, options.player.position.clone());
      }
      options.inventorySystem.resetInventory();
      options.saveInventory().catch(console.error);
      options.sfx.playerDeath();
      showDeathScreen(health);
    },
  );

  health.mount(options.heartsEl, options.damageOverlayEl);

  options.respawnBtnEl.addEventListener('click', () => {
    if (performance.now() - deathScreenShownAt < 250) return;
    health.triggerRespawn();
    hideDeathScreen();
    options.renderer.domElement.requestPointerLock().catch(() => {});
  });

  return health;
}
