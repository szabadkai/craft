import * as THREE from 'three';
import { blockColor } from '../blocks';
import { generatedBlockAt, reservoirWaterSurfaceAt, terrainHeight } from '../terrain';
import { getDetailRadius } from '../player/renderDistance';
import { Block, CHUNK_SIZE } from '../types';

export class FarTerrainSystem {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  private waterMesh: THREE.Mesh | null = null;
  private pendingRebuild: number | null = null;
  private lastKey = '';
  private lastBuildMsValue = 0;
  private worstBuildMsValue = 0;

  constructor(
    scene: THREE.Scene,
    private readonly waterMaterial: THREE.ShaderMaterial,
  ) {
    scene.add(this.group);
  }

  get lastBuildMs(): number {
    return this.lastBuildMsValue;
  }

  get worstBuildMs(): number {
    return this.worstBuildMsValue;
  }

  requestRebuild(pcx: number, pcz: number, seed: number, farRadius: number): void {
    const key = `${pcx},${pcz},${seed},${farRadius}`;
    if (key === this.lastKey) return;
    if (this.pendingRebuild !== null) window.clearTimeout(this.pendingRebuild);
    this.pendingRebuild = window.setTimeout(() => {
      this.pendingRebuild = null;
      this.rebuild(pcx, pcz, seed, farRadius);
    }, 140);
  }

  rebuild(pcx: number, pcz: number, seed: number, farRadius: number): void {
    const key = `${pcx},${pcz},${seed},${farRadius}`;
    if (key === this.lastKey) return;
    if (this.pendingRebuild !== null) {
      window.clearTimeout(this.pendingRebuild);
      this.pendingRebuild = null;
    }
    const startedAt = performance.now();
    this.clear();

    const step = 4;
    const patchChunkSpan = 2;
    const ringMin = getDetailRadius() - 1;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let cz = pcz - farRadius; cz <= pcz + farRadius; cz += patchChunkSpan) {
      for (let cx = pcx - farRadius; cx <= pcx + farRadius; cx += patchChunkSpan) {
        const d = Math.hypot(cx + patchChunkSpan * 0.5 - pcx, cz + patchChunkSpan * 0.5 - pcz);
        if (d < ringMin || d > farRadius) continue;
        appendFarPatch(cx, cz, step, patchChunkSpan, seed, positions, colors, indices);
      }
    }

    if (positions.length === 0) {
      this.recordBuild(key, startedAt);
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.group.add(new THREE.Mesh(geo, this.material));

    this.buildWater(pcx, pcz, seed, farRadius);
    this.recordBuild(key, startedAt);
  }

  private buildWater(pcx: number, pcz: number, seed: number, farRadius: number): void {
    const halfSide = farRadius * CHUNK_SIZE;
    const step = 8;
    const positions: number[] = [];
    const indices: number[] = [];
    const minX = pcx * CHUNK_SIZE - halfSide;
    const minZ = pcz * CHUNK_SIZE - halfSide;
    const maxX = pcx * CHUNK_SIZE + halfSide;
    const maxZ = pcz * CHUNK_SIZE + halfSide;

    for (let z = minZ; z < maxZ; z += step) {
      for (let x = minX; x < maxX; x += step) {
        const y = reservoirWaterSurfaceAt(x + step * 0.5, z + step * 0.5, seed);
        if (y === null) continue;
        const base = positions.length / 3;
        const wy = y - 0.05;
        positions.push(x, wy, z, x + step, wy, z, x + step, wy, z + step, x, wy, z + step);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    if (positions.length === 0) return;
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    waterGeo.setIndex(indices);
    waterGeo.computeVertexNormals();
    waterGeo.computeBoundingSphere();
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    this.waterMesh.renderOrder = 1;
    this.group.add(this.waterMesh);
  }

  private clear(): void {
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
    }
    this.group.clear();
    this.waterMesh = null;
  }

  private recordBuild(key: string, startedAt: number): void {
    this.lastKey = key;
    this.lastBuildMsValue = performance.now() - startedAt;
    this.worstBuildMsValue = Math.max(this.worstBuildMsValue, this.lastBuildMsValue);
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
