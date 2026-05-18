import { Tile, tileForBlockFace, tileRect } from '../atlas';
import { Block, CHUNK_SIZE, WORLD_HEIGHT } from '../types';

type FaceDef = {
  n: [number, number, number];
  dAxis: 0 | 1 | 2;
  uAxis: 0 | 1 | 2;
  vAxis: 0 | 1 | 2;
  shade: number;
  corners: (
    plane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
  ) => [number, number, number][];
};

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function colorVariation(
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

export function isDecoration(block: Block): boolean {
  return (
    block === Block.TallGrass ||
    block === Block.RedFlower ||
    block === Block.YellowFlower ||
    block === Block.BlueFlower ||
    block === Block.Mushroom ||
    block === Block.BerryBush ||
    block === Block.OakDoorOpen ||
    block === Block.AmethystCluster ||
    block === Block.GlowBerry ||
    block === Block.Torch ||
    block === Block.TorchN ||
    block === Block.TorchS ||
    block === Block.TorchE ||
    block === Block.TorchW
  );
}

export function isSlab(block: Block): boolean {
  return (
    block === Block.OakSlab ||
    block === Block.OakSlabTop ||
    block === Block.CobblestoneSlab ||
    block === Block.CobblestoneSlabTop
  );
}

export function isStair(block: Block): boolean {
  return (
    block === Block.OakStairsN || block === Block.OakStairsS ||
    block === Block.OakStairsE || block === Block.OakStairsW ||
    block === Block.CobblestoneStairsN || block === Block.CobblestoneStairsS ||
    block === Block.CobblestoneStairsE || block === Block.CobblestoneStairsW
  );
}

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

export function slabFaceVisible(face: FaceDef, neighbor: Block, _slabBlock: Block, _slabY: number): boolean {
  if (neighbor === Block.Air) return true;
  if (neighbor === Block.Water || isDecoration(neighbor)) return true;
  return false;
}

export function emitSlabFace(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, face: FaceDef, sky: number, blk: number,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], lightArr: number[], indices: number[],
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
  const skyN = sky / 15, blkN = blk / 15;
  for (let i = 0; i < 4; i++) {
    positions.push(corners[i][0], corners[i][1], corners[i][2]);
    normals.push(n[0], n[1], n[2]);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(sh * v[0], sh * v[1], sh * v[2]);
    lightArr.push(skyN, blkN);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function emitStairFaces(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, getBlock: (x: number, y: number, z: number) => Block,
  getLight: (x: number, y: number, z: number) => [number, number],
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], lightArr: number[], indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const dir = stairDir(block), matBlock = stairMaterial(block);
  const variation = colorVariation(matBlock, wx, y + 1, wz, 1);
  const upperX0 = dir === 'e' ? x + 0.5 : x, upperX1 = dir === 'w' ? x + 0.5 : x + 1;
  const upperZ0 = dir === 'n' ? z : z + 0.5, upperZ1 = dir === 's' ? z + 0.5 : z + 1;
  const Y0 = y, Y1 = y + 0.5, Y2 = y + 1;

  const emit = (n: [number, number, number], c: [number, number, number][], shade: number, lx: number, ly: number, lz: number) => {
    const [sky, blk] = getLight(lx, ly, lz);
    const skyN = sky / 15, blkN = blk / 15;
    const base = positions.length / 3, tile = tileForBlockFace(matBlock, n);
    const rect = tileRect(tile), uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    for (let i = 0; i < 4; i++) {
      positions.push(cx * CHUNK_SIZE + c[i][0], c[i][1], cz * CHUNK_SIZE + c[i][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[i][0], uv[i][1]);
      atlas.push(rect[0], rect[1], rect[2], rect[3]);
      colors.push(shade * variation[0], shade * variation[1], shade * variation[2]);
      lightArr.push(skyN, blkN);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const air = (b: Block) => b === Block.Air || b === Block.Water || isDecoration(b);

  if (Y0 === 0 || air(getBlock(x, Y0 - 1, z))) emit([0, -1, 0], [[x, Y0, z], [x + 1, Y0, z], [x + 1, Y0, z + 1], [x, Y0, z + 1]], 0.72, x, Y0 - 1, z);
  if (air(getBlock(x + 1, Y0, z))) emit([1, 0, 0], [[x + 1, Y0, z], [x + 1, Y1, z], [x + 1, Y1, z + 1], [x + 1, Y0, z + 1]], 0.98, x + 1, Y0, z);
  if (air(getBlock(x - 1, Y0, z))) emit([-1, 0, 0], [[x, Y0, z + 1], [x, Y1, z + 1], [x, Y1, z], [x, Y0, z]], 0.92, x - 1, Y0, z);
  if (air(getBlock(x, Y0, z + 1))) emit([0, 0, 1], [[x + 1, Y0, z + 1], [x + 1, Y1, z + 1], [x, Y1, z + 1], [x, Y0, z + 1]], 1, x, Y0, z + 1);
  if (air(getBlock(x, Y0, z - 1))) emit([0, 0, -1], [[x, Y0, z], [x, Y1, z], [x + 1, Y1, z], [x + 1, Y0, z]], 0.88, x, Y0, z - 1);

  if (Y2 >= WORLD_HEIGHT || air(getBlock(x, Y2, z))) emit([0, 1, 0], [[upperX0, Y2, upperZ0], [upperX1, Y2, upperZ0], [upperX1, Y2, upperZ1], [upperX0, Y2, upperZ1]], 1, x, Y2, z);
  if (dir !== 'e' && air(getBlock(x + 1, Y1, z))) emit([1, 0, 0], [[x + 1, Y1, z], [x + 1, Y2, z], [x + 1, Y2, upperZ1], [x + 1, Y1, upperZ1]], 0.98, x + 1, Y1, z);
  if (dir !== 'w' && air(getBlock(x - 1, Y1, z))) emit([-1, 0, 0], [[x, Y1, upperZ1], [x, Y2, upperZ1], [x, Y2, z], [x, Y1, z]], 0.92, x - 1, Y1, z);
  if (dir !== 's' && air(getBlock(x, Y1, z + 1))) emit([0, 0, 1], [[upperX1, Y1, z + 1], [upperX1, Y2, z + 1], [upperX0, Y2, z + 1], [upperX0, Y1, z + 1]], 1, x, Y1, z + 1);
  if (dir !== 'n' && air(getBlock(x, Y1, z - 1))) emit([0, 0, -1], [[upperX0, Y1, z], [upperX0, Y2, z], [upperX1, Y2, z], [upperX1, Y1, z]], 0.88, x, Y1, z - 1);

  // Internal step faces use the stair block's own light
  if (dir === 'n') emit([0, 0, 1], [[x, Y1, z + 0.5], [x, Y2, z + 0.5], [x + 1, Y2, z + 0.5], [x + 1, Y1, z + 0.5]], 1, x, y, z);
  else if (dir === 's') emit([0, 0, -1], [[x + 1, Y1, z + 0.5], [x + 1, Y2, z + 0.5], [x, Y2, z + 0.5], [x, Y1, z + 0.5]], 0.88, x, y, z);
  else if (dir === 'e') emit([1, 0, 0], [[x + 0.5, Y1, z], [x + 0.5, Y2, z], [x + 0.5, Y2, z + 1], [x + 0.5, Y1, z + 1]], 0.98, x, y, z);
  else emit([-1, 0, 0], [[x + 0.5, Y1, z + 1], [x + 0.5, Y2, z + 1], [x + 0.5, Y2, z], [x + 0.5, Y1, z]], 0.92, x, y, z);

  if (dir === 'n' || dir === 's') {
    const e0 = dir === 'n' ? z + 0.5 : z, e1 = dir === 'n' ? z + 1 : z + 0.5;
    if (air(getBlock(x, Y2, z))) emit([0, 1, 0], [[x, Y1, e0], [x + 1, Y1, e0], [x + 1, Y1, e1], [x, Y1, e1]], 1, x, y, z);
  } else {
    const e0 = dir === 'e' ? x : x + 0.5, e1 = dir === 'e' ? x + 0.5 : x + 1;
    if (air(getBlock(x, Y2, z))) emit([0, 1, 0], [[e0, Y1, z], [e1, Y1, z], [e1, Y1, z + 1], [e0, Y1, z + 1]], 1, x, y, z);
  }
}

export function emitDecorations(
  cx: number,
  cz: number,
  getBlock: (x: number, y: number, z: number) => Block,
  getLight: (x: number, y: number, z: number) => [number, number],
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  atlas: number[],
  lightArr: number[],
  indices: number[],
): void {
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = getBlock(x, y, z);
        if (block === Block.OakDoorOpen) {
          const [sky, blk] = getLight(x, y, z);
          emitOpenDoorQuad(cx, cz, x, y, z, sky, blk, positions, normals, colors, uvs, atlas, lightArr, indices);
          continue;
        }
        if (!isDecoration(block)) continue;
        const [sky, blk] = getLight(x, y, z);
        if (block === Block.TorchN || block === Block.TorchS || block === Block.TorchE || block === Block.TorchW) {
          emitWallTorchQuad(cx, cz, x, y, z, block, sky, blk, positions, normals, colors, uvs, atlas, lightArr, indices, false);
          emitWallTorchQuad(cx, cz, x, y, z, block, sky, blk, positions, normals, colors, uvs, atlas, lightArr, indices, true);
          continue;
        }
        emitPlantQuad(cx, cz, x, y, z, block, sky, blk, positions, normals, colors, uvs, atlas, lightArr, indices, false);
        emitPlantQuad(cx, cz, x, y, z, block, sky, blk, positions, normals, colors, uvs, atlas, lightArr, indices, true);
      }
    }
  }
}

function emitPlantQuad(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, sky: number, blk: number,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], lightArr: number[], indices: number[], rotated: boolean,
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(tileForBlockFace(block, [0, 1, 0]));
  const inset = block === Block.Torch ? 0.34 : block === Block.BerryBush ? 0.14 : block === Block.Mushroom ? 0.3 : 0.22;
  const h = block === Block.Torch ? 0.7 : block === Block.BerryBush ? 0.82 : block === Block.Mushroom ? 0.62 : 1;
  const c: [number, number, number][] = rotated
    ? [[wx + inset, y, wz + inset], [wx + inset, y + h, wz + inset], [wx + 1 - inset, y + h, wz + 1 - inset], [wx + 1 - inset, y, wz + 1 - inset]]
    : [[wx + 1 - inset, y, wz + inset], [wx + 1 - inset, y + h, wz + inset], [wx + inset, y + h, wz + 1 - inset], [wx + inset, y, wz + 1 - inset]];
  const v = colorVariation(block, wx, y, wz, 1);
  const skyN = sky / 15, blkN = blk / 15;
  const base = positions.length / 3, uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let i = 0; i < 4; i++) {
    positions.push(c[i][0], c[i][1], c[i][2]);
    normals.push(0, 1, 0);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(v[0], v[1], v[2]);
    lightArr.push(skyN, blkN);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function wallTorchOffset(block: Block): [number, number] {
  switch (block) {
    case Block.TorchN: return [0, -0.3];
    case Block.TorchS: return [0, 0.3];
    case Block.TorchE: return [0.3, 0];
    case Block.TorchW: return [-0.3, 0];
    default: return [0, 0];
  }
}

function emitWallTorchQuad(
  cx: number, cz: number, x: number, y: number, z: number,
  block: Block, sky: number, blk: number,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], lightArr: number[], indices: number[], rotated: boolean,
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(tileForBlockFace(block, [0, 1, 0]));
  const [ox, oz] = wallTorchOffset(block);
  const inset = 0.34, h = 0.7;
  const centerX = wx + 0.5 + ox, centerZ = wz + 0.5 + oz;
  const half = 0.5 - inset;
  const c: [number, number, number][] = rotated
    ? [
        [centerX - half, y + 0.15, centerZ - half],
        [centerX - half, y + 0.15 + h, centerZ - half],
        [centerX + half, y + 0.15 + h, centerZ + half],
        [centerX + half, y + 0.15, centerZ + half],
      ]
    : [
        [centerX + half, y + 0.15, centerZ - half],
        [centerX + half, y + 0.15 + h, centerZ - half],
        [centerX - half, y + 0.15 + h, centerZ + half],
        [centerX - half, y + 0.15, centerZ + half],
      ];
  const v = colorVariation(block, wx, y, wz, 1);
  const skyN = sky / 15, blkN = blk / 15;
  const base = positions.length / 3, uv: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let i = 0; i < 4; i++) {
    positions.push(c[i][0], c[i][1], c[i][2]);
    normals.push(0, 1, 0);
    uvs.push(uv[i][0], uv[i][1]);
    atlas.push(rect[0], rect[1], rect[2], rect[3]);
    colors.push(v[0], v[1], v[2]);
    lightArr.push(skyN, blkN);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emitOpenDoorQuad(
  cx: number, cz: number, x: number, y: number, z: number,
  sky: number, blk: number,
  positions: number[], normals: number[], colors: number[],
  uvs: number[], atlas: number[], lightArr: number[], indices: number[],
): void {
  const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
  const rect = tileRect(Tile.DoorOak);
  const thickness = 0.08, half = 0.5, faceZ = wz - half;
  const v = colorVariation(Block.Planks, wx, y, wz, 1);
  const skyN = sky / 15, blkN = blk / 15;
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
      lightArr.push(skyN, blkN);
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
