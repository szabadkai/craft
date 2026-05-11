import * as THREE from 'three';
import { blockColor } from '../blocks';
import { generatedBlockAt, terrainHeight } from '../terrain';
import { Block, CHUNK_SIZE, DETAIL_RADIUS, FAR_RADIUS } from '../types';

export class FarTerrainSystem {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  rebuild(pcx: number, pcz: number, seed: number): void {
    this.clear();

    const step = 4;
    const patchChunkSpan = 2;
    const ringMin = DETAIL_RADIUS - 1;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let cz = pcz - FAR_RADIUS; cz <= pcz + FAR_RADIUS; cz += patchChunkSpan) {
      for (let cx = pcx - FAR_RADIUS; cx <= pcx + FAR_RADIUS; cx += patchChunkSpan) {
        const d = Math.hypot(cx + patchChunkSpan * 0.5 - pcx, cz + patchChunkSpan * 0.5 - pcz);
        if (d < ringMin || d > FAR_RADIUS) continue;
        appendFarPatch(cx, cz, step, patchChunkSpan, seed, positions, colors, indices);
      }
    }

    if (positions.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.group.add(new THREE.Mesh(geo, this.material));
  }

  private clear(): void {
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
    }
    this.group.clear();
  }
}

function appendFarPatch(
  cx: number,
  cz: number,
  step: number,
  chunkSpan: number,
  seed: number,
  positions: number[],
  colors: number[],
  indices: number[],
): void {
  const baseVertex = positions.length / 3;
  const patchSize = CHUNK_SIZE * chunkSpan;
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

function terrainColorNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.01) * 43758.5453;
  return n - Math.floor(n);
}
