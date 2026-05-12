import './style.css';
import * as THREE from 'three';
import { InventorySystem } from './inventory/inventorySystem';
import { PlayerController } from './player/playerController';
import {
  BASE_MOUSE_RADIANS_PER_PIXEL,
  clampMouseSensitivity,
  formatMouseSensitivity,
  loadMouseSensitivity,
  saveMouseSensitivity,
} from './player/mouseSensitivity';
import { WorldStore } from './persistence/worldStore';
import { terrainHeight, WATER_LEVEL } from './terrain';
import { DiagnosticsSystem, DiagnosticsSummary } from './rendering/diagnostics';
import { FarTerrainSystem } from './rendering/farTerrain';
import { HeldItemView } from './rendering/heldItemView';
import { createSky, createTerrainAtlas, createTerrainMaterial, createWaterMaterial } from './rendering/terrainMaterials';
import {
  Block,
  CHUNK_SIZE,
  DETAIL_RADIUS,
  FAR_RADIUS,
  WORLD_HEIGHT,
} from './types';
import { BlockInteractionSystem } from './world/blockInteractionSystem';
import { BlockRaycaster } from './world/blockRaycaster';
import { ChunkWorldSystem } from './world/chunkWorldSystem';
import { ItemPickupSystem } from './world/itemPickups';
import { randomSeedText, seedFromString } from './world/seed';
import { WildlifeSystem } from './world/wildlife';
import { createHud } from './ui/hud';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

const savedSeedText = localStorage.getItem('craft-seed');
const defaultSeedText = savedSeedText && savedSeedText !== '18441' ? savedSeedText : '4';
let seed = seedFromString(defaultSeedText);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8e8f1);
scene.fog = new THREE.Fog(
  0xd8e8f1,
  CHUNK_SIZE * (DETAIL_RADIUS + 1),
  CHUNK_SIZE * (DETAIL_RADIUS + 10),
);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.05,
  CHUNK_SIZE * FAR_RADIUS,
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

const wildlife: WildlifeSystem = new WildlifeSystem(scene, () => seed, getBlock);
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
const hud = createHud(defaultSeedText, formatMouseSensitivity(mouseSensitivity));
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
} = hud;
sensitivityInputEl.value = String(mouseSensitivity);
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
    saveHotbar: () => saveHotbar(),
    rebuildHeldItem: () => rebuildHeldItem(),
  },
);
const itemPickups = new ItemPickupSystem(scene, (item, amount) => inventorySystem.addItem(item, amount));
const interactionSystem = new BlockInteractionSystem(
  scene,
  blockRaycaster,
  inventorySystem,
  player,
  getBlock,
  setBlock,
  triggerHandSwing,
  (item, count, position) => itemPickups.spawn(item, count, position),
);
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
  itemPickups.clear();

  const spawnX = 8;
  const spawnZ = 8;
  const spawn = findDrySpawn(spawnX, spawnZ);
  player.position.set(spawn.x, spawn.y, spawn.z);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  submergeFactor = 0;
  playerController.syncCamera();

  startScreenEl.classList.add('hidden');
  loadingScreenEl.classList.remove('hidden');
  chunkWorld.updateChunkSet(frame);
}

function findDrySpawn(originX: number, originZ: number): { x: number; y: number; z: number } {
  let best = { x: originX, z: originZ, h: terrainHeight(originX, originZ, seed) };
  let bestScore = Number.POSITIVE_INFINITY;
  for (let radius = 0; radius <= 48; radius += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = originX + dx;
        const z = originZ + dz;
        const h = terrainHeight(x, z, seed);
        if (h <= WATER_LEVEL + 1) continue;
        const score = dx * dx + dz * dz + Math.abs(h - WATER_LEVEL - 5) * 6;
        if (score < bestScore) {
          best = { x, z, h };
          bestScore = score;
        }
      }
    }
    if (bestScore < Number.POSITIVE_INFINITY) break;
  }
  return {
    x: best.x + 0.5,
    y: Math.min(WORLD_HEIGHT - player.height - 1, best.h + 1.02),
    z: best.z + 0.5,
  };
}

async function loadInventory(): Promise<void> {
  const saved = await worldStore.loadInventory();
  if (saved) inventorySystem.applyInventory(saved);
}

async function loadHotbar(): Promise<void> {
  const saved = await worldStore.loadHotbar();
  if (saved) inventorySystem.applyHotbar(saved);
}

async function saveInventory(): Promise<void> {
  await worldStore.saveInventory(inventorySystem.snapshotInventory());
}

async function saveHotbar(): Promise<void> {
  await worldStore.saveHotbar(inventorySystem.snapshotHotbar());
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

let last = performance.now();
let submergeFactor = 0;
const airFogColor = new THREE.Color(0xd8e8f1);
const waterFogColor = new THREE.Color(0x061a30);
const airBgColor = new THREE.Color(0xd8e8f1);
const waterBgColor = new THREE.Color(0x061a30);

function applyUnderwaterEffects(dt: number): void {
  if (!worldReady) {
    submergeFactor = 0;
    return;
  }
  const eyeY = player.position.y + player.eye;
  const eyeInWater =
    getBlock(Math.floor(player.position.x), Math.floor(eyeY), Math.floor(player.position.z)) ===
    Block.Water;
  const headInWater =
    getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y + player.height - 0.1),
      Math.floor(player.position.z),
    ) === Block.Water;
  const target = eyeInWater || headInWater ? 1 : 0;
  submergeFactor += (target - submergeFactor) * Math.min(1, dt * 5);
  if (submergeFactor < 0.002) submergeFactor = 0;

  if (submergeFactor > 0.005) {
    // fog
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(airFogColor).lerp(waterFogColor, submergeFactor);
      scene.fog.near = THREE.MathUtils.lerp(144, 4, submergeFactor);
      scene.fog.far = THREE.MathUtils.lerp(304, 16, submergeFactor);
    }
    // background
    scene.background = scene.background ?? new THREE.Color();
    (scene.background as THREE.Color).copy(airBgColor).lerp(waterBgColor, submergeFactor);
    // water overlay
    waterOverlayEl.classList.toggle('submerged', submergeFactor > 0.25);
  } else {
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(airFogColor);
      scene.fog.near = 144;
      scene.fog.far = 304;
    }
    scene.background = new THREE.Color(0xd8e8f1);
    waterOverlayEl.classList.remove('submerged');
  }
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
    applyUnderwaterEffects(dt);
    itemPickups.update(dt, now, player.position);
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
  if (!worldStarted && event.code !== 'Tab') return;
  if (event.code === 'KeyE') {
    event.preventDefault();
    const inventoryOpen = inventorySystem.toggleOpen();
    interactionSystem.stopMining();
    if (inventoryOpen && document.pointerLockElement === renderer.domElement)
      document.exitPointerLock();
    return;
  }
  if (event.code === 'Escape' && inventorySystem.isOpen) {
    inventorySystem.setOpen(false);
    return;
  }
  keys.add(event.code);
  const slot = Number(event.key) - 1;
  if (slot >= 0 && slot < inventorySystem.hotbarSize) inventorySystem.selectHotbarSlot(slot);
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
  if (!worldReady || !mouse.locked || inventorySystem.isOpen) return;
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
    if (hit) interactionSystem.place(hit);
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 0) interactionSystem.stopMining();
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
  worldReady = false;
  if (worldStarted) {
    startWorld(normalizedSeedText);
  }
  clearWorldStatusEl.textContent = 'Saved chunks and inventory cleared.';
  clearWorldEl.disabled = false;
}
