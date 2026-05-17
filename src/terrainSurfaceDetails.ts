import { Block, CHUNK_SIZE, WORLD_HEIGHT } from './types';
import { Biome, biomeAt, hash2, terrainHeight, valueNoise } from './terrain';

const SURFACE_DETAIL_PATCH_SCALE = 38;
const SURFACE_DETAIL_PATCH_THRESHOLD = 0.56;
const SURFACE_ROCK_PATCH_SCALE = 72;
const SURFACE_ROCK_PATCH_THRESHOLD = 0.66;

function rockThreshold(biome: Biome): number {
  switch (biome) {
    case 'hills': return 0.965;
    case 'plains': return 0.985;
    case 'forest': return 0.995;
    case 'snow': return 0.985;
    case 'dry': return 0.99;
    case 'volcanic': return 1.0;
    case 'mushroom': return 1.0;
    case 'beach': return 1.0;
  }
}

function canPlaceSurfaceRock(wx: number, wz: number, biome: Biome, seed: number): boolean {
  const patch = valueNoise(wx, wz, SURFACE_ROCK_PATCH_SCALE, seed + 321);
  if (patch < SURFACE_ROCK_PATCH_THRESHOLD) return false;
  const cellX = Math.floor(wx / 5);
  const cellZ = Math.floor(wz / 5);
  const localX = ((wx % 5) + 5) % 5;
  const localZ = ((wz % 5) + 5) % 5;
  const anchorX = Math.floor(hash2(cellX, cellZ, seed + 323) * 5);
  const anchorZ = Math.floor(hash2(cellX, cellZ, seed + 325) * 5);
  if (localX !== anchorX || localZ !== anchorZ) return false;
  return hash2(wx, wz, seed + 311) > rockThreshold(biome);
}

function surfaceDetailPatch(wx: number, wz: number, seed: number): number {
  return valueNoise(wx, wz, SURFACE_DETAIL_PATCH_SCALE, seed + 331);
}

export function addSurfaceDetails(blocks: Uint16Array, cx: number, cz: number, seed: number): void {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = cx * CHUNK_SIZE + x;
      const wz = cz * CHUNK_SIZE + z;
      const h = terrainHeight(wx, wz, seed);
      if (h + 1 >= WORLD_HEIGHT) continue;
      const surface = blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * h)] as Block;
      const biome = biomeAt(wx, wz, seed);

      if (biome !== 'beach' && surface !== Block.Sand && surface !== Block.Water) {
        if (canPlaceSurfaceRock(wx, wz, biome, seed)) {
          const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
          if (blocks[i] !== Block.Air) continue;
          blocks[i] = Block.Cobblestone;
          if (hash2(wx, wz, seed + 313) > 0.9 && h + 2 < WORLD_HEIGHT) {
            const above = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 2));
            if (blocks[above] === Block.Air) blocks[above] = Block.Cobblestone;
          }
          continue;
        }
      }

      if (surface !== Block.Grass && !(biome === 'dry' && surface === Block.Sand)) continue;
      const detail = hash2(wx, wz, seed + 301);
      const patch = surfaceDetailPatch(wx, wz, seed);
      const i = x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + 1));
      if (blocks[i] !== Block.Air) continue;
      if (patch < SURFACE_DETAIL_PATCH_THRESHOLD && detail < 0.992) continue;
      if (biome === 'forest' && detail > 0.982) {
        blocks[i] = detail > 0.991 ? Block.BerryBush : Block.Mushroom;
      } else if (biome === 'plains' && detail > 0.982) {
        blocks[i] =
          detail > 0.994 ? Block.BlueFlower : detail > 0.988 ? Block.RedFlower : Block.YellowFlower;
      } else if ((biome === 'plains' || biome === 'forest') && detail > 0.955) {
        blocks[i] = Block.TallGrass;
      } else if (biome === 'dry' && detail > 0.992) {
        const height = 2 + Math.floor(hash2(wx, wz, seed + 307) * 3);
        for (let cy = 1; cy <= height && h + cy < WORLD_HEIGHT; cy++) {
          blocks[x + CHUNK_SIZE * (z + CHUNK_SIZE * (h + cy))] = Block.Cactus;
        }
      } else if (biome === 'dry' && detail > 0.985) {
        blocks[i] = Block.Gravel;
      } else if ((biome === 'plains' || biome === 'forest') && detail > 0.99) {
        blocks[i] = Block.Pumpkin;
      }
    }
  }
}
