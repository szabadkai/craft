import './style.css';
import * as THREE from 'three';
import { ChestSystem } from './inventory/chestSystem';
import { FurnaceSystem } from './inventory/furnaceSystem';
import { InventorySystem } from './inventory/inventorySystem';
import { ConsoleSystem } from './ui/console';
import { PlayerController } from './player/playerController';
import { DoorSystem } from './world/doorSystem';
import { EatingSystem } from './player/eating';
import {
  formatMouseSensitivity,
  loadMouseSensitivity,
} from './player/mouseSensitivity';
import {
  formatRenderDistance,
  getDetailRadius,
  getFarRadius,
  getFogFar,
  getFogNear,
} from './player/renderDistance';
import { WorldStore } from './persistence/worldStore';
import { terrainHeight, OCEAN_SURFACE_Y } from './terrain';
import { DiagnosticsSystem, DiagnosticsSummary } from './rendering/diagnostics';
import { FarTerrainSystem } from './rendering/farTerrain';
import { HeldItemView } from './rendering/heldItemView';
import { createSky, createTerrainAtlas, createTerrainMaterial, createWaterMaterial } from './rendering/terrainMaterials';
import { DayNightCycle } from './rendering/dayNightCycle';
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
import { WaterSimSystem } from './world/waterSim';
import { ItemPickupSystem } from './world/itemPickups';
import { randomSeedText, seedFromString } from './world/seed';
import { WildlifeSystem } from './world/wildlife';
import { HostileSystem } from './world/hostileMobs';
import { createHud } from './ui/hud';
import { findDrySpawn } from './game/helpers';
import { createAudioEngine } from './audio/audioEngine';
import { createSfxSystem, blockMaterial } from './audio/sfx';
import { createMusicSystem } from './audio/music';
import { createAmbientSystem } from './audio/ambient';
import { loadSandboxMode } from './player/sandboxMode';
import { setupInputHandlers } from './game/inputHandler';
import { MinimapSystem } from './ui/minimap';
import { isTouchDevice } from './ui/touchControls';
import { loadTouchControlSettings, saveTouchControlSettings } from './ui/touchSettings';
import { setupDeathHandling } from './game/deathHandling';
import { createConsoleCommands } from './game/consoleCommands';
import { setupStartScreenHandlers } from './game/startScreenHandlers';
import { setupTouchControls } from './game/touchSetup';
import { createFrameAudio } from './game/frameAudio';
import { dropHostileLoot } from './game/hostileDrops';
import { setupPauseMenu } from './game/pauseMenuSetup';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

const savedSeedText = localStorage.getItem('craft-seed');
const defaultSeedText = savedSeedText ? savedSeedText : randomSeedText();
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

const isMobile = isTouchDevice();
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xf8fbff, 0x8f9568, 2.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfaa, 1.75);
sun.position.set(120, 82, 44);
scene.add(sun);
const sky = createSky();
scene.add(sky);
const terrainAtlas = createTerrainAtlas();
const chunkMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 1);
const fadeMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 0.72);
const waterMaterial = createWaterMaterial(scene.fog, OCEAN_SURFACE_Y);
const transparentMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 0.999);
transparentMaterial.depthWrite = true; // glass and leaves occlude geometry behind them
const decoMaterial = createTerrainMaterial(terrainAtlas, scene.fog, 0.999);
const dayNight = new DayNightCycle();

const audioEngine = createAudioEngine();
const sfx = createSfxSystem(audioEngine.ctx, audioEngine.sfxGain);
const music = createMusicSystem(audioEngine.ctx, audioEngine.musicGain);
const ambient = createAmbientSystem(audioEngine.ctx, audioEngine.ambientGain);

const hostile: HostileSystem = new HostileSystem(
  scene,
  () => seed,
  getBlock,
  (position, kind) => dropHostileLoot(itemPickups, position, kind),
  () => dayNight.timeOfDay,
  () => sfx.mobHit(),
  () => sfx.mobDeath(),
  (wx, y, wz) => chunkWorld.getSkylight(wx, y, wz),
  (wx, y, wz) => chunkWorld.getBlocklight(wx, y, wz),
);
hostile.setPlayerDamageCallback((amount) => health.damageFrom(amount, 'mob'));
const wildlife: WildlifeSystem = new WildlifeSystem(
  scene,
  () => seed,
  getBlock,
  (position, kind) => {
    const count = kind === 'deer' || kind === 'boar' ? 1 + Math.floor(Math.random() * 2) : 1;
    itemPickups.spawn('raw_meat', count, position);
  },
  () => sfx.mobHit(),
  () => sfx.mobDeath(),
);
const worldStore = new WorldStore(() => seed);

let frame = 0;
let worldStarted = false;
let worldReady = false;
let waterBudgetSaveTimer: number | null = null;

const farTerrain = new FarTerrainSystem(scene, waterMaterial);
const blockRaycaster = new BlockRaycaster(camera, getBlock);

const player = {
  position: new THREE.Vector3(8, 82, 8),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  onGround: false,
  inWater: false,
  waterDepth: 0,
  width: 0.64,
  height: 1.8,
  eye: 1.62,
};

const keys = new Set<string>();
const mouse = { locked: false };
let mouseSensitivity = loadMouseSensitivity();
let touchControlSettings = loadTouchControlSettings();
let gamePaused = false;
const playerController = new PlayerController(
  player,
  camera,
  keys,
  getBlock,
  () => gamePaused,
);
const heldItemView = new HeldItemView(camera);
const hud = createHud(
  defaultSeedText,
  formatMouseSensitivity(mouseSensitivity),
  formatRenderDistance(getDetailRadius()),
);
const {
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
  continueWorldEl,
  clearWorldEl,
  clearWorldStatusEl,
  sensitivityInputEl,
  sensitivityValueEl,
  waterOverlayEl,
  damageOverlayEl,
  heartsEl,
  deathScreenEl,
  deathMessageEl,
  respawnBtnEl,
} = hud;
sensitivityInputEl.value = String(mouseSensitivity);
const { renderDistanceInputEl, renderDistanceValueEl } = hud;
renderDistanceInputEl.value = String(getDetailRadius());
const { sfxVolumeInputEl, sfxVolumeValueEl, musicVolumeInputEl, musicVolumeValueEl } = hud;
const savedSfxVol = localStorage.getItem('craft-audio-sfx-vol');
const savedMusicVol = localStorage.getItem('craft-audio-music-vol');
sfxVolumeInputEl.value = String(Math.round((savedSfxVol ? parseFloat(savedSfxVol) : 1) * 100));
sfxVolumeValueEl.textContent = `${sfxVolumeInputEl.value}%`;
musicVolumeInputEl.value = String(Math.round((savedMusicVol ? parseFloat(savedMusicVol) : 0.5) * 100));
musicVolumeValueEl.textContent = `${musicVolumeInputEl.value}%`;
const { sandboxInputEl } = hud;
let sandboxMode = loadSandboxMode();
sandboxInputEl.checked = sandboxMode;
const diagnostics = new DiagnosticsSystem(renderer, diagnosticsEl, summarizeWorldDiagnostics);
const chunkWorld = new ChunkWorldSystem({
  scene,
  chunkMaterial,
  fadeMaterial,
  waterMaterial,
  transparentMaterial,
  decoMaterial,
  worldStore,
  farTerrain,
  wildlife,
  player,
  getSeed: () => seed,
  onChunkMessage: () => diagnostics.incrementChunkMessages(),
  onChunkLoaded: (cx, cz, blocks) => {
    const CS = 16, WH = 128;
    for (let y = 0; y < WH; y++) {
      for (let z = 0; z < CS; z++) {
        for (let x = 0; x < CS; x++) {
          if (blocks[x + CS * (z + CS * y)] !== 34) continue;
          chestSystem.seedDungeonChest({ x: cx * CS + x, y, z: cz * CS + z }, seed);
        }
      }
    }
  },
});
const waterSim = new WaterSimSystem(
  (wx, y, wz) => chunkWorld.getBlock(wx, y, wz),
  (entries) => chunkWorld.setBlocks(entries),
  () => scheduleWaterBudgetSave(),
);

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
const itemPickups = new ItemPickupSystem(scene, (item, amount) => inventorySystem.addItem(item, amount), getBlock, () => sfx.itemPickup());
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
    sfx.blockBreak(blockMaterial(block));
  },
  doorSystem,
  (entries) => chunkWorld.setBlocks(entries),
  waterSim,
  terrainAtlas,
);

const minimap = new MinimapSystem();

const consoleSystem = new ConsoleSystem(createConsoleCommands(inventorySystem, minimap, player));
inventorySystem.init();
rebuildHeldItem();

const pauseMenu = setupPauseMenu({
  renderer,
  isMobile,
  getWorldReady: () => worldReady,
  getMouseSensitivity: () => mouseSensitivity,
  setMouseSensitivity: (value) => { mouseSensitivity = value; },
  getSandboxMode: () => sandboxMode,
  setSandboxMode: (value) => { sandboxMode = value; },
  getTouchControlSettings: () => touchControlSettings,
  setTouchControlSettings: (settings) => { touchControlSettings = settings; },
  onTouchControlSettingsChange: (settings) => {
    touchControls?.applySettings(settings);
    saveTouchControlSettings(settings);
  },
  sensitivityInputEl,
  sensitivityValueEl,
  renderDistanceInputEl,
  renderDistanceValueEl,
  sfxVolumeInputEl,
  sfxVolumeValueEl,
  musicVolumeInputEl,
  musicVolumeValueEl,
  sandboxInputEl,
  savedSfxVol,
  savedMusicVol,
  audioEngine,
  applyRenderDistance: applyRenderDistanceInternal,
});


function rebuildHeldItem(): void {
  heldItemView.rebuild(inventorySystem.selectedEntry());
}

function triggerHandSwing(kind: 'mine' | 'place'): void {
  heldItemView.triggerSwing(kind);
  if (kind === 'mine') {
    const hit = blockRaycaster.raycast();
    if (hit) {
      const b = getBlock(hit.block.x, hit.block.y, hit.block.z);
      sfx.miningTick(blockMaterial(b));
    }
  }
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

function startWorld(seedText: string): void {
  audioEngine.resume();
  music.play();
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
  waterSim.clear();
  itemPickups.clear();
  hostile.clear();
  minimap.setSeed(seed);
  inventorySystem.resetInventory();
  void loadInventory();
  void loadHotbar();
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
  waterSim.load(await worldStore.loadWaterBudgets());
}

async function saveInventory(): Promise<void> {
  await Promise.all([worldStore.saveInventory(inventorySystem.snapshotInventory()), worldStore.saveHotbar(inventorySystem.snapshotHotbar())]);
}

async function saveFurnaces(): Promise<void> {
  await worldStore.saveFurnaces(furnaceSystem.snapshot());
  await worldStore.saveDoors(doorSystem.snapshot());
}

function scheduleWaterBudgetSave(): void {
  if (waterBudgetSaveTimer !== null) window.clearTimeout(waterBudgetSaveTimer);
  waterBudgetSaveTimer = window.setTimeout(() => {
    waterBudgetSaveTimer = null;
    worldStore.saveWaterBudgets(waterSim.snapshot()).catch(console.error);
  }, 500);
}

function updateLoadingState(): void {
  if (!worldStarted || worldReady) return;
  const { loaded, total, ready } = chunkWorld.loadingProgress();
  loadingStatusEl.textContent = `Loading spawn chunks ${loaded} / ${total}`;
  if (!ready) return;
  chunkWorld.settlePlayerAtLoadedSpawn(() => playerController.syncCamera());
  worldReady = true;
  loadingScreenEl.classList.add('hidden');
  minimap.show();
  if (isMobile) {
    mouse.locked = true;
    touchControls?.show();
    pauseMenu.showButton();
  }
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

const health = setupDeathHandling({
  player,
  renderer,
  inventorySystem,
  itemPickups,
  sfx,
  heartsEl,
  damageOverlayEl,
  deathScreenEl,
  deathMessageEl,
  respawnBtnEl,
  getSpawnY: () => terrainHeight(Math.floor(player.position.x), Math.floor(player.position.z), seed) + 2,
  saveInventory,
});

const eatingSystem = new EatingSystem(health, inventorySystem, eatingBarEl, eatingBarFillEl, () => sfx.eating(), () => sfx.eatComplete());

let last = performance.now();
let submergeFactor = 0;
let caveFactor = 0;
let lastLavaDamageTime = 0;
const updateFrameAudio = createFrameAudio({ player, sfx, getBlock });

function applyRenderDistanceInternal(): void {
  applyRenderDistance(scene, camera, farTerrain, player, seed, submergeFactor, caveFactor);
}

const inputState = {
  keys,
  mouse,
  get mouseSensitivity() { return mouseSensitivity; },
  set mouseSensitivity(v: number) { mouseSensitivity = v; },
  get sandboxMode() { return sandboxMode; },
  set sandboxMode(v: boolean) { sandboxMode = v; },
  get worldStarted() { return worldStarted; },
  get worldReady() { return worldReady; },
  isMobile,
};

const { handlePrimaryAction, handleSecondaryAction } = setupInputHandlers(
  inputState,
  {
    renderer, player, camera, inventorySystem, furnaceSystem, chestSystem,
    interactionSystem, blockRaycaster, wildlife, hostile, doorSystem,
    chunkWorld, eatingSystem, consoleSystem, diagnostics, pauseMenu,
    audioEngine, sfx, health, getBlock, triggerHandSwing,
    dropItem: (item, count) => itemPickups.spawn(item, count, player.position.clone()),
  },
  {
    sensitivityInputEl, sensitivityValueEl,
    renderDistanceInputEl, renderDistanceValueEl,
    sfxVolumeInputEl, sfxVolumeValueEl,
    musicVolumeInputEl, musicVolumeValueEl,
    sandboxInputEl, inventoryOverlayEl, furnaceOverlayEl, chestOverlayEl,
  },
  applyRenderDistanceInternal,
);

const touchControls = setupTouchControls({
  isMobile,
  keys,
  player,
  getMouseSensitivity: () => mouseSensitivity,
  getWorldReady: () => worldReady,
  inventorySystem,
  furnaceSystem,
  chestSystem,
  interactionSystem,
  eatingSystem,
  handlePrimaryAction,
  handleSecondaryAction,
  audioResume: () => audioEngine.resume(),
});
touchControls?.applySettings(touchControlSettings);

function tick(now: number): void {
  const frameStartedAt = performance.now();
  const frameMs = now - last;
  diagnostics.pollGpuTimer();
  frame++;
  gamePaused = inventorySystem.isOpen || pauseMenu.isOpen || furnaceSystem.isOpen || chestSystem.isOpen;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (worldStarted) chunkWorld.updateChunkSet(frame);
  chunkWorld.flushRequests();
  farTerrain.update();
  updateLoadingState();
  if (worldReady && !health.state.isDead) {
    playerController.update(dt);
    health.reconcile(player.onGround, player.position.y, now, player.inWater);
    // Lava damage: check if feet or body are in lava
    const feetBlock = getBlock(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z));
    const bodyBlock = getBlock(Math.floor(player.position.x), Math.floor(player.position.y + 1), Math.floor(player.position.z));
    if (feetBlock === Block.Lava || bodyBlock === Block.Lava) {
      if (now - lastLavaDamageTime > 500) {
        health.damageFrom(4, 'lava');
        lastLavaDamageTime = now;
      }
    }
    const cf = updateCaveFactor(dt, worldReady, player, getBlock, seed);
    if (!isNaN(cf)) caveFactor += (cf - caveFactor) * Math.min(1, dt * 4);
    if (caveFactor < 0.002) caveFactor = 0;
    submergeFactor = applyUnderwaterEffects(dt, worldReady, scene, player, getBlock, submergeFactor, caveFactor, waterOverlayEl, dayNight.fogColor(), dayNight.backgroundColor());
    itemPickups.update(dt, now, player.position);
    waterSim.tick(now);
    chestSystem.tick();
    furnaceSystem.tick(dt);
    eatingSystem.tick(now);

    updateFrameAudio(now);
    ambient.tick(dt, submergeFactor, caveFactor, furnaceSystem.isOpen && furnaceSystem.isBurning);
    music.tick(dt);
  }
  sky.position.copy(camera.position);
  dayNight.update(dt); dayNight.applyToLights(hemi, sun, sky.material as THREE.ShaderMaterial); dayNight.applyToTerrainMaterials(chunkMaterial, fadeMaterial, waterMaterial, transparentMaterial, decoMaterial); dayNight.applyToScene(scene);
  updateTerrainMaterialTime(now);
  updateHand(now);
  if (worldReady) {
    wildlife.update(dt, now);
    if (!sandboxMode) {
      hostile.update(dt, now, player.position);
      hostile.spawnNear(player.position, now);
    }
    interactionSystem.updateHighlight();
    interactionSystem.updateMining(now);
  } else {
    interactionSystem.hide();
  }
  fadeChunks(now);
  if (worldReady) minimap.update(player.position.x, player.position.z, player.yaw);
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

setupStartScreenHandlers({
  elements: {
    seedInputEl,
    startFormEl,
    randomSeedEl,
    seedPreviewEl,
    continueWorldEl,
    clearWorldEl,
    clearWorldStatusEl,
  },
  worldStore,
  chunkWorld,
  itemPickups,
  interactionSystem,
  inventorySystem,
  furnaceSystem,
  chestSystem,
  doorSystem,
  waterSim,
  hostile,
  getWorldStarted: () => worldStarted,
  setWorldReady: (ready) => {
    worldReady = ready;
  },
  setSeed: (nextSeed) => {
    seed = nextSeed;
  },
  startWorld,
});
requestAnimationFrame(tick);
