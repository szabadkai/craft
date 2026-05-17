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
import { itemDefs } from './inventory/items';
import { randomSeedText, seedFromString } from './world/seed';
import { WildlifeSystem } from './world/wildlife';
import { HostileSystem } from './world/hostileMobs';
import { createHud } from './ui/hud';
import { findDrySpawn } from './game/helpers';
import { createAudioEngine } from './audio/audioEngine';
import { createSfxSystem, blockMaterial } from './audio/sfx';
import { createMusicSystem } from './audio/music';
import { createAmbientSystem } from './audio/ambient';
import { loadSandboxMode, saveSandboxMode } from './player/sandboxMode';
import { setupInputHandlers } from './game/inputHandler';
import { MinimapSystem } from './ui/minimap';
import { PauseMenu } from './ui/pauseMenu';
import { TouchControls, isTouchDevice } from './ui/touchControls';
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
  (position, kind) => {
    const count = kind === 'zombie' ? 1 + Math.floor(Math.random() * 2) : 1;
    itemPickups.spawn('raw_meat', count, position);
  },
  () => dayNight.timeOfDay,
  () => sfx.mobHit(),
  () => sfx.mobDeath(),
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
  root: hudRoot,
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
});
const waterSim = new WaterSimSystem(
  (wx, y, wz) => chunkWorld.getBlock(wx, y, wz),
  (entries) => chunkWorld.setBlocks(entries),
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

const consoleCommands: ConsoleCommand[] = [
  ...defaultConsoleCommands((item, count) => {
    const lower = item.toLowerCase();
    return inventorySystem.addItem(
      (itemDefs.find((d) => d.id === lower)?.id ?? itemDefs.find((d) => d.id.includes(lower))?.id)!, count);
  }),
  {
    name: 'waypoint',
    description: 'waypoint set <name> | list | remove <name> — Manage map waypoints',
    execute: (args) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'set') {
        const name = args.slice(1).join(' ').trim();
        if (!name) return 'Usage: waypoint set <name>';
        const wp = minimap.addWaypoint(name, player.position.x, player.position.z);
        return `Waypoint "${wp.name}" set at ${wp.x}, ${wp.z}`;
      }
      if (sub === 'list') {
        const wps = minimap.getWaypoints();
        if (wps.length === 0) return 'No waypoints set.';
        return wps.map((w) => `${w.name} (${w.x}, ${w.z})`).join('\n');
      }
      if (sub === 'remove' || sub === 'rm') {
        const name = args.slice(1).join(' ').trim();
        if (!name) return 'Usage: waypoint remove <name>';
        return minimap.removeWaypoint(name) ? `Removed "${name}"` : `Waypoint "${name}" not found`;
      }
      return 'Usage: waypoint set <name> | list | remove <name>';
    },
  },
];

const consoleSystem = new ConsoleSystem(consoleCommands);
inventorySystem.init();
rebuildHeldItem();

const pauseMenu = new PauseMenu(
  {
    onResume: () => {
      if (!isMobile && worldReady) {
        renderer.domElement.requestPointerLock().catch(() => {});
      }
    },
    onSensitivityChange: (value) => {
      mouseSensitivity = clampMouseSensitivity(value);
      const label = formatMouseSensitivity(mouseSensitivity);
      pauseMenu.sensitivityValueEl.textContent = label;
      sensitivityInputEl.value = String(mouseSensitivity);
      sensitivityValueEl.textContent = label;
      saveMouseSensitivity(mouseSensitivity);
    },
    onRenderDistanceChange: (value) => {
      const clamped = clampDetailRadius(value);
      const label = formatRenderDistance(clamped);
      pauseMenu.renderDistanceValueEl.textContent = label;
      renderDistanceInputEl.value = String(clamped);
      renderDistanceValueEl.textContent = label;
      setDetailRadius(clamped);
      applyRenderDistanceInternal();
    },
    onSfxVolumeChange: (value) => {
      audioEngine.setSfxVolume(value / 100);
      pauseMenu.sfxVolumeValueEl.textContent = `${value}%`;
      sfxVolumeInputEl.value = String(value);
      sfxVolumeValueEl.textContent = `${value}%`;
    },
    onMusicVolumeChange: (value) => {
      audioEngine.setMusicVolume(value / 100);
      pauseMenu.musicVolumeValueEl.textContent = `${value}%`;
      musicVolumeInputEl.value = String(value);
      musicVolumeValueEl.textContent = `${value}%`;
    },
    onSandboxChange: (checked) => {
      sandboxMode = checked;
      saveSandboxMode(sandboxMode);
      sandboxInputEl.checked = checked;
    },
  },
  {
    sensitivityLabel: formatMouseSensitivity(mouseSensitivity),
    sensitivityValue: mouseSensitivity,
    renderDistanceLabel: formatRenderDistance(getDetailRadius()),
    renderDistanceValue: getDetailRadius(),
    sfxVolume: Math.round((savedSfxVol ? parseFloat(savedSfxVol) : 1) * 100),
    musicVolume: Math.round((savedMusicVol ? parseFloat(savedMusicVol) : 0.5) * 100),
    sandbox: sandboxMode,
  },
);


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

function updateSeedPreview(): void {
  seedPreviewEl.textContent = String(seedFromString(seedInputEl.value));
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

const deathMessages: Record<string, string> = {
  fall: 'You fell from a high place.',
  mob: 'You were slain by a hostile creature.',
  lava: 'You tried to swim in lava.',
  unknown: 'You died.',
};

let deathScreenShownAt = -Infinity;

function showDeathScreen(): void {
  const cause = health.state.deathCause;
  deathMessageEl.textContent = deathMessages[cause] ?? deathMessages.unknown;
  deathScreenShownAt = performance.now();
  respawnBtnEl.disabled = false;
  deathScreenEl.classList.remove('hidden');
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

function hideDeathScreen(): void {
  deathScreenShownAt = -Infinity;
  deathScreenEl.classList.add('hidden');
}

const health = createHealth(
  () => terrainHeight(Math.floor(player.position.x), Math.floor(player.position.z), seed) + 2,
  (spawnY) => {
    player.position.set(8, spawnY, 8);
    player.velocity.set(0, 0, 0);
  },
  () => sfx.playerHurt(),
  () => {
    const slots = inventorySystem.snapshotInventory().slots;
    for (const slot of slots) {
      if (slot) itemPickups.spawn(slot.item, slot.count, player.position.clone());
    }
    inventorySystem.resetInventory();
    saveInventory().catch(console.error);
    sfx.playerDeath();
    showDeathScreen();
  },
);
health.mount(heartsEl, damageOverlayEl);

respawnBtnEl.addEventListener('click', () => {
  if (performance.now() - deathScreenShownAt < 250) return;
  health.triggerRespawn();
  hideDeathScreen();
  renderer.domElement.requestPointerLock().catch(() => {});
});

const eatingSystem = new EatingSystem(health, inventorySystem, eatingBarEl, eatingBarFillEl, () => sfx.eating(), () => sfx.eatComplete());

let last = performance.now();
let submergeFactor = 0;
let caveFactor = 0;
let prevOnGround = false;
let prevInWater = false;
let lastFootstepTime = 0;
let lastLavaDamageTime = 0;
const lastFootstepPos = new THREE.Vector3();

function applyRenderDistanceInternal(): void {
  applyRenderDistance(scene, camera, farTerrain, player, seed, submergeFactor, caveFactor);
  const pcx = Math.floor(player.position.x / CHUNK_SIZE);
  const pcz = Math.floor(player.position.z / CHUNK_SIZE);
  farTerrain.rebuild(pcx, pcz, seed, getFarRadius());
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

let touchControls: TouchControls | null = null;
if (isMobile) {
  touchControls = new TouchControls(keys, player, () => mouseSensitivity, {
    onMineStart: () => {
      if (!worldReady || inventorySystem.isOpen || furnaceSystem.isOpen || chestSystem.isOpen) return;
      handlePrimaryAction();
    },
    onMineStop: () => {
      interactionSystem.stopMining();
      eatingSystem.cancel();
    },
    onPlace: () => {
      if (!worldReady || inventorySystem.isOpen || furnaceSystem.isOpen || chestSystem.isOpen) return;
      handleSecondaryAction();
    },
    onPlaceStop: () => {
      eatingSystem.cancel();
    },
  });
}

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

    // Audio: footsteps, jump/land, water transitions
    if (player.onGround && !prevOnGround) {
      const fallSpeed = Math.abs(player.velocity.y);
      sfx.land(fallSpeed > 6);
    }
    if (!player.onGround && prevOnGround && player.velocity.y > 0) {
      sfx.jump();
    }
    if (player.inWater && !prevInWater) sfx.splash();
    if (player.onGround && !player.inWater) {
      const hDist = Math.hypot(player.position.x - lastFootstepPos.x, player.position.z - lastFootstepPos.z);
      if (hDist > 1.6 && now - lastFootstepTime > 300) {
        const bx = Math.floor(player.position.x);
        const by = Math.floor(player.position.y) - 1;
        const bz = Math.floor(player.position.z);
        sfx.footstep(blockMaterial(getBlock(bx, by, bz)));
        lastFootstepTime = now;
        lastFootstepPos.copy(player.position);
      }
    }
    prevOnGround = player.onGround;
    prevInWater = player.inWater;

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

async function refreshContinueButton(): Promise<void> {
  const hasSave = await worldStore.hasSavedWorld();
  continueWorldEl.style.display = hasSave ? '' : 'none';
}

startFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  startWorld(seedInputEl.value);
});

continueWorldEl.addEventListener('click', () => {
  startWorld(seedInputEl.value);
});

seedInputEl.addEventListener('input', () => {
  updateSeedPreview();
  seed = seedFromString(seedInputEl.value.trim() || '0');
  refreshContinueButton().catch(console.error);
});

clearWorldEl.addEventListener('click', () => {
  clearSavedWorld().catch((error) => {
    console.error(error);
    clearWorldStatusEl.textContent = 'Clear failed. Check console.';
    clearWorldEl.disabled = false;
  });
});

randomSeedEl.addEventListener('click', () => {
  seedInputEl.value = randomSeedText();
  updateSeedPreview();
  seed = seedFromString(seedInputEl.value.trim() || '0');
  refreshContinueButton().catch(console.error);
});

updateSeedPreview();
refreshContinueButton().catch(console.error);
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
  hostile.clear();
  worldReady = false;
  if (worldStarted) {
    startWorld(normalizedSeedText);
  }
  clearWorldStatusEl.textContent = 'Saved chunks and inventory cleared.';
  clearWorldEl.disabled = false;
  continueWorldEl.style.display = 'none';
}
