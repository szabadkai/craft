import { terrainHeight, OCEAN_SURFACE_Y } from '../terrain';
import { WORLD_HEIGHT } from '../types';

export function findDrySpawn(
  originX: number,
  originZ: number,
  seed: number,
  playerHeight: number,
): { x: number; y: number; z: number } {
  let best = { x: originX, z: originZ, h: terrainHeight(originX, originZ, seed) };
  let bestScore = Number.POSITIVE_INFINITY;

  // Spiral outward up to 256 blocks, sampling every 4 blocks
  const step = 4;
  const maxRadius = 256;
  for (let radius = 0; radius <= maxRadius; radius += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = originX + dx;
        const z = originZ + dz;
        const h = terrainHeight(x, z, seed);
        if (h <= OCEAN_SURFACE_Y + 1) continue;
        const dist = dx * dx + dz * dz;
        const score = dist + Math.abs(h - OCEAN_SURFACE_Y - 5) * 6;
        if (score < bestScore) {
          best = { x, z, h };
          bestScore = score;
        }
      }
    }
    // Once we've found land and checked 2 more rings for a better spot, stop
    if (bestScore < Number.POSITIVE_INFINITY && radius >= step * 2) break;
  }
  return {
    x: best.x + 0.5,
    y: Math.min(WORLD_HEIGHT - playerHeight - 1, best.h + 1.02),
    z: best.z + 0.5,
  };
}