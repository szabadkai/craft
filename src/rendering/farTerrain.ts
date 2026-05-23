import * as THREE from 'three';
import type { FarTerrainOut } from '../farTerrainWorker';

type FarTerrainRequest = {
  requestId: number;
  pcx: number;
  pcz: number;
  seed: number;
  farRadius: number;
  detailRadius: number;
};

export class FarTerrainSystem {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  private readonly worker: Worker;
  private waterMesh: THREE.Mesh | null = null;
  private lastKey = '';
  private inFlight = false;
  private pendingRequest: FarTerrainRequest | null = null;
  private nextRequestId = 1;
  private activeRequestId = 0;
  private readonly deferredGeometries: THREE.BufferGeometry[] = [];
  private lastBuildMsValue = 0;
  private worstBuildMsValue = 0;
  private lastDisposeMsValue = 0;
  private worstDisposeMsValue = 0;

  constructor(
    scene: THREE.Scene,
    private readonly waterMaterial: THREE.ShaderMaterial,
  ) {
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float alpha;\nvarying float vFarAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarAlpha = alpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFarAlpha;')
        .replace('#include <opaque_fragment>', 'diffuseColor.a *= vFarAlpha;\n#include <opaque_fragment>');
    };
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

  get lastDisposeMs(): number {
    return this.lastDisposeMsValue;
  }

  get worstDisposeMs(): number {
    return this.worstDisposeMsValue;
  }

  requestRebuild(pcx: number, pcz: number, seed: number, farRadius: number, detailRadius?: number): void {
    const dr = detailRadius ?? farRadius;
    const key = `${pcx},${pcz},${seed},${farRadius},${dr}`;
    if (key === this.lastKey) return;

    const request = { requestId: this.nextRequestId++, pcx, pcz, seed, farRadius, detailRadius: dr };
    if (this.inFlight) {
      this.pendingRequest = request;
      return;
    }
    this.dispatchRequest(request, key);
  }

  update(disposalBudgetMs = 0.7): void {
    const startedAt = performance.now();
    let disposed = 0;
    while (this.deferredGeometries.length > 0 && performance.now() - startedAt < disposalBudgetMs) {
      const geometry = this.deferredGeometries.shift();
      geometry?.dispose();
      disposed++;
    }
    this.lastDisposeMsValue = disposed > 0 ? performance.now() - startedAt : 0;
    this.worstDisposeMsValue = Math.max(this.worstDisposeMsValue, this.lastDisposeMsValue);
  }

  private dispatchRequest(request: FarTerrainRequest, key: string): void {
    this.inFlight = true;
    this.lastKey = key;
    this.activeRequestId = request.requestId;
    this.worker.postMessage(request);
  }

  private handleResult(data: FarTerrainOut): void {
    this.inFlight = false;

    if (this.pendingRequest) {
      const req = this.pendingRequest;
      this.pendingRequest = null;
      const key = `${req.pcx},${req.pcz},${req.seed},${req.farRadius},${req.detailRadius}`;
      if (key !== this.lastKey) {
        this.dispatchRequest(req, key);
      }
      if (data.requestId !== this.activeRequestId) return;
    }

    if (data.requestId !== this.activeRequestId) {
      return;
    }

    const startedAt = performance.now();
    this.clear();

    if (data.positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geo.setAttribute('alpha', new THREE.BufferAttribute(data.alphas, 1));
      geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 64, 0), 100000);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.renderOrder = -1;
      this.group.add(mesh);
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
      this.deferredGeometries.push(mesh.geometry);
    }
    this.group.clear();
    this.waterMesh = null;
  }
}
