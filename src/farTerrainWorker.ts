import { blockColor } from './blocks';
import { generatedBlockAt, reservoirWaterSurfaceAt, terrainHeight } from './terrain';
import { Block, CHUNK_SIZE } from './types';

export type FarTerrainIn = {
  pcx: number;
  pcz: number;
  seed: number;
  farRadius: number;
  detailRadius: number;
};

export type FarTerrainOut = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  waterPositions: Float32Array;
  waterIndices: Uint32Array;
};

function terrainColorNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.01) * 43758.5453;
  return n - Math.floor(n);
}

function buildFarTerrain(msg: FarTerrainIn): FarTerrainOut {
  const { pcx, pcz, seed, farRadius, detailRadius } = msg;
  const step = 4;
  const patchChunkSpan = 2;
  const ringMin = detailRadius - 1;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let cz = pcz - farRadius; cz <= pcz + farRadius; cz += patchChunkSpan) {
    for (let cx = pcx - farRadius; cx <= pcx + farRadius; cx += patchChunkSpan) {
      const d = Math.hypot(cx + patchChunkSpan * 0.5 - pcx, cz + patchChunkSpan * 0.5 - pcz);
      if (d < ringMin || d > farRadius) continue;

      const baseVertex = positions.length / 3;
      const patchSize = CHUNK_SIZE * patchChunkSpan;
      const verts = patchSize / step + 1;
      for (let z = 0; z <= patchSize; z += step) {
        for (let x = 0; x <= patchSize; x += step) {
          const wx = cx * CHUNK_SIZE + x;
          const wz = cz * CHUNK_SIZE + z;
          const h = terrainHeight(wx, wz, seed) + 0.02;
          positions.push(wx, h, wz);
          const surface = generatedBlockAt(wx, Math.max(0, Math.floor(h)), wz, seed);
          const color = blockColor(surface === Block.Air ? Block.Grass : surface);
          const variation = 0.9 + terrainColorNoise(wx, wz, seed) * 0.18;
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
  }

  // Compute analytical normals from height differences
  const vertCount = positions.length / 3;
  const normals = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    const px = positions[i * 3];
    const pz = positions[i * 3 + 2];
    const hL = terrainHeight(px - step, pz, seed);
    const hR = terrainHeight(px + step, pz, seed);
    const hD = terrainHeight(px, pz - step, seed);
    const hU = terrainHeight(px, pz + step, seed);
    let nx = hL - hR;
    let ny = 2 * step;
    let nz = hD - hU;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
  }

  // Build water
  const halfSide = farRadius * CHUNK_SIZE;
  const waterStep = 8;
  const waterPositions: number[] = [];
  const waterIndices: number[] = [];
  const minX = pcx * CHUNK_SIZE - halfSide;
  const minZ = pcz * CHUNK_SIZE - halfSide;
  const maxX = pcx * CHUNK_SIZE + halfSide;
  const maxZ = pcz * CHUNK_SIZE + halfSide;

  for (let z = minZ; z < maxZ; z += waterStep) {
    for (let x = minX; x < maxX; x += waterStep) {
      const y = reservoirWaterSurfaceAt(x + waterStep * 0.5, z + waterStep * 0.5, seed);
      if (y === null) continue;
      const base = waterPositions.length / 3;
      const wy = y - 0.05;
      waterPositions.push(x, wy, z, x + waterStep, wy, z, x + waterStep, wy, z + waterStep, x, wy, z + waterStep);
      waterIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals,
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    waterPositions: new Float32Array(waterPositions),
    waterIndices: new Uint32Array(waterIndices),
  };
}

self.onmessage = (event: MessageEvent<FarTerrainIn>) => {
  const result = buildFarTerrain(event.data);
  const transfers: ArrayBuffer[] = [
    result.positions.buffer as ArrayBuffer,
    result.normals.buffer as ArrayBuffer,
    result.colors.buffer as ArrayBuffer,
    result.indices.buffer as ArrayBuffer,
    result.waterPositions.buffer as ArrayBuffer,
    result.waterIndices.buffer as ArrayBuffer,
  ];
  self.postMessage(result, transfers);
};
