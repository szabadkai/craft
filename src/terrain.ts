import { Block, CHUNK_SIZE, WORLD_HEIGHT } from './types';

type Biome = 'plains' | 'forest' | 'hills' | 'beach' | 'snow' | 'dry';

export const WATER_LEVEL = 42;

function hash2(x: number, z: number, seed: number): number {
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

function valueNoise(x: number, z: number, scale: number, seed: number): number {
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
  const broad = valueNoise(x, z, 96, seed) * (biome === 'hills' ? 42 : 30);
  const mid = valueNoise(x + 2000, z - 900, 32, seed) * (biome === 'hills' ? 20 : 13);
  const fine = valueNoise(x - 800, z + 1400, 13, seed) * 5;
  const base = biome === 'beach' ? 18 : biome === 'dry' ? 20 : 22;
  return Math.max(8, Math.min(WORLD_HEIGHT - 8, Math.floor(base + broad + mid + fine)));
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

  // wide caverns — large open spaces, more common at mid-depths
  const cavern = valueNoise3D(wx, y * 0.7, wz, 64, seed + 401);
  const depthFactor = Math.sin((y / WORLD_HEIGHT) * Math.PI) * 1.05;
  if (cavern > 0.67 - depthFactor * 0.07) return true;

  // worm tunnels — narrow, connected paths using crossed noise
  const wx1 = valueNoise3D(wx + 300, y * 1.1, wz - 300, 18, seed + 411);
  const wy1 = valueNoise3D(wx - 300, y * 1.1, wz + 300, 18, seed + 413);
  const worm = Math.min(wx1, wy1);
  if (worm > 0.51 && worm < 0.58) return true;

  // surface entrances — caves that reach upward near the surface
  if (y >= h - 12 && y < h - 4) {
    const entrance = valueNoise3D(wx, y * 1.5, wz, 14, seed + 431);
    if (entrance > 0.6 && cavern > 0.42) return true;
  }

  // occasional large chambers
  if (y > 18 && y < 62) {
    const chamber = valueNoise3D(wx + 500, y * 0.5 - 300, wz + 500, 72, seed + 441);
    if (chamber > 0.74) return true;
  }

  return false;
}

export function generatedBlockAt(x: number, y: number, z: number, seed: number): Block {
  if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
  const h = terrainHeight(x, z, seed);
  if (y > h) return y <= WATER_LEVEL ? Block.Water : Block.Air;
  if (y === h) {
    return surfaceBlockAt(x, z, h, seed);
  }
  if (y > h - 4) return subsurfaceBlockAt(x, z, h, seed);

  if (isCaveBlock(x, y, z, h, seed)) return Block.Air;

  const ore = valueNoise(x * 1.7 + y * 0.9, z * 1.7 - y * 0.6, 9, seed + 31);
  const deepOre = valueNoise(x * 2.1 - y * 0.7, z * 2.1 + y * 0.8, 7, seed + 37);
  if (y < 42 && ore > 0.82) return Block.CoalOre;
  if (y < 45 && deepOre > 0.83 && deepOre < 0.87) return Block.CopperOre;
  if (y < 32 && ore > 0.77 && ore < 0.81) return Block.IronOre;
  if (y < 22 && deepOre > 0.74 && deepOre < 0.765) return Block.GoldOre;
  if (y < 14 && ore > 0.735 && ore < 0.748) return Block.DiamondOre;
  if (valueNoise(x + y * 3, z - y * 2, 18, seed + 91) > 0.86) return Block.Gravel;
  return Block.Stone;
}

export function biomeAt(x: number, z: number, seed: number): Biome {
  const moisture = valueNoise(x + 3000, z - 1000, 180, seed + 201);
  const temp = valueNoise(x - 1400, z + 2600, 220, seed + 211);
  const rough = valueNoise(x + 700, z + 700, 150, seed + 221);
  const h = terrainHeightBase(x, z, seed);
  if (h < 26) return 'beach';
  if (temp < 0.28 && h > 32) return 'snow';
  if (rough > 0.68 && h > 38) return 'hills';
  if (moisture > 0.62) return 'forest';
  if (temp > 0.68 && moisture < 0.44) return 'dry';
  return 'plains';
}

function terrainHeightBase(x: number, z: number, seed: number): number {
  const broad = valueNoise(x, z, 96, seed) * 34;
  const mid = valueNoise(x + 2000, z - 900, 32, seed) * 15;
  const fine = valueNoise(x - 800, z + 1400, 13, seed) * 5;
  return Math.floor(22 + broad + mid + fine);
}

function surfaceBlockAt(x: number, z: number, h: number, seed: number): Block {
  const biome = biomeAt(x, z, seed);
  const biomeEdge = valueNoise(x + 4111, z - 3111, 140, seed + 251);
  const nearBorder = biomeEdge > 0.75 || biomeEdge < 0.25;

  // Variable-width shoreline: softer beach transition
  if (h <= WATER_LEVEL + 3) {
    if (h <= WATER_LEVEL + 1) {
      return valueNoise(x, z, 11, seed + 17) > 0.78 ? Block.Clay : Block.Sand;
    }
    // Transition zone: mix sand and grass based on height
    if (h === WATER_LEVEL + 2) {
      return valueNoise(x, z, 7, seed + 43) > 0.55 ? Block.Sand : Block.Grass;
    }
    if (h === WATER_LEVEL + 3) {
      return valueNoise(x, z, 7, seed + 43) > 0.72 ? Block.Sand : Block.Grass;
    }
  }
  if (biome === 'snow') return Block.Snow;
  if (biome === 'dry') return valueNoise(x, z, 14, seed + 19) > 0.58 ? Block.Sand : Block.Grass;
  if (biome === 'hills' && h > 55)
    return valueNoise(x, z, 10, seed + 23) > 0.55 ? Block.Stone : Block.Gravel;
  // Biome edge blending — mix surface types at borders
  if (nearBorder && h > WATER_LEVEL + 3) {
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
  addTrees(blocks, cx, cz, seed);
  addSurfaceDetails(blocks, cx, cz, seed);
  addLakes(blocks, cx, cz, seed);
  return blocks;
}

function addTrees(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 2; z < CHUNK_SIZE - 2; z++) {
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const biome = biomeAt(wx, wz, seed);
      const treeChance =
        biome === 'forest' ? 0.965 : biome === 'plains' ? 0.992 : biome === 'snow' ? 0.988 : 0.998;
      if (hash2(wx, wz, seed + 99) < treeChance) continue;
      const h = terrainHeight(wx, wz, seed);
      if (h < 28 || h > WORLD_HEIGHT - 12) continue;
      const surface = surfaceBlockAt(wx, wz, h, seed);
      if (surface !== Block.Grass && surface !== Block.Snow) continue;
      const log =
        biome === 'snow' || (biome === 'forest' && hash2(wx, wz, seed + 104) > 0.66)
          ? Block.BirchLog
          : Block.Log;
      const leaves = log === Block.BirchLog ? Block.BirchLeaves : Block.Leaves;
      for (let y = h + 1; y <= h + 5; y++) {
        blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)] = log;
      }
      for (let ly = h + 4; ly <= h + 7; ly++) {
        const r = ly === h + 7 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
            const lx = x + dx;
            const lz = z + dz;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly >= WORLD_HEIGHT)
              continue;
            const i = lx + CHUNK_SIZE * (lz + CHUNK_SIZE * ly);
            if (blocks[i] === Block.Air) blocks[i] = leaves;
          }
        }
      }
    }
  }
}

function rockThreshold(biome: Biome): number {
  switch (biome) {
    case 'hills': return 0.90;  // rocks common on hills
    case 'plains': return 0.96;  // occasional rocks
    case 'forest': return 0.97;  // fewer rocks in forest
    case 'snow': return 0.93;    // common in snow
    case 'dry': return 0.95;     // some rocks in dry
    case 'beach': return 1.0;    // no rocks on beach
  }
}

function addSurfaceDetails(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      if (h + 1 >= WORLD_HEIGHT) continue;
      const surface = blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * h)] as Block;
      const biome = biomeAt(wx, wz, seed);

      // Surface rocks — cobblestone outcrops (on any biome surface, separate from other details)
      if (biome !== 'beach' && surface !== Block.Sand && surface !== Block.Water) {
        const rockVal = hash2(wx, wz, seed + 311);
        if (rockVal > rockThreshold(biome)) {
          const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
          blocks[i] = Block.Cobblestone;
          // Occasionally make a 2-tall rock pillar
          if (hash2(wx, wz, seed + 313) > 0.62 && h + 2 < WORLD_HEIGHT) {
            const above = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 2));
            if (blocks[above] === Block.Air) {
              blocks[above] = Block.Cobblestone;
            }
          }
          continue;
        }
      }

      if (surface !== Block.Grass && !(biome === 'dry' && surface === Block.Sand)) continue;
      const detail = hash2(wx, wz, seed + 301);
      const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (biome === 'forest' && detail > 0.958) {
        blocks[i] = detail > 0.976 ? Block.BerryBush : Block.Mushroom;
      } else if (biome === 'plains' && detail > 0.955) {
        blocks[i] =
          detail > 0.987 ? Block.BlueFlower : detail > 0.974 ? Block.RedFlower : Block.YellowFlower;
      } else if ((biome === 'plains' || biome === 'forest') && detail > 0.88) {
        blocks[i] = Block.TallGrass;
      } else if (biome === 'dry' && detail > 0.982) {
        const height = 2 + Math.floor(hash2(wx, wz, seed + 307) * 3);
        for (let cy = 1; cy <= height && h + cy < WORLD_HEIGHT; cy++) {
          blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + cy))] = Block.Cactus;
        }
      } else if (biome === 'dry' && detail > 0.965) {
        blocks[i] = Block.Gravel;
      } else if ((biome === 'plains' || biome === 'forest') && detail > 0.945) {
        blocks[i] = Block.Pumpkin;
      }
    }
  }
}

/** Fill small inland depressions with water (ponds/lakes above ocean level) */
function addLakes(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      // Only consider terrain above ocean level but not too high
      if (h <= WATER_LEVEL + 2 || h > WATER_LEVEL + 18) continue;
      // Lake noise: identify bowl-shaped terrain depressions
      const lakeVal = valueNoise(wx + 2111, wz - 1333, 42, seed + 501);
      if (lakeVal < 0.82) continue;
      // Check surrounding terrain: depression if neighbors are higher
      const n = terrainHeight(wx, wz + 1, seed);
      const s = terrainHeight(wx, wz - 1, seed);
      const e = terrainHeight(wx + 1, wz, seed);
      const w = terrainHeight(wx - 1, wz, seed);
      const avgNeighbor = (n + s + e + w) / 4;
      if (avgNeighbor <= h + 1.5) continue;
      // This is a depression — fill up to lake level
      const lakeLevel = Math.min(h + 2, WATER_LEVEL + 4);
      for (let y = h + 1; y <= lakeLevel && y < WORLD_HEIGHT; y++) {
        const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
        if (blocks[i] === Block.Air) blocks[i] = Block.Water;
      }
      // Lake bottom: sand/clay
      const bottomI = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (blocks[bottomI] === Block.Air) blocks[bottomI] = Block.Sand;
    }
  }
}
