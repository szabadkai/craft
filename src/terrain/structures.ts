import { Block, CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from '../types';
import { hash2, valueNoise, terrainHeight, biomeAt } from '../terrain';

export function addRavines(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      if (h <= 42 + 2) continue;
      const ravineNoise = valueNoise(wx * 1.3 + 7777, wz * 1.3 - 5555, 28, seed + 801);
      const ravineCross = valueNoise(wx * 0.8 - 3333, wz * 0.8 + 4444, 18, seed + 811);
      const width = ravineNoise * ravineCross;
      if (width < 0.27 || width > 0.29) continue;
      const depth = Math.floor(12 + hash2(wx, wz, seed + 821) * 16);
      const bottom = Math.max(8, h - depth);
      for (let y = bottom; y <= h; y++) {
        const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
        if (blocks[i] !== Block.Water && blocks[i] !== Block.Lava) {
          blocks[i] = Block.Air;
        }
      }
    }
  }
}

export function addFloatingIslands(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  const gridSize = 64;
  const cxStart = cx * CHUNK_SIZE;
  const czStart = cz * CHUNK_SIZE;
  for (let gz = Math.floor(cxStart / gridSize) - 1; gz <= Math.floor((cxStart + CHUNK_SIZE) / gridSize) + 1; gz++) {
    for (let gx = Math.floor(czStart / gridSize) - 1; gx <= Math.floor((czStart + CHUNK_SIZE) / gridSize) + 1; gx++) {
      if (hash2(gx, gz, seed + 901) > 0.08) continue;
      const centerX = gx * gridSize + Math.floor(hash2(gx, gz, seed + 911) * gridSize);
      const centerZ = gz * gridSize + Math.floor(hash2(gx, gz, seed + 921) * gridSize);
      const baseY = 78 + Math.floor(hash2(gx, gz, seed + 931) * 20);
      const radius = 4 + Math.floor(hash2(gx, gz, seed + 941) * 5);
      const thickness = 3 + Math.floor(hash2(gx, gz, seed + 951) * 3);

      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const bx = centerX + dx - cxStart;
          const bz = centerZ + dz - czStart;
          if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > radius) continue;
          const edgeFade = 1 - dist / radius;
          const localThick = Math.max(1, Math.floor(thickness * edgeFade));
          for (let dy = 0; dy < localThick; dy++) {
            const y = baseY - dy;
            if (y < 0 || y >= WORLD_HEIGHT) continue;
            const i = bx + CHUNK_SIZE * (bz + CHUNK_SIZE * y);
            blocks[i] = dy === 0 ? Block.Grass : dy < localThick - 1 ? Block.Dirt : Block.Stone;
          }
          if (baseY + 1 < WORLD_HEIGHT) {
            const topI = bx + CHUNK_SIZE * (bz + CHUNK_SIZE * (baseY + 1));
            if (blocks[topI] === Block.Air && dist < radius * 0.6) {
              const det = hash2(centerX + dx, centerZ + dz, seed + 961);
              if (det > 0.92) blocks[topI] = Block.RedFlower;
              else if (det > 0.85) blocks[topI] = Block.TallGrass;
            }
          }
        }
      }
      const treeBx = centerX - cxStart;
      const treeBz = centerZ - czStart;
      if (treeBx >= 2 && treeBx < CHUNK_SIZE - 2 && treeBz >= 2 && treeBz < CHUNK_SIZE - 2) {
        for (let ty = baseY + 1; ty <= baseY + 4 && ty < WORLD_HEIGHT; ty++) {
          blocks[treeBx + CHUNK_SIZE * (treeBz + CHUNK_SIZE * ty)] = Block.Log;
        }
        for (let ly = baseY + 3; ly <= baseY + 6 && ly < WORLD_HEIGHT; ly++) {
          const r = ly >= baseY + 6 ? 1 : 2;
          for (let ldz = -r; ldz <= r; ldz++) {
            for (let ldx = -r; ldx <= r; ldx++) {
              if (Math.abs(ldx) + Math.abs(ldz) > r + 1) continue;
              const lx = treeBx + ldx, lz = treeBz + ldz;
              if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
              const li = lx + CHUNK_SIZE * (lz + CHUNK_SIZE * ly);
              if (blocks[li] === Block.Air) blocks[li] = Block.Leaves;
            }
          }
        }
      }
    }
  }
}

export function addVolcanicLavaLakes(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      if (biomeAt(wx, wz, seed) !== 'volcanic') continue;
      const h = terrainHeight(wx, wz, seed);
      if (h + 1 >= WORLD_HEIGHT) continue;
      const lakeVal = valueNoise(wx + 6000, wz - 7000, 22, seed + 851);
      if (lakeVal < 0.72) continue;
      const n = terrainHeight(wx, wz + 1, seed);
      const s = terrainHeight(wx, wz - 1, seed);
      const e = terrainHeight(wx + 1, wz, seed);
      const w = terrainHeight(wx - 1, wz, seed);
      if ((n + s + e + w) / 4 <= h + 0.5) continue;
      const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (blocks[i] === Block.Air) blocks[i] = Block.Lava;
      const surfI = x + CHUNK_SIZE * (z + CHUNK_SIZE * h);
      if (blocks[surfI] === Block.Basalt) blocks[surfI] = Block.Obsidian;
    }
  }
}

export function addGiantMushrooms(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 2; z < CHUNK_SIZE - 2; z++) {
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      if (biomeAt(wx, wz, seed) !== 'mushroom') continue;
      if (hash2(wx, wz, seed + 871) < 0.965) continue;
      const h = terrainHeight(wx, wz, seed);
      if (h < 28 || h + 10 >= WORLD_HEIGHT) continue;
      const surface = blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * h)] as Block;
      if (surface !== Block.Mycelium) continue;
      const isRed = hash2(wx, wz, seed + 881) > 0.45;
      const capBlock = isRed ? Block.MushroomCapRed : Block.MushroomCapBrown;
      const height = 5 + Math.floor(hash2(wx, wz, seed + 891) * 4);
      for (let y = h + 1; y <= h + height && y < WORLD_HEIGHT; y++) {
        blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * y)] = Block.MushroomStem;
      }
      const capY = h + height + 1;
      const capR = isRed ? 3 : 2;
      for (let dy = 0; dy <= (isRed ? 2 : 1); dy++) {
        const y = capY + dy;
        if (y >= WORLD_HEIGHT) break;
        const r = dy === 0 ? capR : capR - dy;
        if (r < 0) break;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
            const mx = x + dx, mz = z + dz;
            if (mx < 0 || mx >= CHUNK_SIZE || mz < 0 || mz >= CHUNK_SIZE) continue;
            const mi = mx + CHUNK_SIZE * (mz + CHUNK_SIZE * y);
            if (blocks[mi] === Block.Air) blocks[mi] = capBlock;
          }
        }
      }
    }
  }
}

export function addMushroomSurfaceDetails(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      if (biomeAt(wx, wz, seed) !== 'mushroom') continue;
      const h = terrainHeight(wx, wz, seed);
      if (h + 1 >= WORLD_HEIGHT) continue;
      const surface = blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * h)] as Block;
      if (surface !== Block.Mycelium) continue;
      const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (blocks[i] !== Block.Air) continue;
      const detail = hash2(wx, wz, seed + 861);
      if (detail > 0.94) blocks[i] = Block.Mushroom;
      else if (detail > 0.92) blocks[i] = Block.GlowBerry;
    }
  }
}

export function addTrees(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 2; z < CHUNK_SIZE - 2; z++) {
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const biome = biomeAt(wx, wz, seed);
      if (biome === 'volcanic' || biome === 'mushroom') continue;
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

export function addOceanReservoirs(blocks: Uint16Array, cx: number, cz: number, seed: number, oceanSurfaceY: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      if (h > oceanSurfaceY) continue;
      for (let y = h + 1; y <= oceanSurfaceY && y < WORLD_HEIGHT; y++) {
        const i = blockIndex(x, y, z);
        if (blocks[i] === Block.Air) blocks[i] = Block.Water;
      }
    }
  }
}

export function addLakes(blocks: Uint16Array, cx: number, cz: number, seed: number, oceanSurfaceY: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      const lakeLevel = lakeSurfaceY(wx, wz, h, seed, oceanSurfaceY);
      if (lakeLevel === null) continue;
      for (let y = h + 1; y <= lakeLevel && y < WORLD_HEIGHT; y++) {
        const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
        if (blocks[i] === Block.Air) blocks[i] = Block.Water;
      }
      const bottomI = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (blocks[bottomI] === Block.Air) blocks[bottomI] = Block.Sand;
    }
  }
}

function lakeSurfaceY(wx: number, wz: number, h: number, seed: number, oceanSurfaceY: number): number | null {
  if (h <= oceanSurfaceY + 2 || h > oceanSurfaceY + 18) return null;
  const lakeVal = valueNoise(wx + 2111, wz - 1333, oceanSurfaceY, seed + 501);
  if (lakeVal < 0.82) return null;
  const n = terrainHeight(wx, wz + 1, seed);
  const s = terrainHeight(wx, wz - 1, seed);
  const e = terrainHeight(wx + 1, wz, seed);
  const w = terrainHeight(wx - 1, wz, seed);
  const avgNeighbor = (n + s + e + w) / 4;
  if (avgNeighbor <= h + 1.5) return null;
  return Math.min(h + 2, oceanSurfaceY + 4);
}

function surfaceBlockAt(x: number, z: number, h: number, seed: number): Block {
  const biome = biomeAt(x, z, seed);
  const oceanSurfaceY = 42;
  const biomeEdge = valueNoise(x + 4111, z - 3111, 140, seed + 251);
  const nearBorder = biomeEdge > 0.75 || biomeEdge < 0.25;
  if (h <= oceanSurfaceY + 3) {
    if (h <= oceanSurfaceY + 1) return valueNoise(x, z, 11, seed + 17) > 0.78 ? Block.Clay : Block.Sand;
    if (h === oceanSurfaceY + 2) return valueNoise(x, z, 7, seed + 43) > 0.55 ? Block.Sand : Block.Grass;
    if (h === oceanSurfaceY + 3) return valueNoise(x, z, 7, seed + 43) > 0.72 ? Block.Sand : Block.Grass;
  }
  if (biome === 'snow') return Block.Snow;
  if (biome === 'dry') return valueNoise(x, z, 14, seed + 19) > 0.58 ? Block.Sand : Block.Grass;
  if (biome === 'volcanic') return valueNoise(x, z, 12, seed + 27) > 0.82 ? Block.Obsidian : Block.Basalt;
  if (biome === 'mushroom') return Block.Mycelium;
  if (biome === 'hills' && h > 55) return valueNoise(x, z, 10, seed + 23) > 0.55 ? Block.Stone : Block.Gravel;
  if (nearBorder && h > oceanSurfaceY + 3) {
    const mixVal = valueNoise(x, z, 9, seed + 47);
    if (biome === 'forest' && mixVal > 0.82) return Block.Gravel;
    if (biome === 'plains' && mixVal > 0.85) return Block.Sand;
    if (biome === 'hills' && mixVal > 0.80) return Block.Grass;
  }
  return Block.Grass;
}
