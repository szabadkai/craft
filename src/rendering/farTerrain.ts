import * as THREE from 'three';
import type { FarTerrainOut } from '../farTerrainWorker';
import { CHUNK_SIZE } from '../types';

export class FarTerrainSystem {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  private readonly worker: Worker;
  private waterMesh: THREE.Mesh | null = null;
  private lastKey = '';
  private inFlight = false;
  private pendingRequest: { pcx: number; pcz: number; seed: number; farRadius: number; detailRadius: number } | null = null;
  private lastBuildMsValue = 0;
  private worstBuildMsValue = 0;

  constructor(
    scene: THREE.Scene,
    private readonly waterMaterial: THREE.ShaderMaterial,
  ) {
    scene.add(this.group);
    this.worker = new Worker(new URL('../farTerrainWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<FarTerrainOut>) => {
      this.handleResult(event.data);
    };
  }

  get lastBuildMs(): number {
    return this.lastBuildMsValue;
  }

  get worstBuildMs(): number {
    return this.worstBuildMsValue;
  }

  requestRebuild(pcx: number, pcz: number, seed: number, farRadius: number, detailRadius?: number): void {
    const dr = detailRadius ?? farRadius;
    const key = `${pcx},${pcz},${seed},${farRadius}`;
    if (key === this.lastKey) return;

    const request = { pcx, pcz, seed, farRadius, detailRadius: dr };
    if (this.inFlight) {
      this.pendingRequest = request;
      return;
    }
    this.dispatchRequest(request, key);
  }

  private dispatchRequest(request: { pcx: number; pcz: number; seed: number; farRadius: number; detailRadius: number }, key: string): void {
    this.inFlight = true;
    this.lastKey = key;
    this.worker.postMessage(request);
  }

  private handleResult(data: FarTerrainOut): void {
    const startedAt = performance.now();
    this.inFlight = false;

    if (this.pendingRequest) {
      const req = this.pendingRequest;
      this.pendingRequest = null;
      const key = `${req.pcx},${req.pcz},${req.seed},${req.farRadius}`;
      if (key !== this.lastKey) {
        this.dispatchRequest(req, key);
      }
    }

    this.clear();

    if (data.positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 64, 0), 100000);
      this.group.add(new THREE.Mesh(geo, this.material));
    }

    if (data.waterPositions.length > 0) {
      const waterGeo = new THREE.BufferGeometry();
      waterGeo.setAttribute('position', new THREE.BufferAttribute(data.waterPositions, 3));
      waterGeo.setIndex(new THREE.BufferAttribute(data.waterIndices, 1));
      waterGeo.computeVertexNormals();
      waterGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 64, 0), 100000);
      this.waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
      this.waterMesh.renderOrder = 1;
      this.group.add(this.waterMesh);
    }

    this.lastBuildMsValue = performance.now() - startedAt;
    this.worstBuildMsValue = Math.max(this.worstBuildMsValue, this.lastBuildMsValue);
  }

  private clear(): void {
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
    }
    this.group.clear();
    this.waterMesh = null;
  }
}
