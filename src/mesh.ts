import { isSolid } from './blocks';
import { Tile, tileForBlockFace, tileRect } from './atlas';
import { generatedBlockAt } from './terrain';
import { Block, blockIndex, CHUNK_SIZE, ChunkMeshPayload, chunkKey, WORLD_HEIGHT } from './types';

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

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function colorVariation(
  block: Block,
  wx: number,
  y: number,
  wz: number,
  normalY: number,
): [number, number, number] {
  const n = hash3(wx, y + block * 19, wz);
  const warm = hash3(wx + 83, y + 17, wz - 41);
  const strength =
    block === Block.Stone || block === Block.CoalOre || block === Block.IronOre ? 0.08 : 0.1;
  const value = 1 + (n - 0.5) * strength;
  const topGrass = block === Block.Grass && normalY > 0 ? 1 : 0;
  const r = value * (1 + (warm - 0.5) * 0.04 - topGrass * 0.03);
  const g = value * (1 + topGrass * 0.06);
  const b = value * (1 - topGrass * 0.04);
  return [r, g, b];
}

export function buildChunkMesh(
  cx: number,
  cz: number,
  seed: number,
  blocks: Uint16Array,
): ChunkMeshPayload {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const atlas: number[] = [];
  const indices: number[] = [];
  const waterPositions: number[] = [];
  const waterNormals: number[] = [];
  const waterIndices: number[] = [];
  const transparentPositions: number[] = [];
  const transparentNormals: number[] = [];
  const transparentColors: number[] = [];
  const transparentUvs: number[] = [];
  const transparentAtlas: number[] = [];
  const transparentIndices: number[] = [];
  const decoPositions: number[] = [];
  const decoNormals: number[] = [];
  const decoColors: number[] = [];
  const decoUvs: number[] = [];
  const decoAtlas: number[] = [];
  const decoIndices: number[] = [];

  const getBlock = (x: number, y: number, z: number): Block => {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
      return blocks[blockIndex(x, y, z)] as Block;
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
          mask[index] =
            block !== Block.Air && block !== Block.Water && block !== Block.Lava && block !== Block.Glass && block !== Block.Leaves && block !== Block.BirchLeaves && block !== Block.IronBars && !isDecoration(block) && !isSlab(block) && !isStair(block) && !occludesFace(block, neighbor)
              ? { block, tile: tileForBlockFace(block, face.n), shade: face.shade }
              : null;
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
          if (neighbor !== Block.Air && neighbor !== Block.Water && !isDecoration(neighbor) && neighbor !== Block.OakDoorOpen) continue;
          emitTransparentFace(cx, cz, x, y, z, block, face, transparentPositions, transparentNormals, transparentColors, transparentUvs, transparentAtlas, transparentIndices);
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
          emitWaterBlockFace(cx, cz, x, y, z, face, waterPositions, waterNormals, waterIndices);
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
          if (neighbor === Block.Lava || isSolid(neighbor)) continue;
          emitTransparentFace(cx, cz, x, y, z, Block.Lava, face, transparentPositions, transparentNormals, transparentColors, transparentUvs, transparentAtlas, transparentIndices);
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
          emitSlabFace(cx, cz, x, y, z, block, face, positions, normals, colors, uvs, atlas, indices);
        }
      }
    }
  }

  emitDecorations(cx, cz, getBlock, decoPositions, decoNormals, decoColors, decoUvs, decoAtlas, decoIndices);

  // Emit individual stair faces (non-greedy, stepped geometry)
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (!isStair(block)) continue;
        emitStairFaces(cx, cz, x, y, z, block, getBlock, positions, normals, colors, uvs, atlas, indices);
      }
    }
  }

  return {
    key: chunkKey(cx, cz),
    cx,
    cz,
    blocks,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    atlas: new Float32Array(atlas),
    indices: new Uint32Array(indices),
    waterPositions: waterPositions.length > 0 ? new Float32Array(waterPositions) : null,
    waterNormals: waterNormals.length > 0 ? new Float32Array(waterNormals) : null,
    waterIndices: waterIndices.length > 0 ? new Uint32Array(waterIndices) : null,
    transparentPositions: transparentPositions.length > 0 ? new Float32Array(transparentPositions) : null,
    transparentNormals: transparentNormals.length > 0 ? new Float32Array(transparentNormals) : null,
    transparentColors: transparentColors.length > 0 ? new Float32Array(transparentColors) : null,
    transparentUvs: transparentUvs.length > 0 ? new Float32Array(transparentUvs) : null,
    transparentAtlas: transparentAtlas.length > 0 ? new Float32Array(transparentAtlas) : null,
    transparentIndices: transparentIndices.length > 0 ? new Uint32Array(transparentIndices) : null,
    decoPositions: decoPositions.length > 0 ? new Float32Array(decoPositions) : null,
    decoNormals: decoNormals.length > 0 ? new Float32Array(decoNormals) : null,
    decoColors: decoColors.length > 0 ? new Float32Array(decoColors) : null,
    decoUvs: decoUvs.length > 0 ? new Float32Array(decoUvs) : null,
    decoAtlas: decoAtlas.length > 0 ? new Float32Array(decoAtlas) : null,
    decoIndices: decoIndices.length > 0 ? new Uint32Array(decoIndices) : null,
  };
}

function isDecoration(block: Block): boolean {
  return (
    block === Block.TallGrass ||
    block === Block.RedFlower ||
    block === Block.YellowFlower ||
    block === Block.BlueFlower ||
    block === Block.Mushroom ||
    block === Block.BerryBush ||
    block === Block.OakDoorOpen ||
    block === Block.AmethystCluster ||
    block === Block.GlowBerry
  );
}

function isSlab(block: Block): boolean {
  return (
    block === Block.OakSlab ||
    block === Block.OakSlabTop ||
    block === Block.CobblestoneSlab ||
    block === Block.CobblestoneSlabTop
  );
}

function isStair(block: Block): boolean {
  return (
    block === Block.OakStairsN || block === Block.OakStairsS ||
    block === Block.OakStairsE || block === Block.OakStairsW ||
    block === Block.CobblestoneStairsN || block === Block.CobblestoneStairsS ||
    block === Block.CobblestoneStairsE || block === Block.CobblestoneStairsW
  );
}

/** Returns the direction the upper step faces: 'n', 's', 'e', or 'w' */
function stairDir(block: Block): 'n' | 's' | 'e' | 'w' {
  switch (block) {
    case Block.OakStairsN: case Block.CobblestoneStairsN: return 'n';
    case Block.OakStairsS: case Block.CobblestoneStairsS: return 's';
    case Block.OakStairsE: case Block.CobblestoneStairsE: return 'e';
    case Block.OakStairsW: case Block.CobblestoneStairsW: return 'w';
    default: return 'n';
  }
}

function stairMaterial(block: Block): Block {
  if (block === Block.OakStairsN || block === Block.OakStairsS ||
      block === Block.OakStairsE || block === Block.OakStairsW) return Block.OakSlab;
  return Block.CobblestoneSlab;
}

function slabTopY(block: Block): number {
  return (block === Block.OakSlabTop || block === Block.CobblestoneSlabTop) ? 0.5 : 0;
}

function slabFaceVisible(face: FaceDef, neighbor: Block, _slabBlock: Block, _slabY: number): boolean {
  // Face visible only against air, water, or decorations
  if (neighbor === Block.Air) return true;
  if (neighbor === Block.Water || isDecoration(neighbor)) return true;
  // Occluded by full solid blocks and other slabs
  return false;
}

function occludesFace(block: Block, neighbor: Block): boolean {
  if (block === Block.Water) return neighbor === Block.Water || isSolid(neighbor);
  // Open doors don't occlude adjacent faces
  if (block === Block.OakDoorOpen) return false;
  return isSolid(neighbor);
}

function sameCell(a: MaskCell, b: MaskCell | null): boolean {
  return Boolean(b && a.block === b.block && a.tile === b.tile && a.shade === b.shade);
}

function emitWaterBlockFace(
  cx: number,
  cz: number,
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  waterPositions: number[],
  waterNormals: number[],
  waterIndices: number[],
): void {
  const base = waterPositions.length / 3;
  const plane = face.n[face.dAxis] > 0 ? (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z) + 1 : (face.dAxis === 0 ? x : face.dAxis === 1 ? y : z);
  const u0 = face.uAxis === 0 ? x : face.uAxis === 1 ? y : z;
  const v0 = face.vAxis === 0 ? x : face.vAxis === 1 ? y : z;
  const corners = face.corners(plane, u0, v0, u0 + 1, v0 + 1);
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    waterPositions.push(cx * CHUNK_SIZE + corner[0], corner[1], cz * CHUNK_SIZE + corner[2]);
    waterNormals.push(...face.n);
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
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  atlas: number[],
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
  for (let i = 0; i < 4; i++) {
    const corner = corners[i];
    positions.push(cx * CHUNK_SIZE + corner[0], corner[1], cz * CHUNK_SIZE + corner[2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(shade * variation[0], shade * variation[1], shade * variation[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emitSlabFace(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, face: FaceDef,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z, n = face.n;
  const tile = tileForBlockFace(block, n), rect = tileRect(tile);
  const topOff = slabTopY(block), yMin = y + topOff, yMax = y + topOff + 0.5;
  const v = colorVariation(block, wx, y, wz, n[1]), sh = face.shade;
  let corners: [number, number, number][];
  if (n[0] > 0) corners = [[wx + 1, yMin, wz], [wx + 1, yMax, wz], [wx + 1, yMax, wz + 1], [wx + 1, yMin, wz + 1]];
  else if (n[0] < 0) corners = [[wx, yMin, wz + 1], [wx, yMax, wz + 1], [wx, yMax, wz], [wx, yMin, wz]];
  else if (n[1] > 0) corners = [[wx, yMax, wz + 1], [wx + 1, yMax, wz + 1], [wx + 1, yMax, wz], [wx, yMax, wz]];
  else if (n[1] < 0) corners = [[wx, yMin, wz], [wx + 1, yMin, wz], [wx + 1, yMin, wz + 1], [wx, yMin, wz + 1]];
  else if (n[2] > 0) corners = [[wx + 1, yMin, wz + 1], [wx + 1, yMax, wz + 1], [wx, yMax, wz + 1], [wx, yMin, wz + 1]];
  else corners = [[wx, yMin, wz], [wx, yMax, wz], [wx + 1, yMax, wz], [wx + 1, yMin, wz]];
  const base = positions.length / 3, uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let i = 0; i < 4; i++) {
    positions.push(corners[i][0], corners[i][1], corners[i][2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(sh * v[0], sh * v[1], sh * v[2]);
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
    indices,
  } = input;
  const base = positions.length / 3;
  const plane = face.n[face.dAxis] > 0 ? d + 1 : d;
  const corners = face.corners(plane, u, v, u + width, v + height);
  const rect = tileRect(cell.tile);

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
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emitStairFaces(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, getBlock: (x: number, y: number, z: number) => Block,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const dir = stairDir(block), matBlock = stairMaterial(block);
  const variation = colorVariation(matBlock, wx, y + 1, wz, 1);
  const upperX0 = dir === 'e' ? x + 0.5 : x, upperX1 = dir === 'w' ? x + 0.5 : x + 1;
  const upperZ0 = dir === 'n' ? z : z + 0.5, upperZ1 = dir === 's' ? z + 0.5 : z + 1;
  const Y0 = y, Y1 = y + 0.5, Y2 = y + 1;

  const emit = (n: [number, number, number], c: [number, number, number][], shade: number) => {
    const base = positions.length / 3, tile = tileForBlockFace(matBlock, n);
    const rect = tileRect(tile), uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    for (let i = 0; i < 4; i++) {
      positions.push(cx * CHUNK_SIZE + c[i][0], c[i][1], cz * CHUNK_SIZE + c[i][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[i][0], uv[i][1]);
      atlas.push(rect[0], rect[1], rect[2], rect[3]);
      colors.push(shade * variation[0], shade * variation[1], shade * variation[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const air = (b: Block) => b === Block.Air || b === Block.Water || isDecoration(b);

  // Lower base (y..y+0.5, full 1x1)
  if (Y0 === 0 || air(getBlock(x, Y0 - 1, z))) emit([0, -1, 0], [[x, Y0, z], [x + 1, Y0, z], [x + 1, Y0, z + 1], [x, Y0, z + 1]], 0.72);
  if (air(getBlock(x + 1, Y0, z))) emit([1, 0, 0], [[x + 1, Y0, z], [x + 1, Y1, z], [x + 1, Y1, z + 1], [x + 1, Y0, z + 1]], 0.98);
  if (air(getBlock(x - 1, Y0, z))) emit([-1, 0, 0], [[x, Y0, z + 1], [x, Y1, z + 1], [x, Y1, z], [x, Y0, z]], 0.92);
  if (air(getBlock(x, Y0, z + 1))) emit([0, 0, 1], [[x + 1, Y0, z + 1], [x + 1, Y1, z + 1], [x, Y1, z + 1], [x, Y0, z + 1]], 1);
  if (air(getBlock(x, Y0, z - 1))) emit([0, 0, -1], [[x, Y0, z], [x, Y1, z], [x + 1, Y1, z], [x + 1, Y0, z]], 0.88);

  // Upper step (y+0.5..y+1, half depth)
  if (Y2 >= WORLD_HEIGHT || air(getBlock(x, Y2, z))) emit([0, 1, 0], [[upperX0, Y2, upperZ0], [upperX1, Y2, upperZ0], [upperX1, Y2, upperZ1], [upperX0, Y2, upperZ1]], 1);
  if (dir !== 'e' && air(getBlock(x + 1, Y1, z))) emit([1, 0, 0], [[x + 1, Y1, z], [x + 1, Y2, z], [x + 1, Y2, upperZ1], [x + 1, Y1, upperZ1]], 0.98);
  if (dir !== 'w' && air(getBlock(x - 1, Y1, z))) emit([-1, 0, 0], [[x, Y1, upperZ1], [x, Y2, upperZ1], [x, Y2, z], [x, Y1, z]], 0.92);
  if (dir !== 's' && air(getBlock(x, Y1, z + 1))) emit([0, 0, 1], [[upperX1, Y1, z + 1], [upperX1, Y2, z + 1], [upperX0, Y2, z + 1], [upperX0, Y1, z + 1]], 1);
  if (dir !== 'n' && air(getBlock(x, Y1, z - 1))) emit([0, 0, -1], [[upperX0, Y1, z], [upperX0, Y2, z], [upperX1, Y2, z], [upperX1, Y1, z]], 0.88);

  // Riser face
  if (dir === 'n') emit([0, 0, 1], [[x, Y1, z + 0.5], [x, Y2, z + 0.5], [x + 1, Y2, z + 0.5], [x + 1, Y1, z + 0.5]], 1);
  else if (dir === 's') emit([0, 0, -1], [[x + 1, Y1, z + 0.5], [x + 1, Y2, z + 0.5], [x, Y2, z + 0.5], [x, Y1, z + 0.5]], 0.88);
  else if (dir === 'e') emit([1, 0, 0], [[x + 0.5, Y1, z], [x + 0.5, Y2, z], [x + 0.5, Y2, z + 1], [x + 0.5, Y1, z + 1]], 0.98);
  else emit([-1, 0, 0], [[x + 0.5, Y1, z + 1], [x + 0.5, Y2, z + 1], [x + 0.5, Y2, z], [x + 0.5, Y1, z]], 0.92);

  // Exposed lower top face
  if (dir === 'n' || dir === 's') {
    const e0 = dir === 'n' ? z + 0.5 : z, e1 = dir === 'n' ? z + 1 : z + 0.5;
    if (air(getBlock(x, Y2, z))) emit([0, 1, 0], [[x, Y1, e0], [x + 1, Y1, e0], [x + 1, Y1, e1], [x, Y1, e1]], 1);
  } else {
    const e0 = dir === 'e' ? x : x + 0.5, e1 = dir === 'e' ? x + 0.5 : x + 1;
    if (air(getBlock(x, Y2, z))) emit([0, 1, 0], [[e0, Y1, z], [e1, Y1, z], [e1, Y1, z + 1], [e0, Y1, z + 1]], 1);
  }
}

function emitDecorations(
  cx: number,
  cz: number,
  getBlock: (x: number, y: number, z: number) => Block,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  atlas: number[],
  indices: number[],
): void {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (block === Block.OakDoorOpen) {
          emitOpenDoorQuad(cx, cz, x, y, z, positions, normals, colors, uvs, atlas, indices);
          continue;
        }
        if (!isDecoration(block)) continue;
        emitPlantQuad(
          cx,
          cz,
          x,
          y,
          z,
          block,
          positions,
          normals,
          colors,
          uvs,
          atlas,
          indices,
          false,
        );
        emitPlantQuad(
          cx,
          cz,
          x,
          y,
          z,
          block,
          positions,
          normals,
          colors,
          uvs,
          atlas,
          indices,
          true,
        );
      }
    }
  }
}

function emitPlantQuad(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], indices: number[], rotated: boolean,
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(tileForBlockFace(block, [0, 1, 0]));
  const inset = block === Block.BerryBush ? 0.14 : block === Block.Mushroom ? 0.3 : 0.22;
  const h = block === Block.BerryBush ? 0.82 : block === Block.Mushroom ? 0.62 : 1;
  const c: [number, number, number][] = rotated
    ? [[wx + inset, y, wz + inset], [wx + inset, y + h, wz + inset], [wx + 1 - inset, y + h, wz + 1 - inset], [wx + 1 - inset, y, wz + 1 - inset]]
    : [[wx + 1 - inset, y, wz + inset], [wx + 1 - inset, y + h, wz + inset], [wx + inset, y + h, wz + 1 - inset], [wx + inset, y, wz + 1 - inset]];
  const v = colorVariation(block, wx, y, wz, 1);
  const base = positions.length / 3, uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let i = 0; i < 4; i++) {
    positions.push(c[i][0], c[i][1], c[i][2]);
    normals.push(0, 1, 0);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(v[0], v[1], v[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Render an open oak door as a thin panel visible from the side.
 * The panel spans the block face with a narrow thickness so it's visible
 * but doesn't block movement (OakDoorOpen is not solid).
 */
function emitOpenDoorQuad(
  cx: number, cz: number, x: number, y: number, z: number,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(Tile.DoorOak);
  const thickness = 0.08, half = 0.5, faceZ = wz - half;
  const v = colorVariation(Block.Planks, wx, y, wz, 1);
  const uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];

  const emitPanel = (
    n: [number, number, number],
    verts: [number, number, number][],
  ) => {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      positions.push(verts[i][0], verts[i][1], verts[i][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[i][0], uv[i][1]);
      atlas.push(rect[0], rect[1], rect[2], rect[3]);
      colors.push(v[0], v[1], v[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  emitPanel([0, 0, 1], [
    [wx - half, y, faceZ], [wx - half, y + 1, faceZ],
    [wx + half, y + 1, faceZ + thickness], [wx + half, y, faceZ + thickness],
  ]);
  emitPanel([0, 0, -1], [
    [wx - half, y, faceZ + thickness], [wx - half, y + 1, faceZ + thickness],
    [wx + half, y + 1, faceZ], [wx + half, y, faceZ],
  ]);
}
