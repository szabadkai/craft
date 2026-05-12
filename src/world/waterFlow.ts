import { Block } from '../types';

/**
 * Simple water flow: when a block turns to Air, adjacent Water blocks
 * flow into it. Water flows down first, then spreads horizontally up to
 * a limited range. Newly-filled water blocks can flow further.
 */

const MAX_HORIZONTAL_SPREAD = 5;

const NEIGHBORS_6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const NEIGHBORS_4_HORIZONTAL = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

type Vec3 = { x: number; y: number; z: number };

export class WaterFlowSystem {
  /**
   * Called after a block at `pos` was set to Air (e.g., mined).
   * Returns a list of positions that should become Water.
   * Caller batches them into setBlocks / setBlock.
   */
  static flow(
    pos: Vec3,
    getBlock: (wx: number, y: number, wz: number) => Block,
  ): Vec3[] {
    const result: Vec3[] = [];
    const visited = new Set<string>();
    const queue: Vec3[] = [];

    // Seed: any water neighbor of the broken block
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const nz = pos.z + dz;
      if (getBlock(nx, ny, nz) === Block.Water) {
        const key = keyOf(nx, ny, nz);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny, z: nz });
        }
      }
    }

    if (queue.length === 0) return result;

    // BFS: for each water source, try to flow into adjacent Air
    for (let i = 0; i < queue.length; i++) {
      const src = queue[i];

      // Try flowing down first (gravity)
      const below: Vec3 = { x: src.x, y: src.y - 1, z: src.z };
      if (getBlock(below.x, below.y, below.z) === Block.Air) {
        const bKey = keyOf(below.x, below.y, below.z);
        if (!visited.has(bKey)) {
          visited.add(bKey);
          result.push(below);
          // Water that flowed down becomes a new source
          queue.push(below);
          continue; // prioritize down-flow before horizontal
        }
      }

      // Horizontal spread (same level) within range
      for (const [dx, , dz] of NEIGHBORS_4_HORIZONTAL) {
        const hx = src.x + dx;
        const hz = src.z + dz;
        // Check horizontal distance from original water source at this Y
        if (pos.y < src.y) continue; // don't flow upward

        const spread = Math.max(Math.abs(hx - pos.x), Math.abs(hz - pos.z));
        if (spread > MAX_HORIZONTAL_SPREAD) continue;

        const target: Vec3 = { x: hx, y: src.y, z: hz };
        const tKey = keyOf(target.x, target.y, target.z);
        if (visited.has(tKey)) continue;

        if (getBlock(target.x, target.y, target.z) === Block.Air) {
          // Only flow horizontally if there's solid or water below
          const belowTarget = getBlock(target.x, target.y - 1, target.z);
          if (belowTarget === Block.Air) continue; // will be handled by down-flow from source

          visited.add(tKey);
          result.push(target);
          queue.push(target);
        }
      }
    }

    return result;
  }
}

function keyOf(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}
