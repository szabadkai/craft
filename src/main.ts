import './style.css';
import * as THREE from 'three';
import { isSolid } from './blocks';
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
import { createSky, createTerrainAtlas, createTerrainMaterial } from './rendering/terrainMaterials';
import {
  Block,
  blockIndex,
  CHUNK_SIZE,
  chunkKey,
  ChunkKey,
  ChunkMeshPayload,
  DETAIL_RADIUS,
  divFloor,
  FAR_RADIUS,
  mod,
  PRELOAD_RADIUS,
  WorkerIn,
  WorkerOut,
  WORLD_HEIGHT,
} from './types';
import { BlockInteractionSystem } from './world/blockInteractionSystem';
import { BlockRaycaster } from './world/blockRaycaster';
import { ItemPickupSystem } from './world/itemPickups';
import { randomSeedText, seedFromString } from './world/seed';
import { WildlifeSystem } from './world/wildlife';
import { createHud } from './ui/hud';

type LoadedChunk = {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  mesh: THREE.Mesh;
  lastSeen: number;
  solidVoxels: number;
};

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
renderer.toneMappingExposure = 1.38;
app.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xa1a76f, 2.45));
const sun = new THREE.DirectionalLight(0xffe2b2, 2.15);
sun.position.set(120, 82, 44);
scene.add(sun);
const sky = createSky();
scene.add(sky);

const terrainAtlas = createTerrainAtlas();
const chunkMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 1);
const fadeMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 0.72);

const chunks = new Map<ChunkKey, LoadedChunk>();
const wildlife = new WildlifeSystem(scene, () => seed, getBlock);
const requested = new Set<ChunkKey>();
const dirty = new Set<ChunkKey>();
const chunkSaveTimers = new Map<ChunkKey, number>();
const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
const workers = Array.from(
  { length: workerCount },
  () => new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' }),
);
const pendingQueue: Array<{ cx: number; cz: number; blocks?: Uint16Array }> = [];
const maxRequestsPerFrame = workerCount;
let nextWorkerIndex = 0;
const worldStore = new WorldStore(() => seed);

let playerChunkX = Number.NaN;
let playerChunkZ = Number.NaN;
let frame = 0;
let worldStarted = false;
let worldReady = false;
const initialReadyRadius = 1;

const farTerrain = new FarTerrainSystem(scene);
const blockRaycaster = new BlockRaycaster(camera, getBlock);

const player = {
  position: new THREE.Vector3(8, 82, 8),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: false,
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
  sensitivityInputEl,
  sensitivityValueEl,
} = hud;
sensitivityInputEl.value = String(mouseSensitivity);
const diagnostics = new DiagnosticsSystem(renderer, diagnosticsEl, summarizeWorldDiagnostics);
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
  let visibleChunks = 0;
  let chunkVertices = 0;
  let chunkIndices = 0;
  let chunkBytes = 0;
  let visibleSolidVoxels = 0;

  for (const chunk of chunks.values()) {
    if (!chunk.mesh.visible) continue;
    visibleChunks++;
    const geometry = chunk.mesh.geometry;
    const position = geometry.getAttribute('position');
    if (position) chunkVertices += position.count;
    if (geometry.index) chunkIndices += geometry.index.count;
    for (const attribute of Object.values(geometry.attributes)) {
      const array = attribute.array as ArrayBufferView;
      chunkBytes += array.byteLength;
    }
    if (geometry.index) chunkBytes += (geometry.index.array as ArrayBufferView).byteLength;
    visibleSolidVoxels += chunk.solidVoxels;
  }

  return {
    loadedChunks: chunks.size,
    visibleChunks,
    chunkVertices,
    chunkIndices,
    chunkBytes,
    visibleVoxelCapacity: visibleChunks * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT,
    visibleSolidVoxels,
    workerCount,
    pendingRequests: pendingQueue.length,
    requestedChunks: requested.size,
    dirtyRemeshes: dirty.size,
  };
}

function countSolidVoxels(blocks: Uint16Array): number {
  let count = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (isSolid(blocks[i] as Block)) count++;
  }
  return count;
}

function updateTerrainMaterialTime(now: number): void {
  const seconds = now * 0.001;
  chunkMaterial.uniforms.time.value = seconds;
  fadeMaterial.uniforms.time.value = seconds;
  for (const chunk of chunks.values()) {
    const material = chunk.mesh.material;
    if (material instanceof THREE.ShaderMaterial) material.uniforms.time.value = seconds;
  }
}

for (const chunkWorker of workers) {
  chunkWorker.onmessage = handleWorkerMessage;
}

function handleWorkerMessage(event: MessageEvent<WorkerOut>): void {
  if (event.data.type === 'error') {
    console.error(event.data.message);
    return;
  }
  diagnostics.incrementChunkMessages();
  receiveChunk(event.data.payload);
}

function postChunkJob(message: WorkerIn, transfer: Transferable[] = []): void {
  const chunkWorker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  chunkWorker.postMessage(message, transfer);
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
  playerChunkX = Number.NaN;
  playerChunkZ = Number.NaN;
  pendingQueue.length = 0;
  requested.clear();
  dirty.clear();
  interactionSystem.stopMining();
  itemPickups.clear();

  const spawnX = 8;
  const spawnZ = 8;
  const spawn = findDrySpawn(spawnX, spawnZ);
  player.position.set(spawn.x, spawn.y, spawn.z);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  playerController.syncCamera();

  startScreenEl.classList.add('hidden');
  loadingScreenEl.classList.remove('hidden');
  updateChunkSet();
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

function receiveChunk(payload: ChunkMeshPayload): void {
  requested.delete(payload.key);

  const old = chunks.get(payload.key);
  const isRemesh = Boolean(old);
  if (old) {
    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
  }
  dirty.delete(payload.key);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(payload.colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(payload.uvs, 2));
  geometry.setAttribute('atlasRect', new THREE.BufferAttribute(payload.atlas, 4));
  geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, isRemesh ? chunkMaterial : fadeMaterial.clone());
  mesh.frustumCulled = true;
  mesh.userData.birth = performance.now();
  scene.add(mesh);
  chunks.set(payload.key, {
    cx: payload.cx,
    cz: payload.cz,
    blocks: payload.blocks,
    mesh,
    lastSeen: frame,
    solidVoxels: countSolidVoxels(payload.blocks),
  });
  wildlife.spawnForChunk(payload.cx, payload.cz);
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

function scheduleChunkSave(key: ChunkKey): void {
  const chunk = chunks.get(key);
  if (!chunk) return;
  const existing = chunkSaveTimers.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    chunkSaveTimers.delete(key);
    const latest = chunks.get(key);
    if (latest) worldStore.saveChunk(key, latest.blocks).catch(console.error);
  }, 250);
  chunkSaveTimers.set(key, timer);
}

function requestChunk(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  if (chunks.has(key) || requested.has(key)) return;
  requested.add(key);
  worldStore
    .loadSavedChunk(key)
    .then((blocks) => {
      if (!requested.has(key) || chunks.has(key)) return;
      pendingQueue.push(blocks ? { cx, cz, blocks } : { cx, cz });
    })
    .catch(() => {
      if (!requested.has(key) || chunks.has(key)) return;
      pendingQueue.push({ cx, cz });
    });
}

function flushRequests(): void {
  pendingQueue.sort((a, b) => distSqToPlayer(a.cx, a.cz) - distSqToPlayer(b.cx, b.cz));
  for (let i = 0; i < maxRequestsPerFrame && pendingQueue.length > 0; i++) {
    const request = pendingQueue.shift()!;
    if (request.blocks) {
      postChunkJob(
        { type: 'remesh', cx: request.cx, cz: request.cz, seed, blocks: request.blocks },
        [request.blocks.buffer],
      );
    } else {
      postChunkJob({ type: 'generate', cx: request.cx, cz: request.cz, seed });
    }
  }
}

function distSqToPlayer(cx: number, cz: number): number {
  const pcx = divFloor(player.position.x, CHUNK_SIZE);
  const pcz = divFloor(player.position.z, CHUNK_SIZE);
  return (cx - pcx) ** 2 + (cz - pcz) ** 2;
}

function updateChunkSet(): void {
  if (!worldStarted) return;
  const pcx = divFloor(player.position.x, CHUNK_SIZE);
  const pcz = divFloor(player.position.z, CHUNK_SIZE);
  if (pcx !== playerChunkX || pcz !== playerChunkZ) {
    playerChunkX = pcx;
    playerChunkZ = pcz;
    farTerrain.rebuild(pcx, pcz, seed);
  }

  for (let dz = -PRELOAD_RADIUS; dz <= PRELOAD_RADIUS; dz++) {
    for (let dx = -PRELOAD_RADIUS; dx <= PRELOAD_RADIUS; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= PRELOAD_RADIUS) requestChunk(pcx + dx, pcz + dz);
    }
  }

  for (const [key, chunk] of chunks) {
    const d = Math.hypot(chunk.cx - pcx, chunk.cz - pcz);
    chunk.mesh.visible = d <= DETAIL_RADIUS + 1;
    if (chunk.mesh.visible) chunk.lastSeen = frame;
    if (d > PRELOAD_RADIUS + 3 && frame - chunk.lastSeen > 90) {
      scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunks.delete(key);
      wildlife.removeForChunk(key);
    }
  }
}

function initialChunksReady(): boolean {
  const pcx = divFloor(player.position.x, CHUNK_SIZE);
  const pcz = divFloor(player.position.z, CHUNK_SIZE);
  for (let dz = -initialReadyRadius; dz <= initialReadyRadius; dz++) {
    for (let dx = -initialReadyRadius; dx <= initialReadyRadius; dx++) {
      if (!chunks.has(chunkKey(pcx + dx, pcz + dz))) return false;
    }
  }
  return true;
}

function updateLoadingState(): void {
  if (!worldStarted || worldReady) return;
  const pcx = divFloor(player.position.x, CHUNK_SIZE);
  const pcz = divFloor(player.position.z, CHUNK_SIZE);
  let loaded = 0;
  const total = (initialReadyRadius * 2 + 1) ** 2;
  for (let dz = -initialReadyRadius; dz <= initialReadyRadius; dz++) {
    for (let dx = -initialReadyRadius; dx <= initialReadyRadius; dx++) {
      if (chunks.has(chunkKey(pcx + dx, pcz + dz))) loaded++;
    }
  }
  loadingStatusEl.textContent = `Loading spawn chunks ${loaded} / ${total}`;
  if (!initialChunksReady()) return;
  settlePlayerAtLoadedSpawn();
  worldReady = true;
  loadingScreenEl.classList.add('hidden');
}

function settlePlayerAtLoadedSpawn(): void {
  const x = Math.floor(player.position.x);
  const z = Math.floor(player.position.z);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (!isSolid(getBlock(x, y, z))) continue;
    player.position.y = Math.min(WORLD_HEIGHT - player.height - 1, y + 1.02);
    player.velocity.set(0, 0, 0);
    player.onGround = false;
    playerController.syncCamera();
    return;
  }
}

function getBlock(wx: number, y: number, wz: number): Block {
  if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
  const cx = divFloor(wx, CHUNK_SIZE);
  const cz = divFloor(wz, CHUNK_SIZE);
  const chunk = chunks.get(chunkKey(cx, cz));
  if (!chunk) return Block.Air;
  return chunk.blocks[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))] as Block;
}

function setBlock(wx: number, y: number, wz: number, block: Block): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const cx = divFloor(wx, CHUNK_SIZE);
  const cz = divFloor(wz, CHUNK_SIZE);
  const key = chunkKey(cx, cz);
  const chunk = chunks.get(key);
  if (!chunk) return;
  chunk.blocks[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))] = block;
  scheduleChunkSave(key);
  remesh(cx, cz);
  if (mod(wx, CHUNK_SIZE) === 0) remesh(cx - 1, cz);
  if (mod(wx, CHUNK_SIZE) === CHUNK_SIZE - 1) remesh(cx + 1, cz);
  if (mod(wz, CHUNK_SIZE) === 0) remesh(cx, cz - 1);
  if (mod(wz, CHUNK_SIZE) === CHUNK_SIZE - 1) remesh(cx, cz + 1);
}

function remesh(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  const chunk = chunks.get(key);
  if (!chunk || dirty.has(key)) return;
  dirty.add(key);
  const copy = new Uint16Array(chunk.blocks);
  postChunkJob({ type: 'remesh', cx, cz, seed, blocks: copy }, [copy.buffer]);
}

function fadeChunks(): void {
  const now = performance.now();
  for (const chunk of chunks.values()) {
    const mat = chunk.mesh.material as THREE.ShaderMaterial;
    if (!mat.transparent) continue;
    const age = Math.min(1, (now - chunk.mesh.userData.birth) / 360);
    mat.uniforms.opacity.value = 0.72 + age * 0.28;
    if (age >= 1) {
      chunk.mesh.material = chunkMaterial;
      mat.dispose();
    }
  }
}

let last = performance.now();
function tick(now: number): void {
  const frameStartedAt = performance.now();
  const frameMs = now - last;
  diagnostics.pollGpuTimer();
  frame++;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateChunkSet();
  flushRequests();
  updateLoadingState();
  if (worldReady) {
    playerController.update(dt);
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
  fadeChunks();
  statsEl.textContent = `Seed ${seed} / chunks ${chunks.size}`;
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
  const numericSlot = event.key === '0' ? 9 : Number(event.key) - 1;
  const extraSlot = event.code === 'Minus' ? 10 : event.code === 'Equal' ? 11 : -1;
  const slot = extraSlot >= 0 ? extraSlot : numericSlot;
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
