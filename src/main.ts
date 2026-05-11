import './style.css';
import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS, ATLAS_TILE_SIZE, Tile } from './atlas';
import { blockColor, isSolid } from './blocks';
import { biomeAt, generatedBlockAt, terrainHeight } from './terrain';
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

type LoadedChunk = {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  mesh: THREE.Mesh;
  lastSeen: number;
  solidVoxels: number;
};

type GpuTimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

type DiagnosticsSample = {
  frameMs: number;
  updateMs: number;
  renderMs: number;
};

type DiagnosticsSummary = {
  visibleChunks: number;
  chunkVertices: number;
  chunkIndices: number;
  chunkBytes: number;
  visibleVoxelCapacity: number;
  visibleSolidVoxels: number;
};

type WildlifeKind = 'rabbit' | 'deer' | 'fox' | 'boar' | 'bird';

type Wildlife = {
  key: ChunkKey;
  kind: WildlifeKind;
  root: THREE.Group;
  home: THREE.Vector3;
  target: THREE.Vector3;
  heading: number;
  speed: number;
  phase: number;
  nextTargetAt: number;
  turnSpeed: number;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
};

type Item =
  | 'wood'
  | 'planks'
  | 'sticks'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'coal'
  | 'iron_ore'
  | 'copper_ore'
  | 'gold_ore'
  | 'diamond'
  | 'gravel'
  | 'clay'
  | 'snow'
  | 'cobblestone'
  | 'flower'
  | 'birch_wood'
  | 'mossy_cobble'
  | 'brick'
  | 'glass'
  | 'cactus'
  | 'pumpkin'
  | 'mushroom'
  | 'berries'
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'torch'
  | 'crafting_table'
  | 'furnace';

type Recipe = {
  name: string;
  inputs: Partial<Record<Item, number>>;
  outputs: Partial<Record<Item, number>>;
};

type HeldItem =
  | { kind: 'block'; block: Block; label: string; item: Item | null }
  | { kind: 'tool'; tool: 'stick' | 'wood_pickaxe' | 'stone_pickaxe'; label: string; item: Item };

type ItemDef = {
  id: Item;
  label: string;
  category: 'Blocks' | 'Materials' | 'Tools';
  block?: Block;
  tool?: 'stick' | 'wood_pickaxe' | 'stone_pickaxe';
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

const defaultSeedText = localStorage.getItem('craft-seed') ?? '18441';
let seed = seedFromString(defaultSeedText);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86bee6);
scene.fog = new THREE.Fog(
  0x86bee6,
  CHUNK_SIZE * (DETAIL_RADIUS - 2),
  CHUNK_SIZE * (DETAIL_RADIUS + 5),
);

const camera = new THREE.PerspectiveCamera(
  74,
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
app.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdceeff, 0x587048, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(80, 140, 40);
scene.add(sun);
const sky = makeSky();
scene.add(sky);

const terrainAtlas = makeTerrainAtlas();
const chunkMaterial = makeTerrainMaterial(1);
const fadeMaterial = makeTerrainMaterial(0.72);
const farMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.55,
});
const crackCanvas = document.createElement('canvas');
crackCanvas.width = 128;
crackCanvas.height = 128;
const crackTexture = new THREE.CanvasTexture(crackCanvas);
crackTexture.colorSpace = THREE.SRGBColorSpace;
const crackMaterial = new THREE.MeshBasicMaterial({
  map: crackTexture,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  side: THREE.DoubleSide,
});

const chunks = new Map<ChunkKey, LoadedChunk>();
const wildlife = new Map<ChunkKey, Wildlife[]>();
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
let worldDbPromise: Promise<IDBDatabase> | null = null;

const frameBudgetMs = 1000 / 60;
const diagnosticsSamples: DiagnosticsSample[] = [];
const maxDiagnosticsSamples = 120;
const diagnosticsUpdateIntervalMs = 250;
const gpuGl = renderer.getContext();
const gpuTimerExt =
  typeof WebGL2RenderingContext !== 'undefined' && gpuGl instanceof WebGL2RenderingContext
    ? (gpuGl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null)
    : null;
let diagnosticsOpen = false;
let diagnosticsLastPaintAt = 0;
let longFrameCount = 0;
let worstFrameMs = 0;
let chunkMessagesThisSecond = 0;
let chunkMessagesPerSecond = 0;
let chunkMessageSecondStartedAt = performance.now();
let gpuQuery: WebGLQuery | null = null;
let lastGpuFrameMs: number | null = null;

let selectedHotbarIndex = 0;
let playerChunkX = Number.NaN;
let playerChunkZ = Number.NaN;
let frame = 0;
let inventoryOpen = false;
let worldStarted = false;
let worldReady = false;
const initialReadyRadius = 1;

const inventory: Record<Item, number> = {
  wood: 0,
  planks: 8,
  sticks: 0,
  dirt: 0,
  stone: 0,
  sand: 0,
  coal: 0,
  iron_ore: 0,
  copper_ore: 0,
  gold_ore: 0,
  diamond: 0,
  gravel: 0,
  clay: 0,
  snow: 0,
  cobblestone: 0,
  flower: 0,
  birch_wood: 0,
  mossy_cobble: 0,
  brick: 0,
  glass: 0,
  cactus: 0,
  pumpkin: 0,
  mushroom: 0,
  berries: 0,
  wood_pickaxe: 0,
  stone_pickaxe: 0,
  torch: 0,
  crafting_table: 0,
  furnace: 0,
};

const recipes: Recipe[] = [
  { name: 'Planks', inputs: { wood: 1 }, outputs: { planks: 4 } },
  { name: 'Sticks', inputs: { planks: 2 }, outputs: { sticks: 4 } },
  { name: 'Wood Pick', inputs: { planks: 3, sticks: 2 }, outputs: { wood_pickaxe: 1 } },
  { name: 'Stone Pick', inputs: { stone: 3, sticks: 2 }, outputs: { stone_pickaxe: 1 } },
  { name: 'Torch', inputs: { coal: 1, sticks: 1 }, outputs: { torch: 4 } },
  { name: 'Table', inputs: { planks: 4 }, outputs: { crafting_table: 1 } },
  { name: 'Furnace', inputs: { stone: 8 }, outputs: { furnace: 1 } },
  { name: 'Bricks', inputs: { clay: 2 }, outputs: { brick: 2 } },
  { name: 'Glass', inputs: { sand: 2 }, outputs: { glass: 2 } },
];

const itemDefs: ItemDef[] = [
  { id: 'dirt', label: 'Dirt', category: 'Blocks', block: Block.Dirt },
  { id: 'stone', label: 'Stone', category: 'Blocks', block: Block.Stone },
  { id: 'sand', label: 'Sand', category: 'Blocks', block: Block.Sand },
  { id: 'wood', label: 'Log', category: 'Blocks', block: Block.Log },
  { id: 'birch_wood', label: 'Birch Log', category: 'Blocks', block: Block.BirchLog },
  { id: 'planks', label: 'Planks', category: 'Blocks', block: Block.Planks },
  { id: 'crafting_table', label: 'Table', category: 'Blocks', block: Block.CraftingTable },
  { id: 'furnace', label: 'Furnace', category: 'Blocks', block: Block.Furnace },
  { id: 'cobblestone', label: 'Cobble', category: 'Blocks', block: Block.Cobblestone },
  { id: 'mossy_cobble', label: 'Mossy', category: 'Blocks', block: Block.MossyCobblestone },
  { id: 'brick', label: 'Brick', category: 'Blocks', block: Block.Brick },
  { id: 'glass', label: 'Glass', category: 'Blocks', block: Block.Glass },
  { id: 'gravel', label: 'Gravel', category: 'Blocks', block: Block.Gravel },
  { id: 'clay', label: 'Clay', category: 'Blocks', block: Block.Clay },
  { id: 'snow', label: 'Snow', category: 'Blocks', block: Block.Snow },
  { id: 'cactus', label: 'Cactus', category: 'Blocks', block: Block.Cactus },
  { id: 'pumpkin', label: 'Pumpkin', category: 'Blocks', block: Block.Pumpkin },
  { id: 'flower', label: 'Flower', category: 'Blocks', block: Block.RedFlower },
  { id: 'mushroom', label: 'Mushroom', category: 'Blocks', block: Block.Mushroom },
  { id: 'berries', label: 'Berries', category: 'Blocks', block: Block.BerryBush },
  { id: 'sticks', label: 'Stick', category: 'Tools', tool: 'stick' },
  { id: 'wood_pickaxe', label: 'Wood Pick', category: 'Tools', tool: 'wood_pickaxe' },
  { id: 'stone_pickaxe', label: 'Stone Pick', category: 'Tools', tool: 'stone_pickaxe' },
  { id: 'coal', label: 'Coal', category: 'Materials' },
  { id: 'iron_ore', label: 'Iron Ore', category: 'Materials' },
  { id: 'copper_ore', label: 'Copper Ore', category: 'Materials' },
  { id: 'gold_ore', label: 'Gold Ore', category: 'Materials' },
  { id: 'diamond', label: 'Diamond', category: 'Materials' },
  { id: 'torch', label: 'Torch', category: 'Materials' },
];

const hotbarEntries: HeldItem[] = [
  heldItemFor('dirt')!,
  heldItemFor('wood')!,
  heldItemFor('stone')!,
  heldItemFor('planks')!,
  heldItemFor('crafting_table')!,
  heldItemFor('cobblestone')!,
  heldItemFor('gravel')!,
  heldItemFor('clay')!,
  heldItemFor('snow')!,
  heldItemFor('sticks')!,
  heldItemFor('wood_pickaxe')!,
  heldItemFor('stone_pickaxe')!,
];

const farTerrain = new THREE.Group();
scene.add(farTerrain);

const highlight = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), highlightMaterial);
highlight.visible = false;
scene.add(highlight);

const placePreviewMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});
const placePreview = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), placePreviewMaterial);
placePreview.visible = false;
scene.add(placePreview);
const rayDirection = new THREE.Vector3();

const crackOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.018, 1.018, 1.018), crackMaterial);
crackOverlay.visible = false;
scene.add(crackOverlay);

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
const mining = {
  active: false,
  block: new THREE.Vector3(),
  startedAt: 0,
  lastSwingAt: 0,
  duration: 450,
  progress: 0,
};
const handRoot = new THREE.Group();
const heldRoot = new THREE.Group();
const handState = {
  swingStart: -1000,
  swingDuration: 260,
  swingKind: 'idle' as 'idle' | 'mine' | 'place',
};
handRoot.position.set(0.5, -0.52, -1.08);
handRoot.rotation.set(-0.16, -0.22, -0.14);
handRoot.add(heldRoot);
camera.add(handRoot);
const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <div class="start-screen">
    <form class="start-window">
      <div class="start-head">
        <span class="start-kicker">New world</span>
        <h1>Create World</h1>
      </div>
      <label class="seed-field" for="seed-input">
        <span>Seed</span>
        <input id="seed-input" autocomplete="off" spellcheck="false" />
      </label>
      <div class="seed-meta">
        <span>World key</span>
        <b id="seed-preview"></b>
      </div>
      <div class="seed-presets" aria-label="Seed presets">
        <button type="button" data-seed-preset="18441">Spawn</button>
        <button type="button" data-seed-preset="forest ridge">Forest</button>
        <button type="button" data-seed-preset="cold copper">Snow</button>
      </div>
      <div class="seed-actions">
        <button class="secondary" type="button" id="random-seed">Randomize</button>
        <button class="primary" type="submit">Generate</button>
      </div>
    </form>
  </div>
  <div class="loading-screen hidden">
    <div class="loading-window">
      <b>Generating world</b>
      <span id="loading-status">Preparing spawn chunks...</span>
      <div class="loading-bar"><span></span></div>
    </div>
  </div>
  <div class="crosshair"></div>
  <div class="panel">
    <b>Craft</b>
    Click to lock pointer. WASD move, Space jump. Left click breaks, right click places. Number keys select blocks.
    <div id="stats"></div>
    <div class="crafting">
      <b>Tech</b>
      <div class="inventory"></div>
      <div class="recipes"></div>
    </div>
  </div>
  <div class="diagnostics hidden" id="diagnostics"></div>
  <div class="hotbar"></div>
  <div class="inventory-overlay hidden">
    <div class="inventory-window">
      <div class="inventory-head">
        <b>Inventory</b>
        <span>Click an item to assign it to the selected hotbar slot.</span>
      </div>
      <div class="inventory-tabs"></div>
      <div class="inventory-grid-large"></div>
    </div>
  </div>
`;
document.body.appendChild(hud);
const statsEl = hud.querySelector<HTMLDivElement>('#stats')!;
const diagnosticsEl = hud.querySelector<HTMLDivElement>('#diagnostics')!;
const hotbarEl = hud.querySelector<HTMLDivElement>('.hotbar')!;
const inventoryEl = hud.querySelector<HTMLDivElement>('.inventory')!;
const recipesEl = hud.querySelector<HTMLDivElement>('.recipes')!;
const inventoryOverlayEl = hud.querySelector<HTMLDivElement>('.inventory-overlay')!;
const inventoryTabsEl = hud.querySelector<HTMLDivElement>('.inventory-tabs')!;
const inventoryGridLargeEl = hud.querySelector<HTMLDivElement>('.inventory-grid-large')!;
const startScreenEl = hud.querySelector<HTMLDivElement>('.start-screen')!;
const loadingScreenEl = hud.querySelector<HTMLDivElement>('.loading-screen')!;
const loadingStatusEl = hud.querySelector<HTMLSpanElement>('#loading-status')!;
const seedInputEl = hud.querySelector<HTMLInputElement>('#seed-input')!;
const startFormEl = hud.querySelector<HTMLFormElement>('.start-window')!;
const randomSeedEl = hud.querySelector<HTMLButtonElement>('#random-seed')!;
const seedPreviewEl = hud.querySelector<HTMLElement>('#seed-preview')!;
seedInputEl.value = defaultSeedText;
let inventoryCategory: ItemDef['category'] = 'Blocks';

function paintHotbar(): void {
  hotbarEl.innerHTML = '';
  hotbarEntries.forEach((entry, index) => {
    const slot = document.createElement('button');
    slot.className = `slot${index === selectedHotbarIndex ? ' active' : ''}`;
    slot.type = 'button';
    slot.title = entry.label;
    slot.addEventListener('click', () => {
      selectedHotbarIndex = index;
      paintHotbar();
      rebuildHeldItem();
    });
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    if (entry.kind === 'block') {
      const [r, g, b] = blockColor(entry.block);
      swatch.style.background = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
    } else {
      swatch.style.background =
        entry.tool === 'stick'
          ? 'linear-gradient(135deg, transparent 35%, #8b5a2b 36%, #8b5a2b 64%, transparent 65%)'
          : 'linear-gradient(135deg, #7a4a23 0 35%, #c2c7c4 36% 68%, transparent 69%)';
    }
    const key = document.createElement('span');
    key.className = 'hotbar-key';
    key.textContent = index < 9 ? String(index + 1) : index === 9 ? '0' : index === 10 ? '-' : '=';
    slot.appendChild(swatch);
    slot.appendChild(key);
    hotbarEl.appendChild(slot);
  });
}
paintHotbar();
rebuildHeldItem();
paintInventory();
paintInventoryOverlay();

function blockToItem(block: Block): Item | null {
  switch (block) {
    case Block.Grass:
    case Block.Dirt:
      return 'dirt';
    case Block.Stone:
      return 'stone';
    case Block.Sand:
      return 'sand';
    case Block.Cobblestone:
      return 'cobblestone';
    case Block.MossyCobblestone:
      return 'mossy_cobble';
    case Block.Brick:
      return 'brick';
    case Block.Glass:
      return 'glass';
    case Block.Log:
      return 'wood';
    case Block.BirchLog:
      return 'birch_wood';
    case Block.CoalOre:
      return 'coal';
    case Block.IronOre:
      return 'iron_ore';
    case Block.CopperOre:
      return 'copper_ore';
    case Block.GoldOre:
      return 'gold_ore';
    case Block.DiamondOre:
      return 'diamond';
    case Block.Gravel:
      return 'gravel';
    case Block.Clay:
      return 'clay';
    case Block.Snow:
      return 'snow';
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
      return 'flower';
    case Block.Mushroom:
      return 'mushroom';
    case Block.BerryBush:
      return 'berries';
    case Block.Cactus:
      return 'cactus';
    case Block.Pumpkin:
      return 'pumpkin';
    case Block.Planks:
      return 'planks';
    case Block.CraftingTable:
      return 'crafting_table';
    case Block.Furnace:
      return 'furnace';
    case Block.Torch:
      return 'torch';
    default:
      return null;
  }
}

function heldItemFor(item: Item): HeldItem | null {
  const def = itemDefs.find((entry) => entry.id === item);
  if (!def) return null;
  if (def.block !== undefined) return { kind: 'block', block: def.block, label: def.label, item };
  if (def.tool) return { kind: 'tool', tool: def.tool, label: def.label, item };
  return null;
}

function selectedPlaceBlock(): Block | null {
  const entry = selectedEntry();
  return entry.kind === 'block' ? entry.block : null;
}

function selectedPlaceItem(): Item | null {
  const entry = selectedEntry();
  return entry.kind === 'block' ? entry.item : null;
}

function selectedTool(): Extract<HeldItem, { kind: 'tool' }> | null {
  const entry = selectedEntry();
  return entry.kind === 'tool' ? entry : null;
}

function addItem(item: Item | null, amount: number): void {
  if (!item) return;
  inventory[item] += amount;
  paintInventory();
  paintInventoryOverlay();
  saveInventory();
}

function canCraft(recipe: Recipe): boolean {
  return Object.entries(recipe.inputs).every(
    ([item, count]) => inventory[item as Item] >= (count ?? 0),
  );
}

function craft(recipe: Recipe): void {
  if (!canCraft(recipe)) return;
  for (const [item, count] of Object.entries(recipe.inputs)) inventory[item as Item] -= count ?? 0;
  for (const [item, count] of Object.entries(recipe.outputs)) inventory[item as Item] += count ?? 0;
  paintInventory();
  paintInventoryOverlay();
  saveInventory();
}

function paintInventory(): void {
  const visibleItems = (Object.entries(inventory) as Array<[Item, number]>).filter(
    ([, count]) => count > 0,
  );
  inventoryEl.innerHTML = '';
  if (visibleItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inventory-empty';
    empty.textContent = 'Empty';
    inventoryEl.appendChild(empty);
  }
  for (const [item, count] of visibleItems) {
    const slot = document.createElement('button');
    slot.className = 'inventory-slot';
    slot.type = 'button';
    slot.title = labelItem(item);
    slot.disabled = heldItemFor(item) === null;
    slot.addEventListener('click', () => {
      assignItemToSelectedSlot(item);
      paintHotbar();
      rebuildHeldItem();
    });

    const swatch = document.createElement('span');
    swatch.className = 'inventory-swatch';
    swatch.style.background = itemSwatch(item);
    const countEl = document.createElement('span');
    countEl.className = 'inventory-count';
    countEl.textContent = String(count);
    slot.append(swatch, countEl);
    inventoryEl.appendChild(slot);
  }
  recipesEl.innerHTML = '';
  for (const recipe of recipes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = recipe.name;
    button.disabled = !canCraft(recipe);
    button.addEventListener('click', () => craft(recipe));
    recipesEl.appendChild(button);
  }
}

function paintInventoryOverlay(): void {
  inventoryOverlayEl.classList.toggle('hidden', !inventoryOpen);
  inventoryTabsEl.innerHTML = '';
  for (const category of ['Blocks', 'Materials', 'Tools'] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = category === inventoryCategory ? 'active' : '';
    button.textContent = category;
    button.addEventListener('click', () => {
      inventoryCategory = category;
      paintInventoryOverlay();
    });
    inventoryTabsEl.appendChild(button);
  }

  inventoryGridLargeEl.innerHTML = '';
  for (const def of itemDefs.filter((entry) => entry.category === inventoryCategory)) {
    const count = inventory[def.id];
    const slot = document.createElement('button');
    slot.className = `inventory-large-slot${count > 0 ? '' : ' empty'}`;
    slot.type = 'button';
    slot.disabled = count <= 0 || heldItemFor(def.id) === null;
    slot.title = def.label;
    slot.addEventListener('click', () => {
      assignItemToSelectedSlot(def.id);
      paintHotbar();
      rebuildHeldItem();
      paintInventoryOverlay();
    });

    const swatch = document.createElement('span');
    swatch.className = 'inventory-large-swatch';
    swatch.style.background = itemSwatch(def.id);
    const label = document.createElement('span');
    label.className = 'inventory-large-label';
    label.textContent = def.label;
    const countEl = document.createElement('span');
    countEl.className = 'inventory-large-count';
    countEl.textContent = String(count);
    slot.append(swatch, label, countEl);
    inventoryGridLargeEl.appendChild(slot);
  }
}

function assignItemToSelectedSlot(item: Item): void {
  const held = heldItemFor(item);
  if (!held) return;
  hotbarEntries[selectedHotbarIndex] = held;
  saveHotbar();
}

function labelItem(item: Item): string {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def) return def.label;
  return item
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function itemSwatch(item: Item): string {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def?.block !== undefined) {
    const [r, g, b] = blockColor(def.block);
    return `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
  }
  const defBlock = itemDefs.find((entry) => entry.id === item && entry.block !== undefined);
  if (defBlock?.block !== undefined) {
    const [r, g, b] = blockColor(defBlock.block);
    return `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
  }
  switch (item) {
    case 'sticks':
      return 'linear-gradient(135deg, transparent 35%, #8b5a2b 36%, #8b5a2b 64%, transparent 65%)';
    case 'wood_pickaxe':
      return 'linear-gradient(135deg, #7a4a23 0 35%, #9a6835 36% 68%, transparent 69%)';
    case 'stone_pickaxe':
      return 'linear-gradient(135deg, #7a4a23 0 35%, #c2c7c4 36% 68%, transparent 69%)';
    case 'coal':
      return '#252525';
    case 'iron_ore':
      return '#b68155';
    case 'copper_ore':
      return '#b56a3a';
    case 'gold_ore':
      return '#e0b83c';
    case 'diamond':
      return '#56d5dd';
    case 'flower':
      return 'linear-gradient(135deg, #4d8f35 0 45%, #d63b2e 46% 70%, #e7c52a 71%)';
    case 'snow':
      return '#e8f1f4';
    default:
      return '#90999c';
  }
}

function selectedEntry(): HeldItem {
  return hotbarEntries[selectedHotbarIndex];
}

function rebuildHeldItem(): void {
  for (const child of heldRoot.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  }
  heldRoot.clear();

  const entry = selectedEntry();
  if (entry.kind === 'block') {
    heldRoot.add(makeHeldBlock(entry.block));
  } else if (entry.tool === 'stick') {
    heldRoot.add(makeStick());
  } else {
    heldRoot.add(makePickaxe(entry.tool));
  }
}

function makeHeldBlock(block: Block): THREE.Group {
  const group = new THREE.Group();
  const [r, g, b] = blockColor(block);
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), material);
  cube.rotation.set(0.2, 0.55, -0.16);
  cube.position.set(0, 0, 0);
  group.add(cube);
  return group;
}

function makeStick(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x8a572b });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.06), material);
  shaft.rotation.set(0.36, 0, -0.52);
  shaft.position.set(0.02, 0, 0);
  group.add(shaft);
  return group;
}

function makePickaxe(tool: 'wood_pickaxe' | 'stone_pickaxe'): THREE.Group {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.64, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x8a572b }),
  );
  handle.rotation.set(0.34, 0, -0.55);
  handle.position.set(0.02, -0.06, 0);
  group.add(handle);

  const headColor = tool === 'stone_pickaxe' ? 0x9b9d98 : 0x9a6835;
  const headMaterial = new THREE.MeshLambertMaterial({ color: headColor });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.09), headMaterial);
  head.rotation.set(0.34, 0, -0.55);
  head.position.set(-0.09, 0.22, 0);
  group.add(head);

  const tipA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), headMaterial.clone());
  tipA.rotation.set(0.34, 0, -0.9);
  tipA.position.set(-0.3, 0.29, 0);
  group.add(tipA);

  const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), headMaterial.clone());
  tipB.rotation.set(0.34, 0, -0.2);
  tipB.position.set(0.12, 0.16, 0);
  group.add(tipB);
  return group;
}

function triggerHandSwing(kind: 'mine' | 'place'): void {
  handState.swingKind = kind;
  handState.swingDuration = kind === 'mine' ? 230 : 170;
  handState.swingStart = performance.now();
}

function updateHand(now: number): void {
  const bob = Math.sin(now * 0.004) * 0.012;
  handRoot.position.set(0.5, -0.52 + bob, -1.08);
  handRoot.rotation.set(-0.16, -0.22, -0.14);

  const t = Math.min(1, Math.max(0, (now - handState.swingStart) / handState.swingDuration));
  if (t < 1) {
    const swing = Math.sin(t * Math.PI);
    const strike = handState.swingKind === 'mine' ? Math.sin(t * Math.PI * 1.7) : swing;
    handRoot.position.x += swing * -0.1;
    handRoot.position.y += swing * -0.16;
    handRoot.position.z += swing * -0.16;
    handRoot.rotation.x += strike * -0.85;
    handRoot.rotation.y += swing * 0.22;
    handRoot.rotation.z += swing * -0.38;
  }
}

function pollGpuTimer(): void {
  if (!gpuTimerExt || !(gpuGl instanceof WebGL2RenderingContext) || !gpuQuery) return;
  const available = gpuGl.getQueryParameter(gpuQuery, gpuGl.QUERY_RESULT_AVAILABLE) as boolean;
  const disjoint = gpuGl.getParameter(gpuTimerExt.GPU_DISJOINT_EXT) as boolean;
  if (!available) return;
  if (!disjoint) {
    const elapsedNs = gpuGl.getQueryParameter(gpuQuery, gpuGl.QUERY_RESULT) as number;
    lastGpuFrameMs = elapsedNs / 1_000_000;
  }
  gpuGl.deleteQuery(gpuQuery);
  gpuQuery = null;
}

function beginGpuTimer(): void {
  if (!gpuTimerExt || !(gpuGl instanceof WebGL2RenderingContext) || gpuQuery) return;
  gpuQuery = gpuGl.createQuery();
  if (!gpuQuery) return;
  gpuGl.beginQuery(gpuTimerExt.TIME_ELAPSED_EXT, gpuQuery);
}

function endGpuTimer(): void {
  if (!gpuTimerExt || !(gpuGl instanceof WebGL2RenderingContext) || !gpuQuery) return;
  gpuGl.endQuery(gpuTimerExt.TIME_ELAPSED_EXT);
}

function recordDiagnosticsSample(frameMs: number, updateMs: number, renderMs: number): void {
  diagnosticsSamples.push({ frameMs, updateMs, renderMs });
  if (diagnosticsSamples.length > maxDiagnosticsSamples) diagnosticsSamples.shift();
  if (frameMs > frameBudgetMs * 1.5) longFrameCount++;
  worstFrameMs = Math.max(worstFrameMs, frameMs);
}

function summarizeSamples(): {
  fps: number;
  frameAvg: number;
  frameMin: number;
  frameMax: number;
  updateAvg: number;
  renderAvg: number;
} {
  if (diagnosticsSamples.length === 0) {
    return { fps: 0, frameAvg: 0, frameMin: 0, frameMax: 0, updateAvg: 0, renderAvg: 0 };
  }
  let frameTotal = 0;
  let updateTotal = 0;
  let renderTotal = 0;
  let frameMin = Number.POSITIVE_INFINITY;
  let frameMax = 0;
  for (const sample of diagnosticsSamples) {
    frameTotal += sample.frameMs;
    updateTotal += sample.updateMs;
    renderTotal += sample.renderMs;
    frameMin = Math.min(frameMin, sample.frameMs);
    frameMax = Math.max(frameMax, sample.frameMs);
  }
  const frameAvg = frameTotal / diagnosticsSamples.length;
  return {
    fps: frameAvg > 0 ? 1000 / frameAvg : 0,
    frameAvg,
    frameMin,
    frameMax,
    updateAvg: updateTotal / diagnosticsSamples.length,
    renderAvg: renderTotal / diagnosticsSamples.length,
  };
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
    visibleChunks,
    chunkVertices,
    chunkIndices,
    chunkBytes,
    visibleVoxelCapacity: visibleChunks * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT,
    visibleSolidVoxels,
  };
}

function updateChunkMessageRate(now: number): void {
  if (now - chunkMessageSecondStartedAt < 1000) return;
  chunkMessagesPerSecond = chunkMessagesThisSecond;
  chunkMessagesThisSecond = 0;
  chunkMessageSecondStartedAt = now;
}

function updateDiagnosticsOverlay(now: number): void {
  updateChunkMessageRate(now);
  if (!diagnosticsOpen || now - diagnosticsLastPaintAt < diagnosticsUpdateIntervalMs) return;
  diagnosticsLastPaintAt = now;

  const samples = summarizeSamples();
  const world = summarizeWorldDiagnostics();
  const info = renderer.info;
  const memory = (performance as PerformanceWithMemory).memory;
  const heapText = memory
    ? `${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.totalJSHeapSize)}`
    : 'unsupported';
  const gpuText = gpuTimerExt
    ? lastGpuFrameMs === null
      ? 'pending'
      : `${formatMs(lastGpuFrameMs)} measured`
    : 'unsupported';
  const cpuLoad = (samples.frameAvg / frameBudgetMs) * 100;

  diagnosticsEl.innerHTML = `
    <div class="diagnostics-title">Diagnostics <span>F3</span></div>
    <div class="diagnostics-group">
      <b>Frame</b>
      <div><span>FPS</span><strong>${formatNumber(samples.fps, 1)}</strong></div>
      <div><span>Frame ms avg/min/max</span><strong>${formatMs(samples.frameAvg)} / ${formatMs(samples.frameMin)} / ${formatMs(samples.frameMax)}</strong></div>
      <div><span>Main update ms</span><strong>${formatMs(samples.updateAvg)}</strong></div>
      <div><span>Render submit ms</span><strong>${formatMs(samples.renderAvg)}</strong></div>
      <div><span>CPU budget load</span><strong>${formatNumber(cpuLoad, 0)}% proxy</strong></div>
      <div><span>Long frames / worst</span><strong>${longFrameCount} / ${formatMs(worstFrameMs)}</strong></div>
      <div><span>GPU frame</span><strong>${gpuText}</strong></div>
    </div>
    <div class="diagnostics-group">
      <b>Render</b>
      <div><span>Draw calls</span><strong>${info.render.calls}</strong></div>
      <div><span>Triangles</span><strong>${formatInteger(info.render.triangles)}</strong></div>
      <div><span>Lines / points</span><strong>${formatInteger(info.render.lines)} / ${formatInteger(info.render.points)}</strong></div>
      <div><span>Geometries / textures</span><strong>${info.memory.geometries} / ${info.memory.textures}</strong></div>
      <div><span>Shader programs</span><strong>${info.programs?.length ?? 0}</strong></div>
    </div>
    <div class="diagnostics-group">
      <b>World</b>
      <div><span>Chunks loaded / visible</span><strong>${chunks.size} / ${world.visibleChunks}</strong></div>
      <div><span>Chunk vertices / indices</span><strong>${formatInteger(world.chunkVertices)} / ${formatInteger(world.chunkIndices)}</strong></div>
      <div><span>Visible solid voxels</span><strong>${formatInteger(world.visibleSolidVoxels)} exact</strong></div>
      <div><span>Visible voxel capacity</span><strong>${formatInteger(world.visibleVoxelCapacity)} estimate</strong></div>
      <div><span>Chunk mesh buffers</span><strong>${formatBytes(world.chunkBytes)} estimate</strong></div>
    </div>
    <div class="diagnostics-group">
      <b>Worker</b>
      <div><span>Workers</span><strong>${workerCount}</strong></div>
      <div><span>Pending / requested</span><strong>${pendingQueue.length} / ${requested.size}</strong></div>
      <div><span>Dirty remeshes</span><strong>${dirty.size}</strong></div>
      <div><span>Chunk messages/sec</span><strong>${chunkMessagesPerSecond}</strong></div>
    </div>
    <div class="diagnostics-group">
      <b>Memory</b>
      <div><span>JS heap</span><strong>${heapText}</strong></div>
      <div><span>Renderer memory</span><strong>${info.memory.geometries} geo / ${info.memory.textures} tex</strong></div>
    </div>
  `;
}

function setDiagnosticsOpen(open: boolean): void {
  diagnosticsOpen = open;
  diagnosticsEl.classList.toggle('hidden', !diagnosticsOpen);
  if (diagnosticsOpen) diagnosticsLastPaintAt = 0;
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '0.00ms';
  return `${value.toFixed(2)}ms`;
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(fractionDigits);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
}

function countSolidVoxels(blocks: Uint16Array): number {
  let count = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== Block.Air) count++;
  }
  return count;
}

for (const chunkWorker of workers) {
  chunkWorker.onmessage = handleWorkerMessage;
}

function handleWorkerMessage(event: MessageEvent<WorkerOut>): void {
  if (event.data.type === 'error') {
    console.error(event.data.message);
    return;
  }
  chunkMessagesThisSecond++;
  receiveChunk(event.data.payload);
}

function postChunkJob(message: WorkerIn, transfer: Transferable[] = []): void {
  const chunkWorker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  chunkWorker.postMessage(message, transfer);
}

function seedFromString(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return Math.trunc(numeric) | 0;

  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function randomSeedText(): string {
  const first = ['amber', 'cedar', 'copper', 'frost', 'moss', 'river', 'stone', 'willow'];
  const second = ['basin', 'bluff', 'grove', 'hollow', 'mesa', 'ridge', 'spring', 'valley'];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${first[Math.floor(Math.random() * first.length)]}-${second[Math.floor(Math.random() * second.length)]}-${suffix}`;
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
  stopMining();

  const spawnX = 8;
  const spawnZ = 8;
  const spawnY = Math.min(
    WORLD_HEIGHT - player.height - 1,
    terrainHeight(spawnX, spawnZ, seed) + 1.02,
  );
  player.position.set(spawnX, spawnY, spawnZ);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  startScreenEl.classList.add('hidden');
  loadingScreenEl.classList.remove('hidden');
  updateChunkSet();
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
  spawnWildlifeForChunk(payload.cx, payload.cz);
}

function storedChunkKey(key: ChunkKey): string {
  return `${seed}:${key}`;
}

function openWorldDb(): Promise<IDBDatabase> {
  if (worldDbPromise) return worldDbPromise;
  worldDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('craft-world-v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      worldDbPromise = null;
      reject(request.error);
    };
  });
  return worldDbPromise;
}

async function loadSavedChunk(key: ChunkKey): Promise<Uint16Array | null> {
  const db = await openWorldDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const request = tx.objectStore('chunks').get(storedChunkKey(key));
    request.onsuccess = () => {
      const value = request.result as ArrayBuffer | undefined;
      resolve(value ? new Uint16Array(value) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveChunk(key: ChunkKey, blocks: Uint16Array): Promise<void> {
  const db = await openWorldDb();
  return new Promise((resolve, reject) => {
    const copy = blocks.buffer.slice(0);
    const tx = db.transaction('chunks', 'readwrite');
    tx.objectStore('chunks').put(copy, storedChunkKey(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadInventory(): Promise<void> {
  const db = await openWorldDb();
  return new Promise((resolve) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('inventory');
    request.onsuccess = () => {
      const saved = request.result as Partial<Record<Item, number>> | undefined;
      if (saved) {
        for (const item of Object.keys(inventory) as Item[]) {
          inventory[item] = Math.max(0, Math.floor(saved[item] ?? inventory[item]));
        }
        paintInventory();
        paintInventoryOverlay();
      }
      resolve();
    };
    request.onerror = () => resolve();
  });
}

async function loadHotbar(): Promise<void> {
  const db = await openWorldDb();
  return new Promise((resolve) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('hotbar');
    request.onsuccess = () => {
      const saved = request.result as Item[] | undefined;
      if (Array.isArray(saved)) {
        saved.slice(0, hotbarEntries.length).forEach((item, index) => {
          const held = heldItemFor(item);
          if (held) hotbarEntries[index] = held;
        });
        paintHotbar();
        rebuildHeldItem();
      }
      resolve();
    };
    request.onerror = () => resolve();
  });
}

async function saveInventory(): Promise<void> {
  const db = await openWorldDb();
  return new Promise((resolve) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({ ...inventory }, 'inventory');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function saveHotbar(): Promise<void> {
  const db = await openWorldDb();
  return new Promise((resolve) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(hotbarEntries.map((entry) => entry.item).filter(Boolean), 'hotbar');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function scheduleChunkSave(key: ChunkKey): void {
  const chunk = chunks.get(key);
  if (!chunk) return;
  const existing = chunkSaveTimers.get(key);
  if (existing !== undefined) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    chunkSaveTimers.delete(key);
    const latest = chunks.get(key);
    if (latest) saveChunk(key, latest.blocks).catch(console.error);
  }, 250);
  chunkSaveTimers.set(key, timer);
}

function makeSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(CHUNK_SIZE * FAR_RADIUS * 0.92, 32, 16);
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x6fb4e8) },
      horizonColor: { value: new THREE.Color(0xd6eef6) },
      groundColor: { value: new THREE.Color(0x8abf83) },
      sunColor: { value: new THREE.Color(0xfff1be) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      varying vec3 vWorldDirection;
      void main() {
        float h = clamp(vWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(horizonColor, topColor, smoothstep(0.42, 1.0, h));
        sky = mix(groundColor, sky, smoothstep(0.08, 0.35, h));
        vec3 sunDir = normalize(vec3(0.45, 0.76, 0.22));
        float sun = pow(max(dot(normalize(vWorldDirection), sunDir), 0.0), 450.0);
        float glow = pow(max(dot(normalize(vWorldDirection), sunDir), 0.0), 18.0) * 0.18;
        gl_FragColor = vec4(sky + sunColor * (sun + glow), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

function makeTerrainMaterial(opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atlasMap: { value: terrainAtlas },
      tileSize: { value: ATLAS_TILE_SIZE },
      opacity: { value: opacity },
      fogColor: {
        value: scene.fog instanceof THREE.Fog ? scene.fog.color : new THREE.Color(0x86bee6),
      },
      fogNear: { value: scene.fog instanceof THREE.Fog ? scene.fog.near : 120 },
      fogFar: { value: scene.fog instanceof THREE.Fog ? scene.fog.far : 220 },
    },
    vertexShader: `
      attribute vec4 atlasRect;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vRepeatUv = uv;
        vAtlasRect = atlasRect;
        vColor = color;
        vNormal = normal;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D atlasMap;
      uniform float tileSize;
      uniform float opacity;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hashTile(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec2 tileUv = (floor(fract(vRepeatUv) * tileSize) + 0.5) / tileSize;
        vec2 atlasUv = vAtlasRect.xy + tileUv * vAtlasRect.zw;
        vec4 texel = texture2D(atlasMap, atlasUv);
        if (texel.a < 0.45) discard;
        vec3 n = abs(normalize(vNormal));
        vec2 tileCoord = n.y > 0.5
          ? floor(vWorldPosition.xz)
          : n.x > 0.5
            ? floor(vWorldPosition.zy)
            : floor(vWorldPosition.xy);
        float variation = mix(0.95, 1.05, hashTile(tileCoord));
        vec3 color = texel.rgb * vColor * variation;
        float fogDepth = length(cameraPosition - vWorldPosition);
        float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
        gl_FragColor = vec4(mix(color, fogColor, fogFactor), texel.a * opacity);
      }
    `,
    vertexColors: true,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
}

function makeTerrainAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * ATLAS_TILE_SIZE;
  canvas.height = ATLAS_ROWS * ATLAS_TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create terrain atlas');
  context.imageSmoothingEnabled = false;

  drawTile(context, Tile.GrassTop, '#5da646', '#73bb57', 'speckles');
  drawTile(context, Tile.GrassSide, '#5a8e3f', '#80613a', 'grassSide');
  drawTile(context, Tile.Dirt, '#76502f', '#5d3b22', 'speckles');
  drawTile(context, Tile.Stone, '#858984', '#696d69', 'cracks');
  drawTile(context, Tile.LogSide, '#7c522b', '#5b351d', 'bark');
  drawTile(context, Tile.LogTop, '#a06b36', '#6f431f', 'rings');
  drawTile(context, Tile.Leaves, '#3f7d35', '#2f642b', 'leaves');
  drawTile(context, Tile.Sand, '#c8b46e', '#a89455', 'speckles');
  drawTile(context, Tile.CoalOre, '#767a76', '#252525', 'ore');
  drawTile(context, Tile.IronOre, '#858984', '#b68155', 'ore');
  drawTile(context, Tile.Planks, '#a6753b', '#6d4424', 'planks');
  drawTile(context, Tile.CraftingTable, '#9a612f', '#57331c', 'table');
  drawTile(context, Tile.Furnace, '#666a67', '#343735', 'furnace');
  drawTile(context, Tile.Gravel, '#74736e', '#4d4d49', 'gravel');
  drawTile(context, Tile.Clay, '#7f969c', '#5e777f', 'speckles');
  drawTile(context, Tile.Snow, '#e8f1f4', '#c9dce4', 'snow');
  drawTile(context, Tile.CopperOre, '#858984', '#b56a3a', 'ore');
  drawTile(context, Tile.GoldOre, '#858984', '#e0b83c', 'ore');
  drawTile(context, Tile.DiamondOre, '#777d7d', '#56d5dd', 'ore');
  drawTile(context, Tile.TallGrass, '#4f973a', '#2c6b25', 'grassBlade');
  drawTile(context, Tile.RedFlower, '#4d8f35', '#c92323', 'flower');
  drawTile(context, Tile.YellowFlower, '#4d8f35', '#e7c52a', 'flower');
  drawTile(context, Tile.Cobblestone, '#6e716d', '#424542', 'cobble');
  drawTile(context, Tile.BirchLogSide, '#d3c89f', '#403326', 'birchBark');
  drawTile(context, Tile.BirchLogTop, '#d8bd7a', '#8b6332', 'rings');
  drawTile(context, Tile.BirchLeaves, '#78a93f', '#517b2b', 'leaves');
  drawTile(context, Tile.MossyCobblestone, '#65715d', '#2f5e2c', 'mossyCobble');
  drawTile(context, Tile.Brick, '#974632', '#5a241e', 'bricks');
  drawTile(context, Tile.Glass, '#9fd4dc', '#e6fbff', 'glass');
  drawTile(context, Tile.CactusSide, '#348c43', '#1f5f2f', 'cactus');
  drawTile(context, Tile.CactusTop, '#3b9a49', '#245f31', 'speckles');
  drawTile(context, Tile.Pumpkin, '#dc741e', '#7d3f13', 'pumpkin');
  drawTile(context, Tile.BlueFlower, '#4d8f35', '#3757d8', 'flower');
  drawTile(context, Tile.Mushroom, '#d7c3a2', '#b33b2d', 'mushroom');
  drawTile(context, Tile.BerryBush, '#3e7d34', '#c22d39', 'berries');

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}

function drawTile(
  context: CanvasRenderingContext2D,
  tile: Tile,
  base: string,
  accent: string,
  pattern: string,
): void {
  const x = (tile % ATLAS_COLUMNS) * ATLAS_TILE_SIZE;
  const y = Math.floor(tile / ATLAS_COLUMNS) * ATLAS_TILE_SIZE;
  context.fillStyle = base;
  context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
  context.fillStyle = accent;

  const rand = (i: number) => {
    const n = Math.sin((tile + 1) * 93.17 + i * 17.13) * 43758.5453;
    return n - Math.floor(n);
  };

  if (pattern === 'speckles' || pattern === 'leaves') {
    const count = pattern === 'leaves' ? 42 : 28;
    for (let i = 0; i < count; i++) {
      context.globalAlpha = pattern === 'leaves' ? 0.36 : 0.22;
      context.fillRect(
        x + Math.floor(rand(i) * 16),
        y + Math.floor(rand(i + 100) * 16),
        1 + Math.floor(rand(i + 200) * 2),
        1,
      );
    }
  } else if (pattern === 'grassSide') {
    context.fillStyle = accent;
    context.fillRect(x, y + 5, 16, 11);
    context.fillStyle = base;
    for (let i = 0; i < 9; i++) {
      const gx = x + Math.floor(rand(i) * 16);
      context.fillRect(gx, y, 2, 5 + Math.floor(rand(i + 9) * 5));
    }
  } else if (pattern === 'cracks') {
    context.globalAlpha = 0.28;
    for (let i = 0; i < 8; i++) {
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), 3, 1);
    }
  } else if (pattern === 'bark') {
    context.globalAlpha = 0.32;
    for (let i = 1; i < 16; i += 4) context.fillRect(x + i, y, 1, 16);
  } else if (pattern === 'rings') {
    context.globalAlpha = 0.45;
    context.strokeStyle = accent;
    context.strokeRect(x + 3, y + 3, 10, 10);
    context.strokeRect(x + 6, y + 6, 4, 4);
  } else if (pattern === 'ore') {
    context.globalAlpha = 0.8;
    for (let i = 0; i < 7; i++) {
      context.fillRect(
        x + 2 + Math.floor(rand(i) * 12),
        y + 2 + Math.floor(rand(i + 30) * 12),
        2,
        2,
      );
    }
  } else if (pattern === 'planks') {
    context.globalAlpha = 0.5;
    context.fillRect(x, y + 5, 16, 1);
    context.fillRect(x, y + 11, 16, 1);
    context.fillRect(x + 5, y, 1, 5);
    context.fillRect(x + 10, y + 6, 1, 5);
  } else if (pattern === 'table') {
    context.globalAlpha = 0.55;
    context.strokeStyle = accent;
    context.strokeRect(x + 2, y + 2, 12, 12);
    context.fillRect(x + 4, y + 4, 8, 2);
    context.fillRect(x + 4, y + 10, 8, 2);
  } else if (pattern === 'furnace') {
    context.globalAlpha = 0.7;
    context.fillRect(x + 4, y + 5, 8, 6);
    context.fillStyle = '#2a2c2b';
    context.fillRect(x + 5, y + 6, 6, 4);
  } else if (pattern === 'gravel') {
    context.globalAlpha = 0.45;
    for (let i = 0; i < 36; i++) {
      const s = 1 + Math.floor(rand(i + 70) * 3);
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), s, s);
    }
  } else if (pattern === 'snow') {
    context.globalAlpha = 0.26;
    for (let i = 0; i < 24; i++) {
      const sx = x + Math.floor(rand(i) * 16);
      const sy = y + Math.floor(rand(i + 40) * 16);
      const wide = rand(i + 80) > 0.72;
      context.fillRect(sx, sy, wide ? 2 : 1, 1);
    }
  } else if (pattern === 'grassBlade') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = accent;
    for (let i = 0; i < 8; i++) {
      const bx = x + 1 + i * 2;
      context.fillRect(bx, y + 5 + Math.floor(rand(i) * 4), 1, 10);
    }
  } else if (pattern === 'flower') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 7, y + 6, 2, 9);
    context.fillStyle = accent;
    context.fillRect(x + 6, y + 3, 4, 4);
    context.fillRect(x + 4, y + 5, 3, 3);
    context.fillRect(x + 9, y + 5, 3, 3);
  } else if (pattern === 'cobble') {
    context.globalAlpha = 0.5;
    context.strokeStyle = accent;
    context.strokeRect(x + 1, y + 1, 6, 5);
    context.strokeRect(x + 8, y + 1, 7, 6);
    context.strokeRect(x + 2, y + 7, 7, 7);
    context.strokeRect(x + 10, y + 8, 5, 6);
  } else if (pattern === 'birchBark') {
    context.globalAlpha = 0.75;
    for (let i = 0; i < 7; i++) {
      context.fillRect(
        x + Math.floor(rand(i) * 14),
        y + 1 + Math.floor(rand(i + 30) * 14),
        3 + Math.floor(rand(i + 60) * 4),
        1,
      );
    }
  } else if (pattern === 'mossyCobble') {
    context.globalAlpha = 0.45;
    context.strokeStyle = '#3e423f';
    context.strokeRect(x + 1, y + 1, 6, 5);
    context.strokeRect(x + 8, y + 1, 7, 6);
    context.strokeRect(x + 2, y + 7, 7, 7);
    context.strokeRect(x + 10, y + 8, 5, 6);
    context.fillStyle = accent;
    context.globalAlpha = 0.65;
    context.fillRect(x + 1, y + 1, 5, 3);
    context.fillRect(x + 9, y + 8, 4, 5);
  } else if (pattern === 'bricks') {
    context.globalAlpha = 0.62;
    context.fillRect(x, y + 4, 16, 1);
    context.fillRect(x, y + 9, 16, 1);
    context.fillRect(x, y + 14, 16, 1);
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 0 ? 0 : 5;
      for (let bx = -offset; bx < 16; bx += 8) context.fillRect(x + bx, y + row * 5, 1, 5);
    }
  } else if (pattern === 'glass') {
    context.globalAlpha = 0.45;
    context.strokeStyle = accent;
    context.strokeRect(x + 1, y + 1, 14, 14);
    context.fillRect(x + 4, y + 3, 1, 7);
    context.fillRect(x + 8, y + 2, 1, 4);
  } else if (pattern === 'cactus') {
    context.globalAlpha = 0.5;
    context.fillRect(x + 3, y, 1, 16);
    context.fillRect(x + 12, y, 1, 16);
    for (let i = 0; i < 7; i++)
      context.fillRect(x + 5 + Math.floor(rand(i) * 6), y + Math.floor(rand(i + 20) * 16), 1, 1);
  } else if (pattern === 'pumpkin') {
    context.globalAlpha = 0.65;
    context.fillRect(x + 3, y, 1, 16);
    context.fillRect(x + 8, y, 1, 16);
    context.fillRect(x + 13, y, 1, 16);
    context.fillStyle = '#3b5c21';
    context.fillRect(x + 7, y, 2, 3);
  } else if (pattern === 'mushroom') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 7, y + 8, 2, 7);
    context.fillStyle = accent;
    context.fillRect(x + 4, y + 4, 8, 5);
    context.fillRect(x + 6, y + 2, 4, 3);
  } else if (pattern === 'berries') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 4, y + 5, 8, 10);
    context.fillStyle = accent;
    context.fillRect(x + 5, y + 6, 2, 2);
    context.fillRect(x + 10, y + 8, 2, 2);
    context.fillRect(x + 7, y + 11, 2, 2);
  }
  context.globalAlpha = 1;
}

function requestChunk(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  if (chunks.has(key) || requested.has(key)) return;
  requested.add(key);
  loadSavedChunk(key)
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
    rebuildFarTerrain(pcx, pcz);
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
      removeWildlifeForChunk(key);
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
    camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
    return;
  }
}

function rebuildFarTerrain(pcx: number, pcz: number): void {
  for (const child of farTerrain.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
  }
  farTerrain.clear();

  const step = 4;
  const patchChunkSpan = 2;
  const ringMin = DETAIL_RADIUS - 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let cz = pcz - FAR_RADIUS; cz <= pcz + FAR_RADIUS; cz += patchChunkSpan) {
    for (let cx = pcx - FAR_RADIUS; cx <= pcx + FAR_RADIUS; cx += patchChunkSpan) {
      const d = Math.hypot(cx + patchChunkSpan * 0.5 - pcx, cz + patchChunkSpan * 0.5 - pcz);
      if (d < ringMin || d > FAR_RADIUS) continue;
      appendFarPatch(cx, cz, step, patchChunkSpan, positions, colors, indices);
    }
  }

  if (positions.length === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  farTerrain.add(new THREE.Mesh(geo, farMaterial));
}

function appendFarPatch(
  cx: number,
  cz: number,
  step: number,
  chunkSpan: number,
  positions: number[],
  colors: number[],
  indices: number[],
): void {
  const baseVertex = positions.length / 3;
  const patchSize = CHUNK_SIZE * chunkSpan;
  const verts = patchSize / step + 1;
  for (let z = 0; z <= patchSize; z += step) {
    for (let x = 0; x <= patchSize; x += step) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed) + 0.02;
      positions.push(wx, h, wz);
      const surface = generatedBlockAt(wx, Math.max(0, Math.floor(h)), wz, seed);
      const color = blockColor(surface === Block.Air ? Block.Grass : surface);
      const variation = 0.9 + terrainColorNoise(wx, wz) * 0.18;
      colors.push(
        color[0] * 0.76 * variation,
        color[1] * 0.82 * variation,
        color[2] * 0.88 * variation,
      );
    }
  }
  for (let z = 0; z < verts - 1; z++) {
    for (let x = 0; x < verts - 1; x++) {
      const a = baseVertex + x + verts * z;
      indices.push(a, a + 1, a + verts, a + 1, a + verts + 1, a + verts);
    }
  }
}

function terrainColorNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.01) * 43758.5453;
  return n - Math.floor(n);
}

function wildlifeHash(x: number, z: number, salt: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7 + seed * 0.013) * 43758.5453;
  return n - Math.floor(n);
}

function spawnWildlifeForChunk(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  if (wildlife.has(key)) return;
  const animals: Wildlife[] = [];
  const count = wildlifeHash(cx, cz, 1) > 0.64 ? 1 + Math.floor(wildlifeHash(cx, cz, 2) * 3) : 0;
  for (let i = 0; i < count; i++) {
    const wx = cx * CHUNK_SIZE + 2 + wildlifeHash(cx, cz, i * 5 + 3) * (CHUNK_SIZE - 4);
    const wz = cz * CHUNK_SIZE + 2 + wildlifeHash(cx, cz, i * 5 + 4) * (CHUNK_SIZE - 4);
    const h = terrainHeight(wx, wz, seed);
    const surface = generatedBlockAt(Math.floor(wx), h, Math.floor(wz), seed);
    if (surface !== Block.Grass && surface !== Block.Snow && surface !== Block.Sand) continue;
    const biome = biomeAt(wx, wz, seed);
    const roll = wildlifeHash(cx, cz, i * 5 + 5);
    const kind: WildlifeKind =
      biome === 'dry'
        ? roll > 0.58
          ? 'bird'
          : 'rabbit'
        : biome === 'forest'
          ? roll > 0.72
            ? 'boar'
            : roll > 0.38
              ? 'fox'
              : 'deer'
          : biome === 'snow'
            ? roll > 0.52
              ? 'fox'
              : 'rabbit'
            : roll > 0.72
              ? 'deer'
              : roll > 0.36
                ? 'rabbit'
                : 'bird';
    const root = makeWildlifeMesh(kind);
    root.position.set(wx, kind === 'bird' ? h + 3.2 : h, wz);
    scene.add(root);
    const heading = wildlifeHash(cx, cz, i * 5 + 6) * Math.PI * 2;
    const target = new THREE.Vector3(
      wx + Math.sin(heading) * (3 + wildlifeHash(cx, cz, i * 5 + 8) * 5),
      0,
      wz + Math.cos(heading) * (3 + wildlifeHash(cx, cz, i * 5 + 9) * 5),
    );
    animals.push({
      key,
      kind,
      root,
      home: root.position.clone(),
      target,
      heading,
      speed:
        kind === 'bird'
          ? 2.3
          : kind === 'rabbit' || kind === 'fox'
            ? 1.15
            : kind === 'boar'
              ? 0.62
              : 0.72,
      phase: wildlifeHash(cx, cz, i * 5 + 7) * Math.PI * 2,
      nextTargetAt: 0,
      turnSpeed: kind === 'bird' || kind === 'rabbit' ? 3.8 : 2.4,
      legs: root.userData.legs as THREE.Object3D[],
      wings: root.userData.wings as THREE.Object3D[],
    });
  }
  wildlife.set(key, animals);
}

function removeWildlifeForChunk(key: ChunkKey): void {
  const animals = wildlife.get(key);
  if (!animals) return;
  for (const animal of animals) {
    scene.remove(animal.root);
    animal.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
  }
  wildlife.delete(key);
}

function makeWildlifeMesh(kind: WildlifeKind): THREE.Group {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];
  const palette: Record<WildlifeKind, [number, number, number]> = {
    rabbit: [0xd8d0bf, 0xf0eadf, 0x2b221d],
    deer: [0x9a6235, 0xd0b08a, 0x3f2a18],
    fox: [0xc45f24, 0xf2e2c8, 0x2b2018],
    boar: [0x514239, 0x8a7a66, 0x2b2420],
    bird: [0x365f86, 0xcbd7df, 0x1d2b36],
  };
  const [bodyColor, accentColor, darkColor] = palette[kind];
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: darkColor });
  const scale = kind === 'deer' ? 1.15 : kind === 'boar' ? 0.95 : kind === 'bird' ? 0.58 : 0.72;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.78 * scale),
    bodyMat,
  );
  body.position.y = 0.48 * scale;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3 * scale, 0.3 * scale, 0.3 * scale),
    bodyMat,
  );
  head.position.set(0, 0.62 * scale, 0.48 * scale);
  group.add(head);
  if (kind !== 'bird') {
    for (const sx of [-0.14, 0.14]) {
      for (const sz of [-0.24, 0.24]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.08 * scale, 0.36 * scale, 0.08 * scale),
          darkMat,
        );
        leg.position.set(sx * scale, 0.18 * scale, sz * scale);
        group.add(leg);
        legs.push(leg);
      }
    }
  }
  if (kind === 'rabbit') {
    for (const x of [-0.08, 0.08]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.07 * scale, 0.34 * scale, 0.07 * scale),
        accentMat,
      );
      ear.position.set(x * scale, 0.92 * scale, 0.52 * scale);
      group.add(ear);
    }
  } else if (kind === 'deer') {
    for (const x of [-0.1, 0.1]) {
      const antler = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * scale, 0.34 * scale, 0.04 * scale),
        darkMat,
      );
      antler.position.set(x * scale, 0.96 * scale, 0.5 * scale);
      group.add(antler);
    }
  } else if (kind === 'bird') {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.62 * scale, 0.06 * scale, 0.2 * scale),
        accentMat,
      );
      wing.position.set(sx * 0.38 * scale, 0.5 * scale, 0);
      wing.rotation.z = sx * 0.2;
      group.add(wing);
      wings.push(wing);
    }
  } else {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * scale, 0.16 * scale, 0.28 * scale),
      kind === 'fox' ? accentMat : darkMat,
    );
    tail.position.set(0, 0.54 * scale, -0.52 * scale);
    group.add(tail);
  }
  group.userData.legs = legs;
  group.userData.wings = wings;
  return group;
}

function chooseWildlifeTarget(animal: Wildlife, now: number): void {
  const spread = animal.kind === 'bird' ? 15 : animal.kind === 'deer' ? 10 : 7;
  const angle =
    wildlifeHash(animal.home.x, animal.home.z, Math.floor(now * 0.001 + animal.phase * 19)) *
    Math.PI *
    2;
  const distance =
    spread *
    (0.35 +
      wildlifeHash(animal.home.x, animal.home.z, Math.floor(now * 0.001 + animal.phase * 29) + 7) *
        0.65);
  animal.target.set(
    animal.home.x + Math.sin(angle) * distance,
    0,
    animal.home.z + Math.cos(angle) * distance,
  );
  animal.nextTargetAt =
    now + 2200 + wildlifeHash(animal.target.x, animal.target.z, animal.phase) * 3600;
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function updateWildlife(dt: number, now: number): void {
  for (const animals of wildlife.values()) {
    for (const animal of animals) {
      const t = now * 0.001 + animal.phase;
      const dx = animal.target.x - animal.root.position.x;
      const dz = animal.target.z - animal.root.position.z;
      const targetDistance = Math.hypot(dx, dz);
      if (targetDistance < 0.8 || now > animal.nextTargetAt) chooseWildlifeTarget(animal, now);

      const desiredHeading = Math.atan2(
        animal.target.x - animal.root.position.x,
        animal.target.z - animal.root.position.z,
      );
      animal.heading += Math.max(
        -animal.turnSpeed * dt,
        Math.min(animal.turnSpeed * dt, angleDelta(animal.heading, desiredHeading)),
      );
      const turnPenalty = Math.max(
        0.25,
        1 - Math.abs(angleDelta(animal.heading, desiredHeading)) / Math.PI,
      );
      const idlePulse =
        animal.kind === 'rabbit'
          ? 0.7 + Math.max(0, Math.sin(t * 2.7)) * 0.55
          : 0.85 + Math.sin(t * 0.8) * 0.15;
      const speed = animal.speed * turnPenalty * idlePulse;
      animal.root.position.x += Math.sin(animal.heading) * speed * dt;
      animal.root.position.z += Math.cos(animal.heading) * speed * dt;
      const ground = terrainHeight(animal.root.position.x, animal.root.position.z, seed);
      animal.root.position.y =
        animal.kind === 'bird' ? ground + 3 + Math.sin(t * 2.4) * 0.45 : ground;
      animal.root.rotation.y = animal.heading;

      const stride = t * speed * 9;
      animal.legs.forEach((leg, index) => {
        leg.rotation.x = Math.sin(stride + (index % 2 === 0 ? 0 : Math.PI)) * 0.45;
      });
      animal.wings.forEach((wing, index) => {
        wing.rotation.z = (index === 0 ? 1 : -1) * (0.25 + Math.sin(t * 8) * 0.45);
      });
    }
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

function blockHardness(block: Block): number {
  const tool = selectedTool();
  switch (block) {
    case Block.Grass:
    case Block.Dirt:
    case Block.Sand:
    case Block.Snow:
      return 260;
    case Block.Leaves:
    case Block.BirchLeaves:
      return 180;
    case Block.Log:
    case Block.BirchLog:
    case Block.Planks:
    case Block.CraftingTable:
      return 520;
    case Block.Cactus:
    case Block.Pumpkin:
      return 360;
    case Block.Glass:
      return 300;
    case Block.Stone:
    case Block.CoalOre:
    case Block.CopperOre:
    case Block.Furnace:
    case Block.Cobblestone:
    case Block.MossyCobblestone:
    case Block.Brick:
      return tool?.tool === 'stone_pickaxe' || tool?.tool === 'wood_pickaxe' ? 650 : 1100;
    case Block.IronOre:
      return tool?.tool === 'stone_pickaxe' ? 850 : 1500;
    case Block.GoldOre:
      return tool?.tool === 'stone_pickaxe' ? 1000 : 1700;
    case Block.DiamondOre:
      return tool?.tool === 'stone_pickaxe' ? 1300 : 2200;
    default:
      return 450;
  }
}

function remesh(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  const chunk = chunks.get(key);
  if (!chunk || dirty.has(key)) return;
  dirty.add(key);
  const copy = new Uint16Array(chunk.blocks);
  postChunkJob({ type: 'remesh', cx, cz, seed, blocks: copy }, [copy.buffer]);
}

function raycastBlock(maxDistance = 6): { block: THREE.Vector3; normal: THREE.Vector3 } | null {
  camera.getWorldDirection(rayDirection);
  const origin = camera.position;
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = Math.sign(rayDirection.x);
  const stepY = Math.sign(rayDirection.y);
  const stepZ = Math.sign(rayDirection.z);
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.x);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.y);
  const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.z);
  let tMaxX = rayIntBound(origin.x, rayDirection.x);
  let tMaxY = rayIntBound(origin.y, rayDirection.y);
  let tMaxZ = rayIntBound(origin.z, rayDirection.z);
  let distance = 0;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;

  while (distance <= maxDistance) {
    if (isSolid(getBlock(x, y, z))) {
      return {
        block: new THREE.Vector3(x, y, z),
        normal: new THREE.Vector3(normalX, normalY, normalZ),
      };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      distance = tMaxX;
      tMaxX += tDeltaX;
      normalX = -stepX;
      normalY = 0;
      normalZ = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      distance = tMaxY;
      tMaxY += tDeltaY;
      normalX = 0;
      normalY = -stepY;
      normalZ = 0;
    } else {
      z += stepZ;
      distance = tMaxZ;
      tMaxZ += tDeltaZ;
      normalX = 0;
      normalY = 0;
      normalZ = -stepZ;
    }
  }
  return null;
}

function rayIntBound(origin: number, direction: number): number {
  if (direction > 0) return (Math.floor(origin + 1) - origin) / direction;
  if (direction < 0) return (origin - Math.floor(origin)) / -direction;
  return Number.POSITIVE_INFINITY;
}

function collides(position: THREE.Vector3): boolean {
  const half = player.width / 2;
  const minX = Math.floor(position.x - half);
  const maxX = Math.floor(position.x + half);
  const minY = Math.floor(position.y);
  const maxY = Math.floor(position.y + player.height);
  const minZ = Math.floor(position.z - half);
  const maxZ = Math.floor(position.z + half);
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (isSolid(getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

function moveAxis(axis: 'x' | 'y' | 'z', amount: number): void {
  if (amount === 0) return;
  const next = player.position.clone();
  next[axis] += amount;
  if (!collides(next)) {
    player.position.copy(next);
    return;
  }
  const sign = Math.sign(amount);
  while (Math.abs(amount) > 0.001) {
    const tiny = Math.min(Math.abs(amount), 0.02) * sign;
    const test = player.position.clone();
    test[axis] += tiny;
    if (collides(test)) break;
    player.position.copy(test);
    amount -= tiny;
  }
  player.velocity[axis] = 0;
  if (axis === 'y' && sign < 0) player.onGround = true;
}

function updatePlayer(dt: number): void {
  if (inventoryOpen) {
    player.velocity.x += (0 - player.velocity.x) * Math.min(1, dt * 14);
    player.velocity.z += (0 - player.velocity.z) * Math.min(1, dt * 14);
    camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
    return;
  }
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const speed = keys.has('ShiftLeft') ? 8.5 : 5.2;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const wishX = (strafe * cos - forward * sin) * speed;
  const wishZ = (-forward * cos - strafe * sin) * speed;
  player.velocity.x += (wishX - player.velocity.x) * Math.min(1, dt * 12);
  player.velocity.z += (wishZ - player.velocity.z) * Math.min(1, dt * 12);
  player.velocity.y -= 22 * dt;
  if (keys.has('Space') && player.onGround) {
    player.velocity.y = 8.2;
    player.onGround = false;
  }
  moveAxis('x', player.velocity.x * dt);
  moveAxis('z', player.velocity.z * dt);
  player.onGround = false;
  moveAxis('y', player.velocity.y * dt);

  camera.position.set(player.position.x, player.position.y + player.eye, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function updateHighlight(): void {
  if (inventoryOpen) {
    highlight.visible = false;
    placePreview.visible = false;
    return;
  }
  const hit = raycastBlock();
  highlight.visible = Boolean(hit);
  placePreview.visible = false;
  if (hit) {
    highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
    updatePlacePreview(hit);
  }
}

function updatePlacePreview(hit: { block: THREE.Vector3; normal: THREE.Vector3 }): void {
  const block = selectedPlaceBlock();
  if (block === null) return;
  const item = selectedPlaceItem();
  if (item && inventory[item] <= 0) return;

  const place = hit.block.clone().add(hit.normal);
  if (getBlock(place.x, place.y, place.z) !== Block.Air) return;
  if (wouldIntersectPlayer(place)) return;

  const [r, g, b] = blockColor(block);
  placePreviewMaterial.color.setRGB(r, g, b);
  placePreview.position.set(place.x + 0.5, place.y + 0.5, place.z + 0.5);
  placePreview.visible = true;
}

function wouldIntersectPlayer(block: THREE.Vector3): boolean {
  const half = player.width / 2;
  const minX = player.position.x - half;
  const maxX = player.position.x + half;
  const minY = player.position.y;
  const maxY = player.position.y + player.height;
  const minZ = player.position.z - half;
  const maxZ = player.position.z + half;
  return (
    block.x < maxX &&
    block.x + 1 > minX &&
    block.y < maxY &&
    block.y + 1 > minY &&
    block.z < maxZ &&
    block.z + 1 > minZ
  );
}

function startMining(hit: { block: THREE.Vector3 }): void {
  if (inventoryOpen) return;
  mining.active = true;
  mining.block.copy(hit.block);
  mining.startedAt = performance.now();
  mining.lastSwingAt = mining.startedAt;
  mining.duration = blockHardness(getBlock(hit.block.x, hit.block.y, hit.block.z));
  mining.progress = 0;
  crackOverlay.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
  crackOverlay.visible = true;
  drawCracks(0);
  triggerHandSwing('mine');
}

function stopMining(): void {
  mining.active = false;
  mining.progress = 0;
  crackOverlay.visible = false;
}

function updateMining(now: number): void {
  if (!mining.active) return;
  const hit = raycastBlock();
  if (
    !hit ||
    !hit.block.equals(mining.block) ||
    getBlock(mining.block.x, mining.block.y, mining.block.z) === Block.Air
  ) {
    stopMining();
    return;
  }
  mining.progress = Math.min(1, (now - mining.startedAt) / mining.duration);
  if (now - mining.lastSwingAt > 190) {
    mining.lastSwingAt = now;
    triggerHandSwing('mine');
  }
  crackOverlay.position.set(mining.block.x + 0.5, mining.block.y + 0.5, mining.block.z + 0.5);
  crackOverlay.visible = true;
  drawCracks(mining.progress);
  if (mining.progress >= 1) {
    const block = getBlock(mining.block.x, mining.block.y, mining.block.z);
    addItem(blockToItem(block), 1);
    setBlock(mining.block.x, mining.block.y, mining.block.z, Block.Air);
    stopMining();
  }
}

function drawCracks(progress: number): void {
  const context = crackCanvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, crackCanvas.width, crackCanvas.height);
  if (progress <= 0) {
    crackTexture.needsUpdate = true;
    return;
  }

  const stages = Math.ceil(progress * 7);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = `rgba(18, 15, 12, ${0.35 + progress * 0.45})`;
  context.lineWidth = 4;

  const cracks = [
    [
      [64, 64],
      [46, 54],
      [30, 42],
      [18, 34],
    ],
    [
      [64, 64],
      [78, 48],
      [90, 28],
      [100, 14],
    ],
    [
      [64, 64],
      [78, 72],
      [96, 80],
      [116, 86],
    ],
    [
      [64, 64],
      [52, 78],
      [42, 96],
      [32, 116],
    ],
    [
      [46, 54],
      [42, 70],
      [30, 76],
    ],
    [
      [78, 72],
      [82, 92],
      [92, 106],
    ],
    [
      [78, 48],
      [94, 56],
      [108, 54],
    ],
  ];

  for (let i = 0; i < stages; i++) {
    const points = cracks[i];
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  crackTexture.needsUpdate = true;
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
  pollGpuTimer();
  frame++;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateChunkSet();
  flushRequests();
  updateLoadingState();
  if (worldReady) {
    updatePlayer(dt);
  }
  sky.position.copy(camera.position);
  updateHand(now);
  if (worldReady) {
    updateWildlife(dt, now);
    updateHighlight();
    updateMining(now);
  } else {
    highlight.visible = false;
    placePreview.visible = false;
    crackOverlay.visible = false;
  }
  fadeChunks();
  statsEl.textContent = `Seed ${seed} / Chunks ${chunks.size} / queued ${pendingQueue.length} / selected ${selectedEntry().label}`;
  const renderStartedAt = performance.now();
  beginGpuTimer();
  renderer.render(scene, camera);
  endGpuTimer();
  const frameEndedAt = performance.now();
  recordDiagnosticsSample(
    frameMs,
    renderStartedAt - frameStartedAt,
    frameEndedAt - renderStartedAt,
  );
  updateDiagnosticsOverlay(frameEndedAt);
  requestAnimationFrame(tick);
}

document.addEventListener('keydown', (event) => {
  if (event.code === 'F3') {
    event.preventDefault();
    setDiagnosticsOpen(!diagnosticsOpen);
    return;
  }
  if (!worldStarted && event.code !== 'Tab') return;
  if (event.code === 'KeyE') {
    event.preventDefault();
    inventoryOpen = !inventoryOpen;
    stopMining();
    if (inventoryOpen && document.pointerLockElement === renderer.domElement)
      document.exitPointerLock();
    paintInventoryOverlay();
    return;
  }
  if (event.code === 'Escape' && inventoryOpen) {
    inventoryOpen = false;
    paintInventoryOverlay();
    return;
  }
  keys.add(event.code);
  const numericSlot = event.key === '0' ? 9 : Number(event.key) - 1;
  const extraSlot = event.code === 'Minus' ? 10 : event.code === 'Equal' ? 11 : -1;
  const slot = extraSlot >= 0 ? extraSlot : numericSlot;
  if (slot >= 0 && slot < hotbarEntries.length) {
    selectedHotbarIndex = slot;
    paintHotbar();
    rebuildHeldItem();
  }
});

document.addEventListener('keyup', (event) => keys.delete(event.code));

renderer.domElement.addEventListener('click', () => {
  if (!worldReady || inventoryOpen) return;
  if (!mouse.locked) {
    renderer.domElement.requestPointerLock().catch(() => {
      mouse.locked = false;
    });
  }
});

document.addEventListener('pointerlockchange', () => {
  mouse.locked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener('mousemove', (event) => {
  if (!worldReady || !mouse.locked) return;
  player.yaw -= event.movementX * 0.0024;
  player.pitch -= event.movementY * 0.0024;
  player.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, player.pitch));
});

document.addEventListener('mousedown', (event) => {
  if (!worldReady || !mouse.locked || inventoryOpen) return;
  const hit = raycastBlock();
  if (!hit) return;
  if (event.button === 0) {
    startMining(hit);
  } else if (event.button === 2) {
    stopMining();
    const block = selectedPlaceBlock();
    if (block === null) {
      triggerHandSwing('place');
      return;
    }
    const item = selectedPlaceItem();
    if (item && inventory[item] <= 0) return;
    const place = hit.block.clone().add(hit.normal);
    if (getBlock(place.x, place.y, place.z) !== Block.Air || wouldIntersectPlayer(place)) return;
    setBlock(place.x, place.y, place.z, block);
    triggerHandSwing('place');
    if (item) addItem(item, -1);
  }
});

document.addEventListener('mouseup', (event) => {
  if (event.button === 0) stopMining();
});

window.addEventListener('blur', stopMining);

document.addEventListener('contextmenu', (event) => event.preventDefault());

startFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  startWorld(seedInputEl.value);
});

seedInputEl.addEventListener('input', updateSeedPreview);

randomSeedEl.addEventListener('click', () => {
  seedInputEl.value = randomSeedText();
  updateSeedPreview();
});

hud.querySelectorAll<HTMLButtonElement>('[data-seed-preset]').forEach((button) => {
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
