import { Block, CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from './types';
import { addSurfaceDetails } from './terrainSurfaceDetails';
import {
  addRavines,
  isRavineBlock,
  addFloatingIslands,
  addVolcanicLavaLakes,
  addGiantMushrooms,
  addMushroomSurfaceDetails,
  addTrees,
  addOceanReservoirs,
  addInlandWater,
} from './terrain/structures';

export type Biome = 'plains' | 'forest' | 'hills' | 'beach' | 'snow' | 'dry' | 'volcanic' | 'mushroom';
type UndergroundBiome = 'crystal' | 'lush' | 'lava' | 'none';

const TERRAIN_BASE_ELEVATION = 38;
export const OCEAN_SURFACE_Y = TERRAIN_BASE_ELEVATION + 4;
const UNDERGROUND_DETAIL_PATCH_SCALE = 96;
const UNDERGROUND_DETAIL_PATCH_THRESHOLD = 0.6;

export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ Math.imul(seed, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, z: number, scale: number, seed: number): number {
  const nx = x / scale;
  const nz = z / scale;
  const x0 = Math.floor(nx);
  const z0 = Math.floor(nz);
  const fx = smooth(nx - x0);
  const fz = smooth(nz - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const x1 = a + (b - a) * fx;
  const x2 = c + (d - c) * fx;
  return x1 + (x2 - x1) * fz;
}

export function terrainHeight(x: number, z: number, seed: number): number {
  const biome = biomeAt(x, z, seed);

  // Continentalness: large-scale landform shape (-1 to 1)
  const cont = valueNoise(x, z, 320, seed + 51) * 2 - 1;
  // Erosion: controls how rugged vs flat the terrain is (0 to 1, high = flat)
  const erosion = valueNoise(x + 5000, z - 3000, 240, seed + 61);

  // Detail noise octaves (centered around 0)
  const broad = (valueNoise(x, z, 96, seed) - 0.5) * 2;
  const mid = (valueNoise(x + 2000, z - 900, 32, seed) - 0.5) * 2;
  const fine = (valueNoise(x - 800, z + 1400, 13, seed) - 0.5) * 2;

  // Amplitude depends on biome and erosion
  let broadAmp: number, midAmp: number;
  if (biome === 'hills') {
    broadAmp = 30;
    midAmp = 15;
  } else if (biome === 'volcanic') {
    broadAmp = 28;
    midAmp = 14;
  } else if (biome === 'mushroom') {
    broadAmp = 8;
    midAmp = 4;
  } else if (biome === 'plains' || biome === 'dry') {
    broadAmp = 10;
    midAmp = 5;
  } else {
    broadAmp = 18;
    midAmp = 9;
  }

  // High erosion flattens the terrain further
  const flatness = erosion * erosion;
  broadAmp *= (1 - flatness * 0.6);
  midAmp *= (1 - flatness * 0.6);
  const fineAmp = 3 * (1 - flatness * 0.5);

  // Continentalness shifts the base elevation
  // Positive cont → highlands/plateaus, negative cont → valleys/lowlands
  const contShift = cont > 0
    ? cont * cont * 28
    : -(cont * cont) * 10;

  const base = TERRAIN_BASE_ELEVATION;
  const h = base + contShift + broad * broadAmp + mid * midAmp + fine * fineAmp;
  return Math.max(8, Math.min(WORLD_HEIGHT - 8, Math.floor(h)));
}

export function reservoirWaterSurfaceAt(x: number, z: number, seed: number): number | null {
  const h = terrainHeight(x, z, seed);
  if (h <= OCEAN_SURFACE_Y) return OCEAN_SURFACE_Y;
  if (h <= OCEAN_SURFACE_Y + 2 || h > OCEAN_SURFACE_Y + 18) return null;
  const lakeVal = valueNoise(x + 2111, z - 1333, OCEAN_SURFACE_Y, seed + 501);
  if (lakeVal < 0.82) return null;
  const n = terrainHeight(x, z + 1, seed);
  const s = terrainHeight(x, z - 1, seed);
  const e = terrainHeight(x + 1, z, seed);
  const w = terrainHeight(x - 1, z, seed);
  if ((n + s + e + w) / 4 <= h + 1.5) return null;
  return Math.min(h + 2, OCEAN_SURFACE_Y + 4);
}

function valueNoise3D(x: number, y: number, z: number, scale: number, seed: number): number {
  const nx = x / scale;
  const ny = y / scale;
  const nz = z / scale;
  const x0 = Math.floor(nx);
  const y0 = Math.floor(ny);
  const z0 = Math.floor(nz);
  const fx = smooth(nx - x0);
  const fy = smooth(ny - y0);
  const fz = smooth(nz - z0);
  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const xy0 = x00 + (x10 - x00) * fy;
  const xy1 = x01 + (x11 - x01) * fy;
  return xy0 + (xy1 - xy0) * fz;
}

function isCaveBlock(wx: number, y: number, wz: number, h: number, seed: number): boolean {
  // caves start below the dirt layer and stop above bedrock
  if (y >= h - 4 || y < 5) return false;

  // caverns — primary open spaces, more common at mid-depths, tapered at top/bottom
  const cavern = valueNoise3D(wx, y * 0.7, wz, 64, seed + 401);
  const depthFactor = Math.sin((y / WORLD_HEIGHT) * Math.PI) * 1.05;
  if (cavern > 0.77 - depthFactor * 0.045) return true;

  // worm tunnels — narrow, connected paths (primary direction)
  const wx1 = valueNoise3D(wx + 300, y * 1.1, wz - 300, 18, seed + 411);
  const wy1 = valueNoise3D(wx - 300, y * 1.1, wz + 300, 18, seed + 413);
  const worm = Math.min(wx1, wy1);
  if (worm > 0.515 && worm < 0.585) return true;

  // secondary worm tunnels — different scale and orientation for path variety
  const wx2 = valueNoise3D(wx + 800, y * 0.9, wz + 600, 22, seed + 415);
  const wy2 = valueNoise3D(wx - 600, y * 0.9, wz - 800, 22, seed + 417);
  const worm2 = Math.max(wx2, wy2);
  if (worm2 > 0.52 && worm2 < 0.56) return true;

  // surface entrances — caves that reach upward near the surface
  if (y >= h - 12 && y < h - 4) {
    const entrance = valueNoise3D(wx, y * 1.5, wz, 14, seed + 431);
    if (entrance > 0.82 && cavern > 0.65) return true;
  }

  // occasional rooms — modest chambers at mid-depth, rare enough to feel special
  if (y > 24 && y < 52) {
    const chamber = valueNoise3D(wx + 500, y * 0.6 - 200, wz + 500, 48, seed + 441);
    if (chamber > 0.86) return true;
  }

  return false;
}

function undergroundBiomeAt(x: number, y: number, z: number, seed: number): UndergroundBiome {
  const v = valueNoise3D(x + 1000, y * 0.5, z - 1000, 160, seed + 601);
  const t = valueNoise3D(x - 2000, y * 0.4, z + 2000, 200, seed + 611);
  if (y < 16 && v < 0.18 && t > 0.78) return 'lava';
  if (v > 0.82 && t < 0.35) return 'crystal';
  if (v < 0.22 && t > 0.65 && y < 45) return 'lush';
  return 'none';
}

function undergroundStoneBlock(x: number, y: number, z: number, seed: number): Block {
  const ub = undergroundBiomeAt(x, y, z, seed);
  if (ub === 'none') return Block.Stone;
  const patch = valueNoise3D(x, y * 0.6, z, UNDERGROUND_DETAIL_PATCH_SCALE, seed + 691);
  if (patch < UNDERGROUND_DETAIL_PATCH_THRESHOLD) return Block.Stone;
  const detail = hash3(x, y, z, seed + 701);
  if (ub === 'crystal' && detail > 0.982) return Block.Amethyst;
  if (ub === 'lush' && detail > 0.975) return Block.MossBlock;
  if (ub === 'lava' && detail > 0.965) return Block.Basalt;
  return Block.Stone;
}

/** Per-block check: would this position be carved by a mineshaft corridor? */
function isMineshaftBlock(wx: number, y: number, wz: number, seed: number): boolean {
  // Corridors exist at baseY=20..40, carve 3 tall, so affected range is y=20..42
  if (y < 20 || y > 42) return false;
  const h = terrainHeight(wx, wz, seed);
  for (let baseY = Math.max(20, y - 2); baseY <= Math.min(40, y); baseY++) {
    if (!isMineshaftCorridor(wx, baseY, wz, seed)) continue;
    if (baseY >= h - 4) continue;
    // Support pillars at intersections are NOT carved
    const localX = ((wx % 5) + 5) % 5;
    const localZ = ((wz % 5) + 5) % 5;
    if (localX === 2 && localZ === 2) return false;
    return true;
  }
  return false;
}

/** Per-block check: would this position be the Air interior of a dungeon? */
function isDungeonInterior(wx: number, y: number, wz: number, seed: number): boolean {
  for (let dgx = -1; dgx <= 1; dgx++) {
    for (let dgz = -1; dgz <= 1; dgz++) {
      const probe = dungeonCenter(wx + dgx * 48, wz + dgz * 48, seed);
      if (!probe) continue;
      const dx = wx - probe.cx;
      const dz = wz - probe.cz;
      const dy = y - probe.y;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2 || dy < 0 || dy > 4) continue;
      const isWall = Math.abs(dx) === 2 || Math.abs(dz) === 2 || dy === 0 || dy === 4;
      if (!isWall) return true;
    }
  }
  return false;
}

export function generatedBlockAt(x: number, y: number, z: number, seed: number): Block {
  if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
  const h = terrainHeight(x, z, seed);
  if (y > h) {
    const waterSurface = reservoirWaterSurfaceAt(x, z, seed);
    if (waterSurface !== null && y <= waterSurface) return Block.Water;
    return Block.Air;
  }

  // Carving checks must run before surface/subsurface returns so that
  // ravines, mineshafts, and dungeons that reach up to the surface are
  // correctly reported as Air for cross-chunk neighbor lookups.
  if (y <= h && y >= 5) {
    if (isCaveBlock(x, y, z, h, seed)) return Block.Air;
    if (isRavineBlock(x, y, z, seed)) return Block.Air;
    if (isMineshaftBlock(x, y, z, seed)) return Block.Air;
    if (isDungeonInterior(x, y, z, seed)) return Block.Air;
  }

  if (y === h) {
    return surfaceBlockAt(x, z, h, seed);
  }
  if (y > h - 4) return subsurfaceBlockAt(x, z, h, seed);

  const ore = valueNoise(x * 1.7 + y * 0.9, z * 1.7 - y * 0.6, 9, seed + 31);
  const deepOre = valueNoise(x * 2.1 - y * 0.7, z * 2.1 + y * 0.8, 7, seed + 37);
  if (y < 42 && ore > 0.86) return Block.CoalOre;
  if (y < 45 && deepOre > 0.845 && deepOre < 0.865) return Block.CopperOre;
  if (y < 32 && ore > 0.782 && ore < 0.802) return Block.IronOre;
  if (y < 22 && deepOre > 0.747 && deepOre < 0.76) return Block.GoldOre;
  if (y < 14 && ore > 0.739 && ore < 0.745) return Block.DiamondOre;
  if (valueNoise(x + y * 3, z - y * 2, 18, seed + 91) > 0.91) return Block.Gravel;
  return undergroundStoneBlock(x, y, z, seed);
}

export function biomeAt(x: number, z: number, seed: number): Biome {
  const moisture = valueNoise(x + 3000, z - 1000, 180, seed + 201);
  const temp = valueNoise(x - 1400, z + 2600, 220, seed + 211);
  const rough = valueNoise(x + 700, z + 700, 150, seed + 221);
  const exotic = valueNoise(x - 4000, z + 4000, 280, seed + 231);
  const h = terrainHeightBase(x, z, seed);
  if (h < 30) return 'beach';
  if (exotic > 0.82 && temp > 0.6 && h > 36) return 'volcanic';
  if (exotic < 0.14 && moisture > 0.5 && h > 34 && h < 50) return 'mushroom';
  if (temp < 0.28 && h > 40) return 'snow';
  if (rough > 0.65 && h > 44) return 'hills';
  if (moisture > 0.62) return 'forest';
  if (temp > 0.68 && moisture < 0.44) return 'dry';
  return 'plains';
}

function terrainHeightBase(x: number, z: number, seed: number): number {
  const cont = valueNoise(x, z, 320, seed + 51) * 2 - 1;
  const broad = (valueNoise(x, z, 96, seed) - 0.5) * 2;
  const mid = (valueNoise(x + 2000, z - 900, 32, seed) - 0.5) * 2;
  const fine = (valueNoise(x - 800, z + 1400, 13, seed) - 0.5) * 2;
  const contShift = cont > 0 ? cont * cont * 28 : -(cont * cont) * 10;
  return Math.floor(TERRAIN_BASE_ELEVATION + contShift + broad * 18 + mid * 9 + fine * 3);
}

function surfaceBlockAt(x: number, z: number, h: number, seed: number): Block {
  const biome = biomeAt(x, z, seed);
  const biomeEdge = valueNoise(x + 4111, z - 3111, 140, seed + 251);
  const nearBorder = biomeEdge > 0.75 || biomeEdge < 0.25;

  // Variable-width shoreline: softer beach transition
  if (h <= OCEAN_SURFACE_Y + 3) {
    if (h <= OCEAN_SURFACE_Y + 1) {
      return valueNoise(x, z, 11, seed + 17) > 0.78 ? Block.Clay : Block.Sand;
    }
    // Transition zone: mix sand and grass based on height
    if (h === OCEAN_SURFACE_Y + 2) {
      return valueNoise(x, z, 7, seed + 43) > 0.55 ? Block.Sand : Block.Grass;
    }
    if (h === OCEAN_SURFACE_Y + 3) {
      return valueNoise(x, z, 7, seed + 43) > 0.72 ? Block.Sand : Block.Grass;
    }
  }
  if (biome === 'snow') return Block.Snow;
  if (biome === 'dry') return valueNoise(x, z, 14, seed + 19) > 0.58 ? Block.Sand : Block.Grass;
  if (biome === 'volcanic') {
    const v = valueNoise(x, z, 12, seed + 27);
    if (v > 0.82) return Block.Obsidian;
    return Block.Basalt;
  }
  if (biome === 'mushroom') return Block.Mycelium;
  if (biome === 'hills' && h > 55)
    return valueNoise(x, z, 10, seed + 23) > 0.55 ? Block.Stone : Block.Gravel;
  if (nearBorder && h > OCEAN_SURFACE_Y + 3) {
    const mixVal = valueNoise(x, z, 9, seed + 47);
    if (biome === 'forest' && mixVal > 0.82) return Block.Gravel;
    if (biome === 'plains' && mixVal > 0.85) return Block.Sand;
    if (biome === 'hills' && mixVal > 0.80) return Block.Grass;
  }
  return Block.Grass;
}

function subsurfaceBlockAt(x: number, z: number, h: number, seed: number): Block {
  const surface = surfaceBlockAt(x, z, h, seed);
  if (surface === Block.Sand) return Block.Sand;
  if (surface === Block.Clay) return Block.Clay;
  if (surface === Block.Snow) return Block.Dirt;
  if (surface === Block.Stone || surface === Block.Gravel) return Block.Stone;
  if (surface === Block.Basalt || surface === Block.Obsidian) return Block.Basalt;
  if (surface === Block.Mycelium) return Block.Dirt;
  return Block.Dirt;
}


export function makeChunkBlocks(cx: number, cz: number, seed: number): Uint16Array {
  const blocks = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)] = generatedBlockAt(wx, y, wz, seed);
      }
    }
  }
  addUndergroundFeatures(blocks, cx, cz, seed);
  addRavines(blocks, cx, cz, seed);
  addOceanReservoirs(blocks, cx, cz, seed, OCEAN_SURFACE_Y);
  addInlandWater(blocks, cx, cz, seed, OCEAN_SURFACE_Y);
  addTrees(blocks, cx, cz, seed);
  addGiantMushrooms(blocks, cx, cz, seed);
  addSurfaceDetails(blocks, cx, cz, seed);
  addMushroomSurfaceDetails(blocks, cx, cz, seed);
  addVolcanicLavaLakes(blocks, cx, cz, seed);
  addFloatingIslands(blocks, cx, cz, seed);
  return blocks;
}


function addUndergroundFeatures(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let y = 5; y < 60; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = blockIndex(x, y, z);
        const block = blocks[i] as Block;
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;

        if (block === Block.Air) {
          const ub = undergroundBiomeAt(wx, y, wz, seed);
          const below = y > 0 ? (blocks[blockIndex(x, y - 1, z)] as Block) : Block.Stone;
          const above = y < WORLD_HEIGHT - 1 ? (blocks[blockIndex(x, y + 1, z)] as Block) : Block.Stone;
          const detail = hash3(wx, y, wz, seed + 721);

          if (ub === 'crystal') {
            if (above === Block.Stone || above === Block.Amethyst) {
              if (detail > 0.975) blocks[i] = Block.AmethystCluster;
            }
          } else if (ub === 'lush') {
            if (below === Block.Stone || below === Block.MossBlock) {
              if (detail > 0.965) blocks[i] = Block.GlowBerry;
            }
          } else if (ub === 'lava') {
            if (below !== Block.Air && below !== Block.Lava && detail > 0.94 && y < 10) {
              blocks[i] = Block.Lava;
            }
          }
          continue;
        }
      }
    }
  }

  addMineshafts(blocks, cx, cz, seed);
  addDungeons(blocks, cx, cz, seed);
}

function isMineshaftCorridor(wx: number, y: number, wz: number, seed: number): boolean {
  if (y < 20 || y > 40) return false;
  const gridX = Math.floor(wx / 5);
  const gridZ = Math.floor(wz / 5);
  const localX = ((wx % 5) + 5) % 5;
  const localZ = ((wz % 5) + 5) % 5;
  const hX = hash2(gridX, y * 3 + 1, seed + 801);
  const hZ = hash2(gridZ + 5000, y * 3 + 1, seed + 811);
  const isXCorridor = hX > 0.8 && localZ === 2;
  const isZCorridor = hZ > 0.8 && localX === 2;
  return isXCorridor || isZCorridor;
}

function addMineshafts(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let y = 20; y <= 40; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        if (!isMineshaftCorridor(wx, y, wz, seed)) continue;
        const h = terrainHeight(wx, wz, seed);
        if (y >= h - 4) continue;
        const i = blockIndex(x, y, z);
        const block = blocks[i] as Block;
        if (block === Block.Air || block === Block.Water || block === Block.Lava) continue;

        // Carve 3-tall corridor
        for (let dy = 0; dy < 3 && y + dy < WORLD_HEIGHT; dy++) {
          const ci = blockIndex(x, y + dy, z);
          const cb = blocks[ci] as Block;
          if (cb !== Block.Air && cb !== Block.Water && cb !== Block.Lava) {
            blocks[ci] = Block.Air;
          }
        }

        // Support pillars: oak logs at intersections every 5 blocks
        const localX = ((wx % 5) + 5) % 5;
        const localZ = ((wz % 5) + 5) % 5;
        if (localX === 2 && localZ === 2) {
          for (let dy = 0; dy < 3 && y + dy < WORLD_HEIGHT; dy++) {
            blocks[blockIndex(x, y + dy, z)] = Block.Log;
          }
          if (y + 3 < WORLD_HEIGHT) {
            blocks[blockIndex(x, y + 3, z)] = Block.Planks;
          }
        }

        // Rails: planks floor at intervals
        if (hash3(wx, y, wz, seed + 831) > 0.75) {
          blocks[blockIndex(x, y, z)] = Block.Planks;
        }
      }
    }
  }
}

function dungeonCenter(wx: number, wz: number, seed: number): { cx: number; cz: number; y: number } | null {
  const gx = Math.floor(wx / 48);
  const gz = Math.floor(wz / 48);
  const h = hash2(gx, gz, seed + 901);
  if (h > 0.06) return null;
  const offX = Math.floor(hash2(gx + 100, gz, seed + 911) * 40);
  const offZ = Math.floor(hash2(gx, gz + 100, seed + 921) * 40);
  const dy = 18 + Math.floor(hash2(gx + 200, gz + 200, seed + 931) * 20);
  return { cx: gx * 48 + offX, cz: gz * 48 + offZ, y: dy };
}

function addDungeons(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let dgx = -1; dgx <= 1; dgx++) {
    for (let dgz = -1; dgz <= 1; dgz++) {
      const probe = dungeonCenter(cx * CHUNK_SIZE + 8 + dgx * 48, cz * CHUNK_SIZE + 8 + dgz * 48, seed);
      if (!probe) continue;
      const { cx: dcx, cz: dcz, y: dy } = probe;

      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let ddy = 0; ddy < 5; ddy++) {
            const wx = dcx + dx;
            const wz = dcz + dz;
            const wy = dy + ddy;
            const lx = wx - cx * CHUNK_SIZE;
            const lz = wz - cz * CHUNK_SIZE;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
            if (wy < 1 || wy >= WORLD_HEIGHT - 1) continue;

            const i = blockIndex(lx, wy, lz);
            const isWall = Math.abs(dx) === 2 || Math.abs(dz) === 2 || ddy === 0 || ddy === 4;

            if (isWall) {
              blocks[i] = Block.MossyStoneBrick;
            } else if (dx === 0 && dz === 0 && ddy === 1) {
              blocks[i] = Block.Spawner;
            } else {
              blocks[i] = Block.Air;
            }
          }
        }
      }
    }
  }
}

