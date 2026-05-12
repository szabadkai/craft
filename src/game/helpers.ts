import { terrainHeight, WATER_LEVEL } from '../terrain';
import { WORLD_HEIGHT } from '../types';

export function findDrySpawn(
  originX: number,
  originZ: number,
  seed: number,
  playerHeight: number,
): { x: number; y: number; z: number } {
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
    y: Math.min(WORLD_HEIGHT - playerHeight - 1, best.h + 1.02),
    z: best.z + 0.5,
  };
}