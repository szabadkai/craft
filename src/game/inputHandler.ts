import * as THREE from 'three';
import { Block } from '../types';
import { BASE_MOUSE_RADIANS_PER_PIXEL, clampMouseSensitivity, formatMouseSensitivity, saveMouseSensitivity } from '../player/mouseSensitivity';
import { clampDetailRadius, formatRenderDistance, getDetailRadius, setDetailRadius } from '../player/renderDistance';
import { saveSandboxMode } from '../player/sandboxMode';
import { foodValueFor, Item } from '../inventory/items';
import type { Wildlife } from '../world/wildlife';
import type { Hostile } from '../world/hostileMobs';
import type { BlockHit } from '../world/blockRaycaster';

type BlockSetEntry = { wx: number; y: number; wz: number; block: Block };

type InputState = {
  keys: Set<string>;
  mouse: { locked: boolean };
  mouseSensitivity: number;
  sandboxMode: boolean;
  worldStarted: boolean;
  worldReady: boolean;
  isMobile: boolean;
};

type InputSystems = {
  renderer: THREE.WebGLRenderer;
  player: { yaw: number; pitch: number; position: THREE.Vector3 };
  camera: THREE.PerspectiveCamera;
  inventorySystem: {
    isOpen: boolean;
    toggleOpen: () => boolean;
    setOpen: (open: boolean) => void;
    hotbarSize: number;
    selectHotbarSlot: (i: number) => void;
    selectedHotbarIndex: number;
    slotAt: (i: number) => { item: Item; count: number } | null;
  };
  furnaceSystem: { isOpen: boolean; close: () => void; openAt: (p: { x: number; y: number; z: number }) => void; };
  chestSystem: { isOpen: boolean; close: () => void; openAt: (p: { x: number; y: number; z: number }) => void; };
  interactionSystem: { startMining: (hit: BlockHit) => void; stopMining: () => void; place: (hit: BlockHit) => void; };
  blockRaycaster: { raycast: () => BlockHit | null; };
  wildlife: { raycast: (camera: THREE.PerspectiveCamera) => { animal: Wildlife; distance: number } | null; hit: (animal: Wildlife, now: number) => void; };
  hostile: { raycast: (camera: THREE.PerspectiveCamera) => { mob: Hostile; distance: number } | null; hit: (mob: Hostile, now: number) => void; };
  doorSystem: { toggle: (x: number, y: number, z: number, getBlock: (wx: number, y: number, wz: number) => Block, setBlocks: (entries: BlockSetEntry[]) => void) => void; };
  chunkWorld: { setBlocks: (entries: BlockSetEntry[]) => void; };
  eatingSystem: { tryStart: () => void; cancel: () => void; };
  consoleSystem: { isOpen: boolean; toggle: () => void; };
  diagnostics: { isOpen: boolean; setOpen: (open: boolean) => void; };
  pauseMenu: {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    sensitivityInputEl: HTMLInputElement;
    sensitivityValueEl: HTMLElement;
    renderDistanceInputEl: HTMLInputElement;
    renderDistanceValueEl: HTMLElement;
    sfxVolumeInputEl: HTMLInputElement;
    sfxVolumeValueEl: HTMLElement;
    musicVolumeInputEl: HTMLInputElement;
    musicVolumeValueEl: HTMLElement;
    sandboxInputEl: HTMLInputElement;
  };
  audioEngine: { resume: () => void; setSfxVolume: (v: number) => void; setMusicVolume: (v: number) => void; toggleMute: () => void; };
  sfx: { hotbarSelect: () => void; uiClick: () => void; chestOpen: () => void; chestClose: () => void; blockPlace: () => void; doorToggle: (opening: boolean) => void; };
  health: { state: { isDead: boolean } };
  getBlock: (wx: number, y: number, wz: number) => Block;
  triggerHandSwing: (kind: 'mine' | 'place') => void;
};

type InputElements = {
  sensitivityInputEl: HTMLInputElement;
  sensitivityValueEl: HTMLElement;
  renderDistanceInputEl: HTMLInputElement;
  renderDistanceValueEl: HTMLElement;
  sfxVolumeInputEl: HTMLInputElement;
  sfxVolumeValueEl: HTMLElement;
  musicVolumeInputEl: HTMLInputElement;
  musicVolumeValueEl: HTMLElement;
  sandboxInputEl: HTMLInputElement;
  inventoryOverlayEl: HTMLElement;
  furnaceOverlayEl: HTMLElement;
  chestOverlayEl: HTMLElement;
};

export type ActionHandlers = {
  handlePrimaryAction: () => void;
  handleSecondaryAction: () => void;
};

export function setupInputHandlers(
  state: InputState,
  systems: InputSystems,
  elements: InputElements,
  applyRenderDistance: () => void,
): ActionHandlers {
  const { renderer, player, camera, inventorySystem, furnaceSystem, chestSystem, interactionSystem, blockRaycaster, wildlife, hostile, doorSystem, chunkWorld, eatingSystem, consoleSystem, diagnostics, pauseMenu, audioEngine, sfx, health, getBlock, triggerHandSwing } = systems;

  function handlePrimaryAction(): void {
    const hit = blockRaycaster.raycast();
    const animalHit = wildlife.raycast(camera);
    const hostileHit = hostile.raycast(camera);
    const animalDist = animalHit?.distance ?? Infinity;
    const hostileDist = hostileHit?.distance ?? Infinity;
    const blockDist = hit?.distance ?? Infinity;
    const closestDist = Math.min(animalDist, hostileDist, blockDist);
    if (closestDist < Infinity) {
      if (animalDist === closestDist && animalHit) {
        interactionSystem.stopMining();
        wildlife.hit(animalHit.animal, performance.now());
        triggerHandSwing('mine');
        return;
      }
      if (hostileDist === closestDist && hostileHit) {
        interactionSystem.stopMining();
        hostile.hit(hostileHit.mob, performance.now());
        triggerHandSwing('mine');
        return;
      }
      if (hit) interactionSystem.startMining(hit);
    }
  }

  function handleSecondaryAction(): void {
    const slot = inventorySystem.slotAt(inventorySystem.selectedHotbarIndex);
    if (slot && foodValueFor(slot.item) > 0) {
      eatingSystem.tryStart();
      return;
    }
    const hit = blockRaycaster.raycast();
    if (!hit) return;
    const b = getBlock(hit.block.x, hit.block.y, hit.block.z);
    if (b === Block.OakDoor || b === Block.OakDoorOpen) {
      const opening = b === Block.OakDoor;
      doorSystem.toggle(hit.block.x, hit.block.y, hit.block.z, getBlock, (entries) => chunkWorld.setBlocks(entries));
      sfx.doorToggle(opening);
      return;
    }
    if (b === Block.Furnace || b === Block.Chest) {
      inventorySystem.setOpen(false);
      interactionSystem.stopMining();
      const p = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
      (b === Block.Furnace ? furnaceSystem : chestSystem).openAt(p);
      sfx.chestOpen();
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      return;
    }
    interactionSystem.place(hit);
    sfx.blockPlace();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'F3') {
      event.preventDefault();
      diagnostics.setOpen(!diagnostics.isOpen);
      return;
    }
    if (event.code === 'Backquote') {
      event.preventDefault();
      consoleSystem.toggle();
      interactionSystem.stopMining();
      if (consoleSystem.isOpen && document.pointerLockElement === renderer.domElement)
        document.exitPointerLock();
      return;
    }
    if (consoleSystem.isOpen) return;
    if (!state.worldStarted && event.code !== 'Tab') return;
    if (event.code === 'KeyE') {
      event.preventDefault();
      eatingSystem.cancel();
      if (furnaceSystem.isOpen) { furnaceSystem.close(); sfx.chestClose(); return; }
      if (chestSystem.isOpen) { chestSystem.close(); sfx.chestClose(); return; }
      const inventoryOpen = inventorySystem.toggleOpen();
      sfx.uiClick();
      interactionSystem.stopMining();
      if (inventoryOpen && document.pointerLockElement === renderer.domElement)
        document.exitPointerLock();
      return;
    }
    if (event.code === 'KeyM' && !inventorySystem.isOpen) {
      audioEngine.toggleMute();
      return;
    }
    if (event.code === 'Escape') {
      if (consoleSystem.isOpen) { consoleSystem.toggle(); return; }
      if (furnaceSystem.isOpen) { furnaceSystem.close(); sfx.chestClose(); return; }
      if (chestSystem.isOpen) { chestSystem.close(); sfx.chestClose(); return; }
      if (inventorySystem.isOpen) { inventorySystem.setOpen(false); return; }
      if (pauseMenu.isOpen) { pauseMenu.close(); return; }
      if (state.worldReady && !health.state.isDead) {
        pauseMenu.open();
        interactionSystem.stopMining();
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        return;
      }
    }
    if (furnaceSystem.isOpen && event.code !== 'Tab') return;
    state.keys.add(event.code);
    const slot = Number(event.key) - 1;
    if (slot >= 0 && slot < inventorySystem.hotbarSize) {
      eatingSystem.cancel();
      inventorySystem.selectHotbarSlot(slot);
      sfx.hotbarSelect();
    }
  });

  document.addEventListener('keyup', (event) => state.keys.delete(event.code));

  renderer.domElement.addEventListener('click', () => {
    audioEngine.resume();
    if (state.isMobile) return;
    if (!state.worldReady || inventorySystem.isOpen || health.state.isDead) return;
    if (!state.mouse.locked) {
      renderer.domElement.requestPointerLock().catch(() => {
        state.mouse.locked = false;
      });
    }
  });

  document.addEventListener('pointerlockchange', () => {
    state.mouse.locked = document.pointerLockElement === renderer.domElement;
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.worldReady || !state.mouse.locked || health.state.isDead) return;
    const sensitivity = BASE_MOUSE_RADIANS_PER_PIXEL * state.mouseSensitivity;
    player.yaw -= event.movementX * sensitivity;
    player.pitch -= event.movementY * sensitivity;
    player.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, player.pitch));
  });

  document.addEventListener('mousedown', (event) => {
    if (!state.worldReady || !state.mouse.locked || inventorySystem.isOpen || furnaceSystem.isOpen || chestSystem.isOpen) return;
    if (event.button === 0) handlePrimaryAction();
    else if (event.button === 2) handleSecondaryAction();
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) interactionSystem.stopMining();
    if (event.button === 2) eatingSystem.cancel();
  });

  window.addEventListener('blur', () => interactionSystem.stopMining());
  document.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('resize', () => {
    (camera as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Settings UI synchronization
  elements.sensitivityInputEl.addEventListener('input', () => {
    state.mouseSensitivity = clampMouseSensitivity(Number(elements.sensitivityInputEl.value));
    const label = formatMouseSensitivity(state.mouseSensitivity);
    elements.sensitivityValueEl.textContent = label;
    saveMouseSensitivity(state.mouseSensitivity);
    pauseMenu.sensitivityInputEl.value = String(state.mouseSensitivity);
    pauseMenu.sensitivityValueEl.textContent = label;
  });

  elements.renderDistanceInputEl.addEventListener('input', () => {
    const value = clampDetailRadius(Number(elements.renderDistanceInputEl.value));
    const label = formatRenderDistance(value);
    elements.renderDistanceValueEl.textContent = label;
    setDetailRadius(value);
    applyRenderDistance();
    pauseMenu.renderDistanceInputEl.value = String(value);
    pauseMenu.renderDistanceValueEl.textContent = label;
  });

  elements.sfxVolumeInputEl.addEventListener('input', () => {
    const v = Number(elements.sfxVolumeInputEl.value) / 100;
    audioEngine.setSfxVolume(v);
    elements.sfxVolumeValueEl.textContent = `${elements.sfxVolumeInputEl.value}%`;
    pauseMenu.sfxVolumeInputEl.value = elements.sfxVolumeInputEl.value;
    pauseMenu.sfxVolumeValueEl.textContent = `${elements.sfxVolumeInputEl.value}%`;
  });

  elements.musicVolumeInputEl.addEventListener('input', () => {
    const v = Number(elements.musicVolumeInputEl.value) / 100;
    audioEngine.setMusicVolume(v);
    elements.musicVolumeValueEl.textContent = `${elements.musicVolumeInputEl.value}%`;
    pauseMenu.musicVolumeInputEl.value = elements.musicVolumeInputEl.value;
    pauseMenu.musicVolumeValueEl.textContent = `${elements.musicVolumeInputEl.value}%`;
  });

  elements.sandboxInputEl.addEventListener('change', () => {
    state.sandboxMode = elements.sandboxInputEl.checked;
    saveSandboxMode(state.sandboxMode);
    pauseMenu.sandboxInputEl.checked = state.sandboxMode;
  });

  elements.inventoryOverlayEl.addEventListener('click', (e) => {
    if (e.target === elements.inventoryOverlayEl) { inventorySystem.setOpen(false); sfx.uiClick(); }
  });
  elements.furnaceOverlayEl.addEventListener('click', (e) => {
    if (e.target === elements.furnaceOverlayEl) { furnaceSystem.close(); sfx.chestClose(); }
  });
  elements.chestOverlayEl.addEventListener('click', (e) => {
    if (e.target === elements.chestOverlayEl) { chestSystem.close(); sfx.chestClose(); }
  });

  return { handlePrimaryAction, handleSecondaryAction };
}
