import { isSolid } from './blocks';
import { Tile, tileForBlockFace, tileRect } from './atlas';
import { generatedBlockAt } from './terrain';
import { sampleLight, unpackBlock, type NeighborLightData } from './lighting';
import { Block, blockIndex, CHUNK_SIZE, ChunkMeshPayload, chunkKey, NeighborBlocks, WORLD_HEIGHT } from './types';
import {
  colorVariation,
  isDecoration,
  isSlab,
  isStair,
  slabFaceVisible,
  emitSlabFace,
  emitStairFaces,
  emitDecorations,
} from './mesh/blockShapes';

type Axis = 0 | 1 | 2;

type FaceDef = {
  n: [number, number, number];
  dAxis: Axis;
  uAxis: Axis;
  vAxis: Axis;
  shade: number;
  corners: (
    plane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ) => [number, number, number][];
};

type MaskCell = {
  block: Block;
  tile: Tile;
  shade: number;
  sky: number;
  blk: number;
};

const dims = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE] as const;

const faces: FaceDef[] = [
  {
    n: [1, 0, 0],
    dAxis: 0,
    uAxis: 2,
    vAxis: 1,
    shade: 0.98,
    corners: (p, u0, v0, u1, v1) => [
      [p, v0, u0],
      [p, v1, u0],
      [p, v1, u1],
      [p, v0, u1],
    ],
  },
  {
    n: [-1, 0, 0],
    dAxis: 0,
    uAxis: 2,
    vAxis: 1,
    shade: 0.92,
    corners: (p, u0, v0, u1, v1) => [
      [p, v0, u1],
      [p, v1, u1],
      [p, v1, u0],
      [p, v0, u0],
    ],
  },
  {
    n: [0, 1, 0],
    dAxis: 1,
    uAxis: 0,
    vAxis: 2,
    shade: 1,
    corners: (p, u0, v0, u1, v1) => [
      [u0, p, v1],
      [u1, p, v1],
      [u1, p, v0],
      [u0, p, v0],
    ],
  },
  {
    n: [0, -1, 0],
    dAxis: 1,
    uAxis: 0,
    vAxis: 2,
    shade: 0.72,
    corners: (p, u0, v0, u1, v1) => [
      [u0, p, v0],
      [u1, p, v0],
      [u1, p, v1],
      [u0, p, v1],
    ],
  },
  {
    n: [0, 0, 1],
    dAxis: 2,
    uAxis: 0,
    vAxis: 1,
    shade: 1,
    corners: (p, u0, v0, u1, v1) => [
      [u1, v0, p],
      [u1, v1, p],
      [u0, v1, p],
      [u0, v0, p],
    ],
  },
  {
    n: [0, 0, -1],
    dAxis: 2,
    uAxis: 0,
    vAxis: 1,
    shade: 0.88,
    corners: (p, u0, v0, u1, v1) => [
      [u0, v0, p],
      [u0, v1, p],
      [u1, v1, p],
      [u1, v0, p],
    ],
  },
];

export function buildChunkMesh(
  cx: number,
  cz: number,
  seed: number,
  blocks: Uint16Array,
  neighbors?: NeighborBlocks,
  lightMap?: Uint8Array,
): ChunkMeshPayload {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const atlas: number[] = [];
  const lights: number[] = [];
  const indices: number[] = [];
  const waterPositions: number[] = [];
  const waterNormals: number[] = [];
  const waterLights: number[] = [];
  const waterIndices: number[] = [];
  const transparentPositions: number[] = [];
  const transparentNormals: number[] = [];
  const transparentColors: number[] = [];
  const transparentUvs: number[] = [];
  const transparentAtlas: number[] = [];
  const transparentLights: number[] = [];
  const transparentIndices: number[] = [];
  const decoPositions: number[] = [];
  const decoNormals: number[] = [];
  const decoColors: number[] = [];
  const decoUvs: number[] = [];
  const decoAtlas: number[] = [];
  const decoLights: number[] = [];
  const decoIndices: number[] = [];

  const neighborLightData: NeighborLightData | undefined = neighbors ? {
    px: neighbors.pxLight,
    nx: neighbors.nxLight,
    pz: neighbors.pzLight,
    nz: neighbors.nzLight,
  } : undefined;

  // Default to full skylight if no light map provided (shouldn't happen in practice)
  const defaultLightMap = lightMap ?? new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0xF0);

  const getLight = (x: number, y: number, z: number): [number, number] => {
    return sampleLight(defaultLightMap, x, y, z, neighborLightData);
  };

  const getBlock = (x: number, y: number, z: number): Block => {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return blocks[blockIndex(x, y, z)] as Block;
    }
    // Look up block in neighbor chunk data (player-modified) before falling
    // back to generatedBlockAt which doesn't know about modifications.
    if (neighbors) {
      if (x >= CHUNK_SIZE && x < CHUNK_SIZE * 2 && z >= 0 && z < CHUNK_SIZE && neighbors.px) {
        return neighbors.px[blockIndex(x - CHUNK_SIZE, y, z)] as Block;
      }
      if (x < 0 && x >= -CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && neighbors.nx) {
        return neighbors.nx[blockIndex(x + CHUNK_SIZE, y, z)] as Block;
      }
      if (z >= CHUNK_SIZE && z < CHUNK_SIZE * 2 && x >= 0 && x < CHUNK_SIZE && neighbors.pz) {
        return neighbors.pz[blockIndex(x, y, z - CHUNK_SIZE)] as Block;
      }
      if (z < 0 && z >= -CHUNK_SIZE && x >= 0 && x < CHUNK_SIZE && neighbors.nz) {
        return neighbors.nz[blockIndex(x, y, z + CHUNK_SIZE)] as Block;
      }
    }
    return generatedBlockAt(cx * CHUNK_SIZE + x, y, cz * CHUNK_SIZE + z, seed);
  };

  const coord = (face: FaceDef, d: number, u: number, v: number): [number, number, number] => {
    const out = [0, 0, 0] as [number, number, number];
    out[face.dAxis] = d;
    out[face.uAxis] = u;
    out[face.vAxis] = v;
    return out;
  };

  for (const face of faces) {
    const uSize = dims[face.uAxis];
    const vSize = dims[face.vAxis];
    const dSize = dims[face.dAxis];
    const mask: Array<MaskCell | null> = new Array(uSize * vSize);

    for (let d = 0; d < dSize; d++) {
      for (let v = 0; v < vSize; v++) {
        for (let u = 0; u < uSize; u++) {
          const p = coord(face, d, u, v);
          const block = getBlock(p[0], p[1], p[2]);
          const neighbor = getBlock(p[0] + face.n[0], p[1] + face.n[1], p[2] + face.n[2]);
          const index = u + v * uSize;
          if (block !== Block.Air && block !== Block.Water && block !== Block.Lava && block !== Block.Glass && block !== Block.Leaves && block !== Block.BirchLeaves && block !== Block.IronBars && !isDecoration(block) && !isSlab(block) && !isStair(block) && !occludesFace(block, neighbor)) {
            const [sky, blk] = getLight(p[0] + face.n[0], p[1] + face.n[1], p[2] + face.n[2]);
            mask[index] = { block, tile: tileForBlockFace(block, face.n), shade: face.shade, sky, blk };
          } else {
            mask[index] = null;
          }
        }
      }

      for (let v = 0; v < vSize; v++) {
        for (let u = 0; u < uSize; ) {
          const cell = mask[u + v * uSize];
          if (!cell) {
            u++;
            continue;
          }

          let width = 1;
          while (u + width < uSize && sameCell(cell, mask[u + width + v * uSize])) width++;

          let height = 1;
          heightLoop: while (v + height < vSize) {
            for (let x = 0; x < width; x++) {
              if (!sameCell(cell, mask[u + x + (v + height) * uSize])) break heightLoop;
            }
            height++;
          }

          emitQuad({
            cx,
            cz,
            d,
            u,
            v,
            width,
            height,
            face,
            cell,
            positions,
            normals,
            colors,
            uvs,
            atlas,
            lights,
            indices,
          });

          for (let yy = 0; yy < height; yy++) {
            for (let xx = 0; xx < width; xx++) mask[u + xx + (v + yy) * uSize] = null;
          }
          u += width;
        }
      }
    }
  }

  // Emit individual glass and leaf faces (no greedy merge, for proper alpha blending)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (block !== Block.Glass && block !== Block.Leaves && block !== Block.BirchLeaves && block !== Block.IronBars) continue;
        for (const face of faces) {
          const neighbor = getBlock(x + face.n[0], y + face.n[1], z + face.n[2]);
          if (neighbor === block) continue;
          const [sky, blk] = getLight(x + face.n[0], y + face.n[1], z + face.n[2]);
          emitTransparentFace(cx, cz, x, y, z, block, face, sky, blk, transparentPositions, transparentNormals, transparentColors, transparentUvs, transparentAtlas, transparentLights, transparentIndices);
        }
      }
    }
  }

  // Emit individual water block faces (no greedy merge, for proper vertex waves)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (getBlock(x, y, z) !== Block.Water) continue;
        for (const face of faces) {
          const nx = x + face.n[0];
          const ny = y + face.n[1];
          const nz = z + face.n[2];
          const neighbor = getBlock(nx, ny, nz);
          if (neighbor === Block.Water || isSolid(neighbor)) continue;
          if (face.n[1] < 0) continue;
          if (face.n[1] === 0 && getBlock(x, y + 1, z) === Block.Water) continue;
          let [sky, blk] = getLight(nx, ny, nz);
          if (face.n[1] > 0) sky = 15;
          emitWaterBlockFace(cx, cz, x, y, z, face, sky, blk, waterPositions, waterNormals, waterLights, waterIndices);
        }
      }
    }
  }

  // Emit lava faces (bright emissive, non-greedy)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (getBlock(x, y, z) !== Block.Lava) continue;
        for (const face of faces) {
          const neighbor = getBlock(x + face.n[0], y + face.n[1], z + face.n[2]);
          if (neighbor === Block.Lava) continue;
          // Lava is self-lit — always full brightness
          emitTransparentFace(cx, cz, x, y, z, Block.Lava, face, 15, 15, transparentPositions, transparentNormals, transparentColors, transparentUvs, transparentAtlas, transparentLights, transparentIndices);
        }
      }
    }
  }

  // Emit individual slab block faces (no greedy merge, for half-height geometry)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (!isSlab(block)) continue;
        for (const face of faces) {
          const nx = x + face.n[0];
          const ny = y + face.n[1];
          const nz = z + face.n[2];
          const neighbor = getBlock(nx, ny, nz);
          // A slab face is visible if neighbor is air/water/decor or a non-matching slab
          if (!slabFaceVisible(face, neighbor, block, y)) continue;
          const [slabSky, slabBlk] = getLight(nx, ny, nz);
          emitSlabFace(cx, cz, x, y, z, block, face, slabSky, slabBlk, positions, normals, colors, uvs, atlas, lights, indices);
        }
      }
    }
  }

  emitDecorations(cx, cz, getBlock, getLight, decoPositions, decoNormals, decoColors, decoUvs, decoAtlas, decoLights, decoIndices);

  // Emit individual stair faces (non-greedy, stepped geometry)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (!isStair(block)) continue;
        emitStairFaces(cx, cz, x, y, z, block, getBlock, getLight, positions, normals, colors, uvs, atlas, lights, indices);
      }
    }
  }

  let solidVoxels = 0;
  let borderLightPx = false, borderLightNx = false, borderLightPz = false, borderLightNz = false;
  const S = CHUNK_SIZE;
  const H = WORLD_HEIGHT;
  for (let i = 0; i < blocks.length; i++) {
    if (isSolid(blocks[i] as Block)) solidVoxels++;
  }
  for (let y = 0; y < H && !(borderLightPx && borderLightNx && borderLightPz && borderLightNz); y++) {
    for (let a = 0; a < S; a++) {
      if (!borderLightPx && unpackBlock(defaultLightMap[blockIndex(S - 1, y, a)]) > 1) borderLightPx = true;
      if (!borderLightNx && unpackBlock(defaultLightMap[blockIndex(0, y, a)]) > 1) borderLightNx = true;
      if (!borderLightPz && unpackBlock(defaultLightMap[blockIndex(a, y, S - 1)]) > 1) borderLightPz = true;
      if (!borderLightNz && unpackBlock(defaultLightMap[blockIndex(a, y, 0)]) > 1) borderLightNz = true;
    }
  }

  return {
    key: chunkKey(cx, cz),
    cx,
    cz,
    blocks,
    lightMap: defaultLightMap,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    atlas: new Float32Array(atlas),
    lights: new Float32Array(lights),
    indices: new Uint32Array(indices),
    waterPositions: waterPositions.length > 0 ? new Float32Array(waterPositions) : null,
    waterNormals: waterNormals.length > 0 ? new Float32Array(waterNormals) : null,
    waterLights: waterLights.length > 0 ? new Float32Array(waterLights) : null,
    waterIndices: waterIndices.length > 0 ? new Uint32Array(waterIndices) : null,
    transparentPositions: transparentPositions.length > 0 ? new Float32Array(transparentPositions) : null,
    transparentNormals: transparentNormals.length > 0 ? new Float32Array(transparentNormals) : null,
    transparentColors: transparentColors.length > 0 ? new Float32Array(transparentColors) : null,
    transparentUvs: transparentUvs.length > 0 ? new Float32Array(transparentUvs) : null,
    transparentAtlas: transparentAtlas.length > 0 ? new Float32Array(transparentAtlas) : null,
    transparentLights: transparentLights.length > 0 ? new Float32Array(transparentLights) : null,
    transparentIndices: transparentIndices.length > 0 ? new Uint32Array(transparentIndices) : null,
    decoPositions: decoPositions.length > 0 ? new Float32Array(decoPositions) : null,
    decoNormals: decoNormals.length > 0 ? new Float32Array(decoNormals) : null,
    decoColors: decoColors.length > 0 ? new Float32Array(decoColors) : null,
    decoUvs: decoUvs.length > 0 ? new Float32Array(decoUvs) : null,
    decoAtlas: decoAtlas.length > 0 ? new Float32Array(decoAtlas) : null,
    decoLights: decoLights.length > 0 ? new Float32Array(decoLights) : null,
    decoIndices: decoIndices.length > 0 ? new Uint32Array(decoIndices) : null,
    solidVoxels,
    borderLightPx,
    borderLightNx,
    borderLightPz,
    borderLightNz,
  };
}


function occludesFace(block: Block, neighbor: Block): boolean {
  if (block === Block.Water) return neighbor === Block.Water || isSolid(neighbor);
  // Open doors don't occlude adjacent faces
  if (block === Block.OakDoorOpen) return false;
  return isSolid(neighbor);
}

function sameCell(a: MaskCell, b: MaskCell | null): boolean {
  return Boolean(b && a.block === b.block && a.tile === b.tile && a.shade === b.shade && a.sky === b.sky && a.blk === b.blk);
}

function emitWaterBlockFace(
  cx: number,
  cz: number,
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  sky: number,
  blk: number,
  waterPositions: number[],
  waterNormals: number[],
  waterLights: number[],
  waterIndices: number[],
): void {
  const base = waterPositions.length / 3;
  const plane = face.n[face.dAxis] > 0 ? (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z) + 1 : (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z);
  const u0 = face.uAxis === 0 ? x : face.uAxis === 1 ? y : z;
  const v0 = face.vAxis === 0 ? x : face.vAxis === 1 ? y : z;
  const corners = face.corners(plane, u0, v0, u0 + 1, v0 + 1);
  const skyN = sky / 15;
  const blkN = blk / 15;
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    waterPositions.push(cx * CHUNK_SIZE + corner[0], corner[1], cz * CHUNK_SIZE + corner[2]);
    waterNormals.push(...face.n);
    waterLights.push(skyN, blkN);
  }
  waterIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emitTransparentFace(
  cx: number,
  cz: number,
  x: number,
  y: number,
  z: number,
  block: Block,
  face: FaceDef,
  sky: number,
  blk: number,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  atlas: number[],
  lightArr: number[],
  indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z, n = face.n;
  const tile = tileForBlockFace(block, n), rect = tileRect(tile);
  const variation = colorVariation(block, wx, y, wz, n[1]);
  const shade = face.shade;
  const base = positions.length / 3;
  const plane = n[face.dAxis] > 0 ? (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z) + 1 : (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z);
  const u0 = face.uAxis === 0 ? x : face.uAxis === 1 ? y : z;
  const v0 = face.vAxis === 0 ? x : face.vAxis === 1 ? y : z;
  const corners = face.corners(plane, u0, v0, u0 + 1, v0 + 1);
  const uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  const skyN = sky / 15;
  const blkN = blk / 15;
  for (let i = 0; i < 4; i++) {
    const corner = corners[i];
    positions.push(cx * CHUNK_SIZE + corner[0], corner[1], cz * CHUNK_SIZE + corner[2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(shade * variation[0], shade * variation[1], shade * variation[2]);
    lightArr.push(skyN, blkN);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}


function emitQuad(input: {
  cx: number;
  cz: number;
  d: number;
  u: number;
  v: number;
  width: number;
  height: number;
  face: FaceDef;
  cell: MaskCell;
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  atlas: number[];
  lights: number[];
  indices: number[];
}): void {
  const {
    cx,
    cz,
    d,
    u,
    v,
    width,
    height,
    face,
    cell,
    positions,
    normals,
    colors,
    uvs,
    atlas,
    lights,
    indices,
  } = input;
  const base = positions.length / 3;
  const plane = face.n[face.dAxis] > 0 ? d + 1 : d;
  const corners = face.corners(plane, u, v, u + width, v + height);
  const rect = tileRect(cell.tile);
  const skyN = cell.sky / 15;
  const blkN = cell.blk / 15;

  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    const wx = cx * CHUNK_SIZE + corner[0];
    const wz = cz * CHUNK_SIZE + corner[2];
    const variation = colorVariation(cell.block, wx, corner[1], wz, face.n[1]);
    positions.push(wx, corner[1], wz);
    normals.push(...face.n);
    uvs.push(corner[face.uAxis] - u, corner[face.vAxis] - v);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(
      cell.shade * variation[0],
      cell.shade * variation[1],
      cell.shade * variation[2],
    );
    lights.push(skyN, blkN);
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
