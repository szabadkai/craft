/**
 * Per-block lighting engine.
 *
 * Computes two independent light channels per block:
 *   - Skylight (0–15): propagates down from the sky, attenuates -1 per block sideways/up
 *   - Blocklight (0–15): emitted by torches, lava, glow berries, etc., attenuates -1 per block
 *
 * Both are packed into a single Uint8Array (one byte per block):
 *   high nibble = skylight, low nibble = blocklight
 *
 * Designed to run in web workers alongside chunk generation and meshing.
 */

import { Block, blockIndex, CHUNK_SIZE, WORLD_HEIGHT } from './types';

// --- Light emission values for emissive blocks ---

export function getBlockLightEmission(block: Block): number {
  switch (block) {
    case Block.Lava: return 15;
    case Block.Torch: return 14;
    case Block.GlowBerry: return 10;
    case Block.Furnace: return 8;
    case Block.AmethystCluster: return 5;
    case Block.RedstoneOre: return 3;
    default: return 0;
  }
}

// --- Light opacity: does this block stop light propagation? ---

export function blocksLight(block: Block): boolean {
  switch (block) {
    case Block.Air:
    case Block.Water:
    case Block.Glass:
    case Block.Leaves:
    case Block.BirchLeaves:
    case Block.IronBars:
    case Block.TallGrass:
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
    case Block.Mushroom:
    case Block.BerryBush:
    case Block.Torch:
    case Block.GlowBerry:
    case Block.AmethystCluster:
    case Block.OakDoor:
    case Block.OakDoorOpen:
    case Block.Lava:
      return false;
    default:
      return true;
  }
}

// --- Light map packing helpers ---

function packLight(sky: number, blk: number): number {
  return ((sky & 0xF) << 4) | (blk & 0xF);
}

export function unpackSky(packed: number): number {
  return (packed >> 4) & 0xF;
}

export function unpackBlock(packed: number): number {
  return packed & 0xF;
}

// --- Neighbor light data for cross-chunk propagation ---

export type NeighborLightData = {
  px?: Uint8Array;
  nx?: Uint8Array;
  pz?: Uint8Array;
  nz?: Uint8Array;
};

// --- BFS queue using a circular buffer for performance ---

const MAX_QUEUE = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;

class LightQueue {
  private buf: Int32Array;
  private head = 0;
  private tail = 0;

  constructor() {
    this.buf = new Int32Array(MAX_QUEUE);
  }

  reset(): void {
    this.head = 0;
    this.tail = 0;
  }

  get length(): number {
    return this.tail - this.head;
  }

  enqueue(x: number, y: number, z: number): void {
    this.buf[this.tail % MAX_QUEUE] = (x << 16) | (y << 8) | z;
    this.tail++;
  }

  dequeue(): [number, number, number] {
    const v = this.buf[this.head % MAX_QUEUE];
    this.head++;
    return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
  }
}

// 6 cardinal directions
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];

// --- Main entry point ---

export function computeChunkLighting(
  blocks: Uint16Array,
  neighborBlocks?: {
    px?: Uint16Array;
    nx?: Uint16Array;
    pz?: Uint16Array;
    nz?: Uint16Array;
  },
  neighborLights?: NeighborLightData,
): Uint8Array {
  const lightMap = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const queue = new LightQueue();

  // Helper to read blocks including neighbors for border checks
  const getBlock = (x: number, y: number, z: number): Block => {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return blocks[blockIndex(x, y, z)] as Block;
    }
    if (neighborBlocks) {
      if (x >= CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && neighborBlocks.px)
        return neighborBlocks.px[blockIndex(x - CHUNK_SIZE, y, z)] as Block;
      if (x < 0 && z >= 0 && z < CHUNK_SIZE && neighborBlocks.nx)
        return neighborBlocks.nx[blockIndex(x + CHUNK_SIZE, y, z)] as Block;
      if (z >= CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && neighborBlocks.pz)
        return neighborBlocks.pz[blockIndex(x, y, z - CHUNK_SIZE)] as Block;
      if (z < 0 && x >= 0 && x < CHUNK_SIZE && neighborBlocks.nz)
        return neighborBlocks.nz[blockIndex(x, y, z + CHUNK_SIZE)] as Block;
    }
    return Block.Air;
  };

  // --- Phase 1: Skylight column scan ---
  // For each (x,z), trace down from the top. Set skylight=15 for all air-like
  // blocks with a clear path to the sky.
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const block = blocks[blockIndex(x, y, z)] as Block;
        if (blocksLight(block)) break;
        const idx = blockIndex(x, y, z);
        lightMap[idx] = packLight(15, unpackBlock(lightMap[idx]));
        queue.enqueue(x, y, z);
      }
    }
  }

  // --- Phase 2: Skylight BFS flood-fill ---
  propagateSkylight(lightMap, blocks, queue, getBlock, neighborLights);

  // --- Phase 3: Blocklight seed ---
  queue.reset();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = blocks[blockIndex(x, y, z)] as Block;
        const emission = getBlockLightEmission(block);
        if (emission > 0) {
          const idx = blockIndex(x, y, z);
          lightMap[idx] = packLight(unpackSky(lightMap[idx]), emission);
          queue.enqueue(x, y, z);
        }
      }
    }
  }

  // --- Phase 4: Seed from neighbor chunk border lights ---
  seedFromNeighborBlocklight(lightMap, blocks, queue, neighborLights);

  // --- Phase 5: Blocklight BFS flood-fill ---
  propagateBlocklight(lightMap, blocks, queue, getBlock);

  return lightMap;
}

// --- Skylight BFS ---

function propagateSkylight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  _getBlock: (x: number, y: number, z: number) => Block,
  neighborLights?: NeighborLightData,
): void {
  // Seed from neighbor skylight at borders
  seedFromNeighborSkylight(lightMap, blocks, queue, neighborLights);

  while (queue.length > 0) {
    const [x, y, z] = queue.dequeue();
    const idx = blockIndex(x, y, z);
    const currentSky = unpackSky(lightMap[idx]);
    if (currentSky <= 1) continue;

    const newSky = currentSky - 1;

    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];

      if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) continue;

      const nBlock = blocks[blockIndex(nx, ny, nz)] as Block;
      if (blocksLight(nBlock)) continue;

      const nIdx = blockIndex(nx, ny, nz);
      const existingSky = unpackSky(lightMap[nIdx]);
      if (newSky > existingSky) {
        lightMap[nIdx] = packLight(newSky, unpackBlock(lightMap[nIdx]));
        queue.enqueue(nx, ny, nz);
      }
    }
  }
}

// --- Blocklight BFS ---

function propagateBlocklight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  _getBlock: (x: number, y: number, z: number) => Block,
): void {
  while (queue.length > 0) {
    const [x, y, z] = queue.dequeue();
    const idx = blockIndex(x, y, z);
    const currentBlk = unpackBlock(lightMap[idx]);
    if (currentBlk <= 1) continue;

    const newBlk = currentBlk - 1;

    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nz = z + DZ[d];

      if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) continue;

      const nBlock = blocks[blockIndex(nx, ny, nz)] as Block;
      if (blocksLight(nBlock)) continue;

      const nIdx = blockIndex(nx, ny, nz);
      const existingBlk = unpackBlock(lightMap[nIdx]);
      if (newBlk > existingBlk) {
        lightMap[nIdx] = packLight(unpackSky(lightMap[nIdx]), newBlk);
        queue.enqueue(nx, ny, nz);
      }
    }
  }
}

// --- Seed border cells from neighbor chunk light maps ---

function seedFromNeighborSkylight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  neighborLights?: NeighborLightData,
): void {
  if (!neighborLights) return;

  // +X border: neighbor's x=0 → our x=CHUNK_SIZE-1 receives light
  seedBorderSkylight(lightMap, blocks, queue, neighborLights.px, CHUNK_SIZE - 1, 'x', 0);
  // -X border: neighbor's x=CHUNK_SIZE-1 → our x=0 receives light
  seedBorderSkylight(lightMap, blocks, queue, neighborLights.nx, 0, 'x', CHUNK_SIZE - 1);
  // +Z border: neighbor's z=0 → our z=CHUNK_SIZE-1 receives light
  seedBorderSkylight(lightMap, blocks, queue, neighborLights.pz, CHUNK_SIZE - 1, 'z', 0);
  // -Z border: neighbor's z=CHUNK_SIZE-1 → our z=0 receives light
  seedBorderSkylight(lightMap, blocks, queue, neighborLights.nz, 0, 'z', CHUNK_SIZE - 1);
}

function seedBorderSkylight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  neighborLight: Uint8Array | undefined,
  ourEdge: number,
  axis: 'x' | 'z',
  neighborEdge: number,
): void {
  if (!neighborLight) return;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let a = 0; a < CHUNK_SIZE; a++) {
      const ourX = axis === 'x' ? ourEdge : a;
      const ourZ = axis === 'z' ? ourEdge : a;
      const nX = axis === 'x' ? neighborEdge : a;
      const nZ = axis === 'z' ? neighborEdge : a;

      const ourBlock = blocks[blockIndex(ourX, y, ourZ)] as Block;
      if (blocksLight(ourBlock)) continue;

      const nIdx = blockIndex(nX, y, nZ);
      const neighborSky = unpackSky(neighborLight[nIdx]);
      if (neighborSky <= 1) continue;

      const newSky = neighborSky - 1;
      const ourIdx = blockIndex(ourX, y, ourZ);
      if (newSky > unpackSky(lightMap[ourIdx])) {
        lightMap[ourIdx] = packLight(newSky, unpackBlock(lightMap[ourIdx]));
        queue.enqueue(ourX, y, ourZ);
      }
    }
  }
}

function seedFromNeighborBlocklight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  neighborLights?: NeighborLightData,
): void {
  if (!neighborLights) return;

  seedBorderBlocklight(lightMap, blocks, queue, neighborLights.px, CHUNK_SIZE - 1, 'x', 0);
  seedBorderBlocklight(lightMap, blocks, queue, neighborLights.nx, 0, 'x', CHUNK_SIZE - 1);
  seedBorderBlocklight(lightMap, blocks, queue, neighborLights.pz, CHUNK_SIZE - 1, 'z', 0);
  seedBorderBlocklight(lightMap, blocks, queue, neighborLights.nz, 0, 'z', CHUNK_SIZE - 1);
}

function seedBorderBlocklight(
  lightMap: Uint8Array,
  blocks: Uint16Array,
  queue: LightQueue,
  neighborLight: Uint8Array | undefined,
  ourEdge: number,
  axis: 'x' | 'z',
  neighborEdge: number,
): void {
  if (!neighborLight) return;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let a = 0; a < CHUNK_SIZE; a++) {
      const ourX = axis === 'x' ? ourEdge : a;
      const ourZ = axis === 'z' ? ourEdge : a;
      const nX = axis === 'x' ? neighborEdge : a;
      const nZ = axis === 'z' ? neighborEdge : a;

      const ourBlock = blocks[blockIndex(ourX, y, ourZ)] as Block;
      if (blocksLight(ourBlock)) continue;

      const nIdx = blockIndex(nX, y, nZ);
      const neighborBlk = unpackBlock(neighborLight[nIdx]);
      if (neighborBlk <= 1) continue;

      const newBlk = neighborBlk - 1;
      const ourIdx = blockIndex(ourX, y, ourZ);
      if (newBlk > unpackBlock(lightMap[ourIdx])) {
        lightMap[ourIdx] = packLight(unpackSky(lightMap[ourIdx]), newBlk);
        queue.enqueue(ourX, y, ourZ);
      }
    }
  }
}

// --- Utility: read light from a light map at a position, with neighbor fallback ---

export function sampleLight(
  lightMap: Uint8Array,
  x: number,
  y: number,
  z: number,
  neighborLights?: NeighborLightData,
): [number, number] {
  if (y < 0 || y >= WORLD_HEIGHT) return y >= WORLD_HEIGHT ? [15, 0] : [0, 0];
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
    const packed = lightMap[blockIndex(x, y, z)];
    return [unpackSky(packed), unpackBlock(packed)];
  }
  // Read from neighbor light maps
  let neighborMap: Uint8Array | undefined;
  let lx = x;
  let lz = z;
  if (x >= CHUNK_SIZE && neighborLights?.px) { neighborMap = neighborLights.px; lx = x - CHUNK_SIZE; }
  else if (x < 0 && neighborLights?.nx) { neighborMap = neighborLights.nx; lx = x + CHUNK_SIZE; }
  else if (z >= CHUNK_SIZE && neighborLights?.pz) { neighborMap = neighborLights.pz; lz = z - CHUNK_SIZE; }
  else if (z < 0 && neighborLights?.nz) { neighborMap = neighborLights.nz; lz = z + CHUNK_SIZE; }

  if (neighborMap && lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
    const packed = neighborMap[blockIndex(lx, y, lz)];
    return [unpackSky(packed), unpackBlock(packed)];
  }
  // No neighbor data — use the nearest in-bounds cell as a best guess.
  // This avoids black faces on surface chunk borders and bright faces underground.
  const clampX = Math.max(0, Math.min(CHUNK_SIZE - 1, x));
  const clampZ = Math.max(0, Math.min(CHUNK_SIZE - 1, z));
  const fallback = lightMap[blockIndex(clampX, y, clampZ)];
  return [unpackSky(fallback), unpackBlock(fallback)];
}
