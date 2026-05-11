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
            block !== Block.Air && !isDecoration(block) && !occludesFace(block, neighbor)
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

  emitDecorations(cx, cz, getBlock, positions, normals, colors, uvs, atlas, indices);

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
  };
}

function isDecoration(block: Block): boolean {
  return (
    block === Block.TallGrass ||
    block === Block.RedFlower ||
    block === Block.YellowFlower ||
    block === Block.BlueFlower ||
    block === Block.Mushroom ||
    block === Block.BerryBush
  );
}

function occludesFace(block: Block, neighbor: Block): boolean {
  if (block === Block.Water) return neighbor === Block.Water || isSolid(neighbor);
  return isSolid(neighbor);
}

function sameCell(a: MaskCell, b: MaskCell | null): boolean {
  return Boolean(b && a.block === b.block && a.tile === b.tile && a.shade === b.shade);
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
  cx: number,
  cz: number,
  x: number,
  y: number,
  z: number,
  block: Block,
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  atlas: number[],
  indices: number[],
  rotated: boolean,
): void {
  const base = positions.length / 3;
  const wx = cx * CHUNK_SIZE + x;
  const wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(tileForBlockFace(block, [0, 1, 0]));
  const inset = block === Block.BerryBush ? 0.14 : block === Block.Mushroom ? 0.3 : 0.22;
  const height = block === Block.BerryBush ? 0.82 : block === Block.Mushroom ? 0.62 : 1;
  const corners: [number, number, number][] = rotated
    ? [
        [wx + inset, y, wz + inset],
        [wx + inset, y + height, wz + inset],
        [wx + 1 - inset, y + height, wz + 1 - inset],
        [wx + 1 - inset, y, wz + 1 - inset],
      ]
    : [
        [wx + 1 - inset, y, wz + inset],
        [wx + 1 - inset, y + height, wz + inset],
        [wx + inset, y + height, wz + 1 - inset],
        [wx + inset, y, wz + 1 - inset],
      ];
  const quadUvs: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];
  const variation = colorVariation(block, wx, y, wz, 1);
  for (let i = 0; i < corners.length; i++) {
    positions.push(...corners[i]);
    normals.push(0, 1, 0);
    uvs.push(quadUvs[i][0], quadUvs[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(variation[0], variation[1], variation[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
