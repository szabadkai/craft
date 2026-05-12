import './style.css';
import * as THREE from 'three';
import { ChestSystem } from './inventory/chestSystem';
import { FurnaceSystem } from './inventory/furnaceSystem';
import { InventorySystem } from './inventory/inventorySystem';
import { ConsoleCommand, ConsoleSystem, defaultConsoleCommands } from './ui/console';
import { PlayerController } from './player/playerController';
import { DoorSystem } from './world/doorSystem';
import { createHealth } from './player/health';
import { EatingSystem } from './player/eating';
import {
  BASE_MOUSE_RADIANS_PER_PIXEL,
  clampMouseSensitivity,
  formatMouseSensitivity,
  loadMouseSensitivity,
  saveMouseSensitivity,
} from './player/mouseSensitivity';
import {
  clampDetailRadius,
  formatRenderDistance,
  getDetailRadius,
  getFarRadius,
  getFogFar,
  getFogNear,
  setDetailRadius,
} from './player/renderDistance';
import { WorldStore } from './persistence/worldStore';
import { terrainHeight, WATER_LEVEL } from './terrain';
import { DiagnosticsSystem, DiagnosticsSummary } from './rendering/diagnostics';
import { FarTerrainSystem } from './rendering/farTerrain';
import { HeldItemView } from './rendering/heldItemView';
import { createSky, createTerrainAtlas, createTerrainMaterial, createWaterMaterial } from './rendering/terrainMaterials';
import {
  applyRenderDistance,
  updateCaveFactor,
  applyUnderwaterEffects,
} from './rendering/atmosphere';
import {
  Block,
  CHUNK_SIZE,
} from './types';
import { BlockInteractionSystem } from './world/blockInteractionSystem';
import { BlockRaycaster } from './world/blockRaycaster';
import { ChunkWorldSystem } from './world/chunkWorldSystem';
import { ItemPickupSystem } from './world/itemPickups';
import { itemDefs, foodValueFor } from './inventory/items';
import { randomSeedText, seedFromString } from './world/seed';
import { WildlifeSystem } from './world/wildlife';
import { createHud } from './ui/hud';
import { findDrySpawn } from './game/helpers';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

const savedSeedText = localStorage.getItem('craft-seed');
const defaultSeedText = savedSeedText && savedSeedText !== '18441' ? savedSeedText : '4';
let seed = seedFromString(defaultSeedText);

const airFogNear = getFogNear();
const airFogFar = getFogFar();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8e8f1);
scene.fog = new THREE.Fog(0xd8e8f1, airFogNear, airFogFar);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.05,
  getFarRadius() * CHUNK_SIZE,
);
camera.position.set(8, 76, 8);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xf8fbff, 0x8f9568, 2.05));
const sun = new THREE.DirectionalLight(0xffdfaa, 1.75);
sun.position.set(120, 82, 44);
scene.add(sun);
const sky = createSky();
scene.add(sky);

const terrainAtlas = createTerrainAtlas();
const chunkMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 1);
const fadeMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 0.72);
const waterMaterial = createWaterMaterial(scene.fog, WATER_LEVEL);

const wildlife: WildlifeSystem = new WildlifeSystem(
  scene,
  () => seed,
  getBlock,
  (position, kind) => {
    const count = kind === 'deer' || kind === 'boar' ? 1 + Math.floor(Math.random() * 2) : 1;
    itemPickups.spawn('raw_meat', count, position);
  },
);
const worldStore = new WorldStore(() => seed);

let frame = 0;
let worldStarted = false;
let worldReady = false;

const farTerrain = new FarTerrainSystem(scene);
const blockRaycaster = new BlockRaycaster(camera, getBlock);

const player = {
  position: new THREE.Vector3(8, 82, 8),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: false,
  inWater: false,
  width: 0.64,
  height: 1.8,
  eye: 1.62,
};

const keys = new Set<string>();
const mouse = { locked: false };
let mouseSensitivity = loadMouseSensitivity();
const playerController = new PlayerController(
  player,
  camera,
  keys,
  getBlock,
  () => inventorySystem.isOpen,
);
const heldItemView = new HeldItemView(camera);
const hud = createHud(
  defaultSeedText,
  formatMouseSensitivity(mouseSensitivity),
  formatRenderDistance(getDetailRadius()),
);
const {
  root: hudRoot,
  panelEl,
  statsEl,
  diagnosticsEl,
  hotbarEl,
  inventoryEl,
  recipesEl,
  inventoryOverlayEl,
  inventoryTabsEl,
  inventoryGridLargeEl,
  furnaceOverlayEl,
  furnaceInputEl,
  furnaceFuelEl,
  furnaceOutputEl,
  furnaceInventoryEl,
  furnaceBurnFillEl,
  furnaceProgressFillEl,
  furnaceStatusEl,
  chestOverlayEl,
  chestGridEl,
  chestInventoryEl,
  eatingBarEl,
  eatingBarFillEl,
  startScreenEl,
  loadingScreenEl,
  loadingStatusEl,
  seedInputEl,
  startFormEl,
  randomSeedEl,
  seedPreviewEl,
  clearWorldEl,
  clearWorldStatusEl,
  sensitivityInputEl,
  sensitivityValueEl,
  waterOverlayEl,
  damageOverlayEl,
  heartsEl,
} = hud;
sensitivityInputEl.value = String(mouseSensitivity);
const { renderDistanceInputEl, renderDistanceValueEl } = hud;
renderDistanceInputEl.value = String(getDetailRadius());
const diagnostics = new DiagnosticsSystem(renderer, diagnosticsEl, summarizeWorldDiagnostics);
const chunkWorld = new ChunkWorldSystem({
  scene,
  chunkMaterial,
  fadeMaterial,
  waterMaterial,
  worldStore,
  farTerrain,
  wildlife,
  player,
  getSeed: () => seed,
  onChunkMessage: () => diagnostics.incrementChunkMessages(),
});
const inventorySystem = new InventorySystem(
  {
    hotbarEl,
    inventoryEl,
    recipesEl,
    inventoryOverlayEl,
    inventoryTabsEl,
    inventoryGridLargeEl,
  },
  {
    saveInventory: () => saveInventory(),
    saveHotbar: () => saveInventory(),
    rebuildHeldItem: () => rebuildHeldItem(),
  },
);
const itemPickups = new ItemPickupSystem(scene, (item, amount) => inventorySystem.addItem(item, amount));
const chestSystem = new ChestSystem(
  inventorySystem,
  { chestOverlayEl, chestGridEl, chestInventoryEl },
  {
    save: () => worldStore.saveChests(chestSystem.snapshot()).catch(console.error),
    spawnDrop: (slot, pos) =>
      itemPickups.spawn(slot.item, slot.count, new THREE.Vector3(pos.x + 0.5, pos.y + 0.65, pos.z + 0.5)),
    getBlock,
  },
);
const furnaceSystem = new FurnaceSystem(
  inventorySystem,
  {
    furnaceOverlayEl,
    furnaceInputEl,
    furnaceFuelEl,
    furnaceOutputEl,
    furnaceInventoryEl,
    furnaceBurnFillEl,
    furnaceProgressFillEl,
    furnaceStatusEl,
  },
  {
    save: () => saveFurnaces(),
    spawnDrop: (s, p) => itemPickups.spawn(s.item, s.count, new THREE.Vector3(p.x + 0.5, p.y + 0.75, p.z + 0.5)),
    getBlock,
  },
);
const doorSystem = new DoorSystem();
const interactionSystem = new BlockInteractionSystem(
  scene,
  blockRaycaster,
  inventorySystem,
  player,
  getBlock,
  setBlock,
  triggerHandSwing,
  (item, count, position) => itemPickups.spawn(item, count, position),
  (wx, y, wz, block) => {
    if (block === Block.Furnace) furnaceSystem.removeAt({ x: wx, y, z: wz });
    if (block === Block.Chest) chestSystem.removeAt({ x: wx, y, z: wz });
  },
  doorSystem,
  (entries) => chunkWorld.setBlocks(entries),
  terrainAtlas,
);

const consoleCommands: ConsoleCommand[] = defaultConsoleCommands((item, count) => {
  const lower = item.toLowerCase();
  return inventorySystem.addItem(
    (itemDefs.find((d) => d.id === lower)?.id ?? itemDefs.find((d) => d.id.includes(lower))?.id)!, count);
});

const consoleSystem = new ConsoleSystem(consoleCommands);
inventorySystem.init();
rebuildHeldItem();

function rebuildHeldItem(): void {
  heldItemView.rebuild(inventorySystem.selectedEntry());
}

function triggerHandSwing(kind: 'mine' | 'place'): void {
  heldItemView.triggerSwing(kind);
}

function updateHand(now: number): void {
  heldItemView.update(now);
}

function summarizeWorldDiagnostics(): DiagnosticsSummary {
  return chunkWorld.summarizeDiagnostics();
}

function updateTerrainMaterialTime(now: number): void {
  chunkWorld.updateTerrainMaterialTime(now);
}

function updateSeedPreview(): void {
  seedPreviewEl.textContent = String(seedFromString(seedInputEl.value));
}

function startWorld(seedText: string): void {
  const normalizedSeedText = seedText.trim() || '0';
  seed = seedFromString(normalizedSeedText);
  localStorage.setItem('craft-seed', normalizedSeedText);
  worldStarted = true;
  worldReady = false;
  chunkWorld.resetStreaming();
  interactionSystem.stopMining();
  furnaceSystem.close();
  chestSystem.close();
  doorSystem.clear();
  itemPickups.clear();
  void loadFurnaces();

  const spawnX = 8;
  const spawnZ = 8;
  const spawn = findDrySpawn(spawnX, spawnZ, seed, player.height);
  player.position.set(spawn.x, spawn.y, spawn.z);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  submergeFactor = 0;
  caveFactor = 0;
  playerController.syncCamera();

  startScreenEl.classList.add('hidden');
  loadingScreenEl.classList.remove('hidden');
  chunkWorld.updateChunkSet(frame);
}

async function loadInventory(): Promise<void> {
  const saved = await worldStore.loadInventory();
  if (saved) inventorySystem.applyInventory(saved);
}

async function loadHotbar(): Promise<void> {
  const saved = await worldStore.loadHotbar();
  if (saved) inventorySystem.applyHotbar(saved);
}

async function loadFurnaces(): Promise<void> {
  furnaceSystem.load(await worldStore.loadFurnaces());
  chestSystem.load(await worldStore.loadChests());
  doorSystem.load(await worldStore.loadDoors());
}

async function saveInventory(): Promise<void> {
  await Promise.all([worldStore.saveInventory(inventorySystem.snapshotInventory()), worldStore.saveHotbar(inventorySystem.snapshotHotbar())]);
}

async function saveFurnaces(): Promise<void> {
  await worldStore.saveFurnaces(furnaceSystem.snapshot());
  await worldStore.saveDoors(doorSystem.snapshot());
}

function updateLoadingState(): void {
  if (!worldStarted || worldReady) return;
  const { loaded, total, ready } = chunkWorld.loadingProgress();
  loadingStatusEl.textContent = `Loading spawn chunks ${loaded} / ${total}`;
  if (!ready) return;
  chunkWorld.settlePlayerAtLoadedSpawn(() => playerController.syncCamera());
  worldReady = true;
  loadingScreenEl.classList.add('hidden');
}

function getBlock(wx: number, y: number, wz: number): Block {
  return chunkWorld.getBlock(wx, y, wz);
}

function setBlock(wx: number, y: number, wz: number, block: Block): void {
  chunkWorld.setBlock(wx, y, wz, block);
}

function fadeChunks(now: number): void {
  chunkWorld.fadeChunks(now);
}

const health = createHealth(
  () => terrainHeight(Math.floor(player.position.x), Math.floor(player.position.z), seed) + 2,
  (spawnY) => {
    player.position.set(8, spawnY, 8);
    player.velocity.set(0, 0, 0);
  },
);
health.mount(heartsEl, damageOverlayEl);

const eatingSystem = new EatingSystem(health, inventorySystem, eatingBarEl, eatingBarFillEl);

let last = performance.now();
let submergeFactor = 0;
let caveFactor = 0;

function applyRenderDistanceInternal(): void {
  applyRenderDistance(scene, camera, farTerrain, player, seed, submergeFactor, caveFactor);
  const pcx = Math.floor(player.position.x / CHUNK_SIZE);
  const pcz = Math.floor(player.position.z / CHUNK_SIZE);
  farTerrain.rebuild(pcx, pcz, seed, getFarRadius());
}

function tick(now: number): void {
  const frameStartedAt = performance.now();
  const frameMs = now - last;
  diagnostics.pollGpuTimer();
  frame++;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (worldStarted) chunkWorld.updateChunkSet(frame);
  chunkWorld.flushRequests();
  updateLoadingState();
  if (worldReady) {
    playerController.update(dt);
    health.reconcile(player.onGround, player.position.y, now);
    const cf = updateCaveFactor(dt, worldReady, player, getBlock, seed);
    if (!isNaN(cf)) caveFactor += (cf - caveFactor) * Math.min(1, dt * 4);
    if (caveFactor < 0.002) caveFactor = 0;
    submergeFactor = applyUnderwaterEffects(dt, worldReady, scene, player, getBlock, submergeFactor, caveFactor, waterOverlayEl);
    itemPickups.update(dt, now, player.position);
    chestSystem.tick();
    furnaceSystem.tick(dt);
    eatingSystem.tick(now);
  }
  sky.position.copy(camera.position);
  updateTerrainMaterialTime(now);
  updateHand(now);
  if (worldReady) {
    wildlife.update(dt, now);
    interactionSystem.updateHighlight();
    interactionSystem.updateMining(now);
  } else {
    interactionSystem.hide();
  }
  fadeChunks(now);
  statsEl.textContent = `Seed ${seed} / chunks ${chunkWorld.loadedChunkCount}`;
  const renderStartedAt = performance.now();
  diagnostics.beginGpuTimer();
  renderer.render(scene, camera);
  diagnostics.endGpuTimer();
  const frameEndedAt = performance.now();
  diagnostics.recordFrame(
    frameMs,
    renderStartedAt - frameStartedAt,
    frameEndedAt - renderStartedAt,
  );
  diagnostics.updateOverlay(frameEndedAt);
  requestAnimationFrame(tick);
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
  if (!worldStarted && event.code !== 'Tab') return;
  if (event.code === 'KeyE') {
    event.preventDefault();
    eatingSystem.cancel();
    if (furnaceSystem.isOpen) { furnaceSystem.close(); return; }
    if (chestSystem.isOpen) { chestSystem.close(); return; }
    const inventoryOpen = inventorySystem.toggleOpen();
    interactionSystem.stopMining();
    if (inventoryOpen && document.pointerLockElement === renderer.domElement)
      document.exitPointerLock();
    return;
  }
  if (event.code === 'Escape') {
    if (consoleSystem.isOpen) { consoleSystem.toggle(); return; }
    if (furnaceSystem.isOpen) { furnaceSystem.close(); return; }
    if (chestSystem.isOpen) { chestSystem.close(); return; }
    if (inventorySystem.isOpen) { inventorySystem.setOpen(false); return; }
  }
  if (furnaceSystem.isOpen && event.code !== 'Tab') return;
  keys.add(event.code);
  const slot = Number(event.key) - 1;
  if (slot >= 0 && slot < inventorySystem.hotbarSize) {
    eatingSystem.cancel();
    inventorySystem.selectHotbarSlot(slot);
  }
});

document.addEventListener('keyup', (event) => keys.delete(event.code));

renderer.domElement.addEventListener('click', () => {
  if (!worldReady || inventorySystem.isOpen) return;
  if (!mouse.locked) {
    renderer.domElement.requestPointerLock().catch(() => {
      mouse.locked = false;
    });
  }
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === renderer.domElement;
  panelEl.classList.toggle('minimized', mouse.locked);
});

document.addEventListener('mousemove', (event) => {
  if (!worldReady || !mouse.locked) return;
  const sensitivity = BASE_MOUSE_RADIANS_PER_PIXEL * mouseSensitivity;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  player.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, player.pitch));
});

document.addEventListener('mousedown', (event) => {
  if (!worldReady || !mouse.locked || inventorySystem.isOpen || furnaceSystem.isOpen || chestSystem.isOpen) return;
  const hit = blockRaycaster.raycast();
  if (event.button === 0) {
    const animalHit = wildlife.raycast(camera);
    if (animalHit && (!hit || animalHit.distance < hit.distance)) {
      interactionSystem.stopMining();
      wildlife.hit(animalHit.animal, performance.now());
      triggerHandSwing('mine');
      return;
    }
    if (hit) interactionSystem.startMining(hit);
  } else if (event.button === 2) {
    const slot = inventorySystem.slotAt(inventorySystem.selectedHotbarIndex);
    if (slot && foodValueFor(slot.item) > 0) {
      eatingSystem.tryStart();
      return;
    }
    if (!hit) return;
    const b = getBlock(hit.block.x, hit.block.y, hit.block.z);
    // Door toggle
    if (b === Block.OakDoor || b === Block.OakDoorOpen) {
      doorSystem.toggle(hit.block.x, hit.block.y, hit.block.z, getBlock, (entries) => chunkWorld.setBlocks(entries));
      return;
    }
    if (b === Block.Furnace || b === Block.Chest) {
      inventorySystem.setOpen(false);
      interactionSystem.stopMining();
      const p = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
      (b === Block.Furnace ? furnaceSystem : chestSystem).openAt(p);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      return;
    }
    interactionSystem.place(hit);
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 0) interactionSystem.stopMining();
  if (event.button === 2) eatingSystem.cancel();
});

window.addEventListener('blur', () => interactionSystem.stopMining());

document.addEventListener('contextmenu', (event) => event.preventDefault());

startFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  startWorld(seedInputEl.value);
});

seedInputEl.addEventListener('input', updateSeedPreview);

clearWorldEl.addEventListener('click', () => {
  clearSavedWorld().catch((error) => {
    console.error(error);
    clearWorldStatusEl.textContent = 'Clear failed. Check console.';
    clearWorldEl.disabled = false;
  });
});

sensitivityInputEl.addEventListener('input', () => {
  mouseSensitivity = clampMouseSensitivity(Number(sensitivityInputEl.value));
  sensitivityValueEl.textContent = formatMouseSensitivity(mouseSensitivity);
  saveMouseSensitivity(mouseSensitivity);
});

renderDistanceInputEl.addEventListener('input', () => {
  const value = clampDetailRadius(Number(renderDistanceInputEl.value));
  renderDistanceValueEl.textContent = formatRenderDistance(value);
  setDetailRadius(value);
  applyRenderDistanceInternal();
});

randomSeedEl.addEventListener('click', () => {
  seedInputEl.value = randomSeedText();
  updateSeedPreview();
});

hudRoot.querySelectorAll<HTMLButtonElement>('[data-seed-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    seedInputEl.value = button.dataset.seedPreset ?? '';
    updateSeedPreview();
  });
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadInventory().catch(console.error);
loadHotbar().catch(console.error);
loadFurnaces().catch(console.error);
updateSeedPreview();
requestAnimationFrame(tick);

async function clearSavedWorld(): Promise<void> {
  clearWorldEl.disabled = true;
  clearWorldStatusEl.textContent = 'Clearing saves...';
  const normalizedSeedText = seedInputEl.value.trim() || '0';
  seed = seedFromString(normalizedSeedText);
  seedPreviewEl.textContent = String(seed);
  await worldStore.clearCurrentWorld();
  chunkWorld.clearLoadedChunks();
  itemPickups.clear();
  interactionSystem.stopMining();
  inventorySystem.resetInventory();
  furnaceSystem.load(null);
  chestSystem.load(null);
  doorSystem.clear();
  worldReady = false;
  if (worldStarted) {
    startWorld(normalizedSeedText);
  }
  clearWorldStatusEl.textContent = 'Saved chunks and inventory cleared.';
  clearWorldEl.disabled = false;
}
