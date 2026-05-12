import * as THREE from 'three';
import { isSolid } from '../blocks';
import type { PlayerState } from '../player/playerController';
import { WorldStore } from '../persistence/worldStore';
import type { DiagnosticsSummary } from '../rendering/diagnostics';
import type { FarTerrainSystem } from '../rendering/farTerrain';
import { getDetailRadius, getFarRadius, getPreloadRadius } from '../player/renderDistance';
import {
  Block,
  blockIndex,
  CHUNK_SIZE,
  chunkKey,
  ChunkKey,
  ChunkMeshPayload,
  divFloor,
  mod,
  WorkerIn,
  WorkerOut,
  WORLD_HEIGHT,
} from '../types';
import type { WildlifeSystem } from './wildlife';

type LoadedChunk = {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  mesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null;
  transparentMesh: THREE.Mesh | null;
  decoMesh: THREE.Mesh | null;
  lastSeen: number;
  solidVoxels: number;
};

type PendingChunkRequest = {
  cx: number;
  cz: number;
  blocks?: Uint16Array;
};

type ChunkWorldOptions = {
  scene: THREE.Scene;
  chunkMaterial: THREE.ShaderMaterial;
  fadeMaterial: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial;
  transparentMaterial: THREE.ShaderMaterial;
  decoMaterial: THREE.ShaderMaterial;
  worldStore: WorldStore;
  farTerrain: FarTerrainSystem;
  wildlife: WildlifeSystem;
  player: PlayerState;
  getSeed: () => number;
  onChunkMessage: () => void;
};

const INITIAL_READY_RADIUS = 1;

export class ChunkWorldSystem {
  private readonly chunks = new Map<ChunkKey, LoadedChunk>();
  private readonly requested = new Set<ChunkKey>();
  private readonly dirty = new Set<ChunkKey>();
  private readonly chunkSaveTimers = new Map<ChunkKey, number>();
  private readonly workers: Worker[];
  private readonly pendingQueue: PendingChunkRequest[] = [];
  private readonly maxRequestsPerFrame: number;
  private nextWorkerIndex = 0;
  private playerChunkX = Number.NaN;
  private playerChunkZ = Number.NaN;

  constructor(private readonly options: ChunkWorldOptions) {
    const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
    this.workers = Array.from(
      { length: workerCount },
      () => new Worker(new URL('../chunkWorker.ts', import.meta.url), { type: 'module' }),
    );
    this.maxRequestsPerFrame = workerCount;
    for (const chunkWorker of this.workers) {
      chunkWorker.onmessage = (event: MessageEvent<WorkerOut>) => this.handleWorkerMessage(event);
    }
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  get workerCount(): number {
    return this.workers.length;
  }

  resetStreaming(): void {
    this.playerChunkX = Number.NaN;
    this.playerChunkZ = Number.NaN;
    this.pendingQueue.length = 0;
    this.requested.clear();
    this.dirty.clear();
    for (const timer of this.chunkSaveTimers.values()) window.clearTimeout(timer);
    this.chunkSaveTimers.clear();
  }

  clearLoadedChunks(): void {
    for (const [key, chunk] of this.chunks) {
      this.options.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      const material = chunk.mesh.material;
      if (material !== this.options.chunkMaterial) {
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
      if (chunk.waterMesh) {
        this.options.scene.remove(chunk.waterMesh);
        chunk.waterMesh.geometry.dispose();
      }
      if (chunk.transparentMesh) {
        this.options.scene.remove(chunk.transparentMesh);
        chunk.transparentMesh.geometry.dispose();
      }
      if (chunk.decoMesh) {
        this.options.scene.remove(chunk.decoMesh);
        chunk.decoMesh.geometry.dispose();
      }
      this.options.wildlife.removeForChunk(key);
    }
    this.chunks.clear();
    this.resetStreaming();
  }

  getBlock(wx: number, y: number, wz: number): Block {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return Block.Air;
    return chunk.blocks[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))] as Block;
  }

  setBlock(wx: number, y: number, wz: number, block: Block): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.blocks[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))] = block;
    this.scheduleChunkSave(key);
    this.remesh(cx, cz);
    this.remeshNeighbours(wx, wz);
  }

  /** Place multiple blocks at once, applying all changes before triggering a single remesh per chunk. */
  setBlocks(
    entries: { wx: number; y: number; wz: number; block: Block }[],
  ): void {
    if (entries.length === 0) return;
    // Group entries by chunk
    const chunkGroups = new Map<ChunkKey, { cx: number; cz: number; items: { wx: number; y: number; wz: number; block: Block }[] }>();
    for (const entry of entries) {
      if (entry.y < 0 || entry.y >= WORLD_HEIGHT) continue;
      const cx = divFloor(entry.wx, CHUNK_SIZE);
      const cz = divFloor(entry.wz, CHUNK_SIZE);
      const key = chunkKey(cx, cz);
      if (!this.chunks.has(key)) continue;
      let group = chunkGroups.get(key);
      if (!group) { group = { cx, cz, items: [] }; chunkGroups.set(key, group); }
      group.items.push(entry);
    }
    // Apply all block mutations first, then remesh each chunk once
    for (const [key, group] of chunkGroups) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      for (const e of group.items) {
        chunk.blocks[blockIndex(mod(e.wx, CHUNK_SIZE), e.y, mod(e.wz, CHUNK_SIZE))] = e.block;
      }
      this.scheduleChunkSave(key);
      // Force a single remesh — capture the full state with both blocks
      if (!this.dirty.has(key)) {
        this.dirty.add(key);
        const copy = new Uint16Array(chunk.blocks);
        this.postChunkJob(
          { type: 'remesh', cx: group.cx, cz: group.cz, seed: this.options.getSeed(), blocks: copy },
          [copy.buffer],
        );
      }
    }
    // Remesh neighbour chunks for blocks on chunk edges
    for (const [, group] of chunkGroups) {
      for (const e of group.items) {
        if (mod(e.wx, CHUNK_SIZE) === 0) this.remesh(group.cx - 1, group.cz);
        if (mod(e.wx, CHUNK_SIZE) === CHUNK_SIZE - 1) this.remesh(group.cx + 1, group.cz);
        if (mod(e.wz, CHUNK_SIZE) === 0) this.remesh(group.cx, group.cz - 1);
        if (mod(e.wz, CHUNK_SIZE) === CHUNK_SIZE - 1) this.remesh(group.cx, group.cz + 1);
      }
    }
  }

  private remeshNeighbours(wx: number, wz: number): ChunkKey | null {
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    if (mod(wx, CHUNK_SIZE) === 0) { this.remesh(cx - 1, cz); return chunkKey(cx - 1, cz); }
    if (mod(wx, CHUNK_SIZE) === CHUNK_SIZE - 1) { this.remesh(cx + 1, cz); return chunkKey(cx + 1, cz); }
    if (mod(wz, CHUNK_SIZE) === 0) { this.remesh(cx, cz - 1); return chunkKey(cx, cz - 1); }
    if (mod(wz, CHUNK_SIZE) === CHUNK_SIZE - 1) { this.remesh(cx, cz + 1); return chunkKey(cx, cz + 1); }
    return null;
  }

  updateChunkSet(frame: number): void {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    if (pcx !== this.playerChunkX || pcz !== this.playerChunkZ) {
      this.playerChunkX = pcx;
      this.playerChunkZ = pcz;
      this.options.farTerrain.rebuild(pcx, pcz, this.options.getSeed(), getFarRadius());
    }

    const preload = getPreloadRadius();
    const detail = getDetailRadius();
    for (let dz = -preload; dz <= preload; dz++) {
      for (let dx = -preload; dx <= preload; dx++) {
        const d = Math.hypot(dx, dz);
        if (d <= preload) this.requestChunk(pcx + dx, pcz + dz);
      }
    }

    for (const [key, chunk] of this.chunks) {
      const d = Math.hypot(chunk.cx - pcx, chunk.cz - pcz);
      chunk.mesh.visible = d <= detail + 1;
      if (chunk.waterMesh) chunk.waterMesh.visible = chunk.mesh.visible;
      if (chunk.transparentMesh) chunk.transparentMesh.visible = chunk.mesh.visible;
      if (chunk.decoMesh) chunk.decoMesh.visible = chunk.mesh.visible;
      if (chunk.mesh.visible) chunk.lastSeen = frame;
      if (d > preload + 3 && frame - chunk.lastSeen > 90) {
        this.options.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        if (chunk.waterMesh) {
          this.options.scene.remove(chunk.waterMesh);
          chunk.waterMesh.geometry.dispose();
        }
        if (chunk.transparentMesh) {
          this.options.scene.remove(chunk.transparentMesh);
          chunk.transparentMesh.geometry.dispose();
        }
        if (chunk.decoMesh) {
          this.options.scene.remove(chunk.decoMesh);
          chunk.decoMesh.geometry.dispose();
        }
        this.chunks.delete(key);
        this.options.wildlife.removeForChunk(key);
      }
    }
  }

  flushRequests(): void {
    this.pendingQueue.sort((a, b) => this.distSqToPlayer(a.cx, a.cz) - this.distSqToPlayer(b.cx, b.cz));
    for (let i = 0; i < this.maxRequestsPerFrame && this.pendingQueue.length > 0; i++) {
      const request = this.pendingQueue.shift()!;
      if (request.blocks) {
        this.postChunkJob(
          {
            type: 'remesh',
            cx: request.cx,
            cz: request.cz,
            seed: this.options.getSeed(),
            blocks: request.blocks,
          },
          [request.blocks.buffer],
        );
      } else {
        this.postChunkJob({
          type: 'generate',
          cx: request.cx,
          cz: request.cz,
          seed: this.options.getSeed(),
        });
      }
    }
  }

  loadingProgress(): { loaded: number; total: number; ready: boolean } {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    let loaded = 0;
    const total = (INITIAL_READY_RADIUS * 2 + 1) ** 2;
    for (let dz = -INITIAL_READY_RADIUS; dz <= INITIAL_READY_RADIUS; dz++) {
      for (let dx = -INITIAL_READY_RADIUS; dx <= INITIAL_READY_RADIUS; dx++) {
        if (this.chunks.has(chunkKey(pcx + dx, pcz + dz))) loaded++;
      }
    }
    return { loaded, total, ready: loaded === total };
  }

  settlePlayerAtLoadedSpawn(syncPlayer: () => void): void {
    const x = Math.floor(this.options.player.position.x);
    const z = Math.floor(this.options.player.position.z);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (!isSolid(this.getBlock(x, y, z))) continue;
      this.options.player.position.y = Math.min(
        WORLD_HEIGHT - this.options.player.height - 1,
        y + 1.02,
      );
      this.options.player.velocity.set(0, 0, 0);
      this.options.player.onGround = false;
      syncPlayer();
      return;
    }
  }

  updateTerrainMaterialTime(now: number): void {
    const seconds = now * 0.001;
    this.options.chunkMaterial.uniforms.time.value = seconds;
    this.options.fadeMaterial.uniforms.time.value = seconds;
    this.options.waterMaterial.uniforms.time.value = seconds;
    this.options.transparentMaterial.uniforms.time.value = seconds;
    this.options.decoMaterial.uniforms.time.value = seconds;
    for (const chunk of this.chunks.values()) {
      const material = chunk.mesh.material;
      if (material instanceof THREE.ShaderMaterial) material.uniforms.time.value = seconds;
    }
  }

  fadeChunks(now: number): void {
    for (const chunk of this.chunks.values()) {
      const mat = chunk.mesh.material as THREE.ShaderMaterial;
      if (!mat.transparent) continue;
      const age = Math.min(1, (now - chunk.mesh.userData.birth) / 360);
      mat.uniforms.opacity.value = 0.72 + age * 0.28;
      if (age >= 1) {
        chunk.mesh.material = this.options.chunkMaterial;
        mat.dispose();
      }
    }
  }

  summarizeDiagnostics(): DiagnosticsSummary {
    let visibleChunks = 0;
    let chunkVertices = 0;
    let chunkIndices = 0;
    let chunkBytes = 0;
    let visibleSolidVoxels = 0;

    for (const chunk of this.chunks.values()) {
      if (!chunk.mesh.visible) continue;
      visibleChunks++;
      const geometry = chunk.mesh.geometry;
      const position = geometry.getAttribute('position');
      if (position) chunkVertices += position.count;
      if (geometry.index) chunkIndices += geometry.index.count;
      for (const attribute of Object.values(geometry.attributes)) {
        const array = attribute.array as ArrayBufferView;
        chunkBytes += array.byteLength;
      }
      if (geometry.index) chunkBytes += (geometry.index.array as ArrayBufferView).byteLength;
      visibleSolidVoxels += chunk.solidVoxels;
    }

    return {
      loadedChunks: this.chunks.size,
      visibleChunks,
      chunkVertices,
      chunkIndices,
      chunkBytes,
      visibleVoxelCapacity: visibleChunks * CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT,
      visibleSolidVoxels,
      workerCount: this.workerCount,
      pendingRequests: this.pendingQueue.length,
      requestedChunks: this.requested.size,
      dirtyRemeshes: this.dirty.size,
    };
  }

  private handleWorkerMessage(event: MessageEvent<WorkerOut>): void {
    if (event.data.type === 'error') {
      console.error(event.data.message);
      return;
    }
    this.options.onChunkMessage();
    this.receiveChunk(event.data.payload);
  }

  private receiveChunk(payload: ChunkMeshPayload): void {
    this.requested.delete(payload.key);

    const old = this.chunks.get(payload.key);
    const isRemesh = Boolean(old);
    if (old) {
      this.options.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      if (old.waterMesh) {
        this.options.scene.remove(old.waterMesh);
        old.waterMesh.geometry.dispose();
      }
      if (old.transparentMesh) {
        this.options.scene.remove(old.transparentMesh);
        old.transparentMesh.geometry.dispose();
      }
      if (old.decoMesh) {
        this.options.scene.remove(old.decoMesh);
        old.decoMesh.geometry.dispose();
      }
    }
    this.dirty.delete(payload.key);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(payload.colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(payload.uvs, 2));
    geometry.setAttribute('atlasRect', new THREE.BufferAttribute(payload.atlas, 4));
    geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(
      geometry,
      isRemesh ? this.options.chunkMaterial : this.options.fadeMaterial.clone(),
    );
    mesh.frustumCulled = true;
    mesh.userData.birth = performance.now();
    this.options.scene.add(mesh);

    let waterMesh: THREE.Mesh | null = null;
    if (payload.waterPositions && payload.waterNormals && payload.waterIndices) {
      const waterGeo = new THREE.BufferGeometry();
      waterGeo.setAttribute('position', new THREE.BufferAttribute(payload.waterPositions, 3));
      waterGeo.setAttribute('normal', new THREE.BufferAttribute(payload.waterNormals, 3));
      waterGeo.setIndex(new THREE.BufferAttribute(payload.waterIndices, 1));
      waterGeo.computeBoundingSphere();
      waterMesh = new THREE.Mesh(waterGeo, this.options.waterMaterial);
      waterMesh.renderOrder = 1;
      waterMesh.frustumCulled = true;
      this.options.scene.add(waterMesh);
    }

    let transparentMesh: THREE.Mesh | null = null;
    if (payload.transparentPositions && payload.transparentNormals && payload.transparentColors &&
        payload.transparentUvs && payload.transparentAtlas && payload.transparentIndices) {
      const transGeo = new THREE.BufferGeometry();
      transGeo.setAttribute('position', new THREE.BufferAttribute(payload.transparentPositions, 3));
      transGeo.setAttribute('normal', new THREE.BufferAttribute(payload.transparentNormals, 3));
      transGeo.setAttribute('color', new THREE.BufferAttribute(payload.transparentColors, 3));
      transGeo.setAttribute('uv', new THREE.BufferAttribute(payload.transparentUvs, 2));
      transGeo.setAttribute('atlasRect', new THREE.BufferAttribute(payload.transparentAtlas, 4));
      transGeo.setIndex(new THREE.BufferAttribute(payload.transparentIndices, 1));
      transGeo.computeBoundingSphere();
      transparentMesh = new THREE.Mesh(transGeo, this.options.transparentMaterial);
      transparentMesh.renderOrder = 1;
      transparentMesh.frustumCulled = true;
      this.options.scene.add(transparentMesh);
    }

    let decoMesh: THREE.Mesh | null = null;
    if (payload.decoPositions && payload.decoNormals && payload.decoColors &&
        payload.decoUvs && payload.decoAtlas && payload.decoIndices) {
      const decoGeo = new THREE.BufferGeometry();
      decoGeo.setAttribute('position', new THREE.BufferAttribute(payload.decoPositions, 3));
      decoGeo.setAttribute('normal', new THREE.BufferAttribute(payload.decoNormals, 3));
      decoGeo.setAttribute('color', new THREE.BufferAttribute(payload.decoColors, 3));
      decoGeo.setAttribute('uv', new THREE.BufferAttribute(payload.decoUvs, 2));
      decoGeo.setAttribute('atlasRect', new THREE.BufferAttribute(payload.decoAtlas, 4));
      decoGeo.setIndex(new THREE.BufferAttribute(payload.decoIndices, 1));
      decoGeo.computeBoundingSphere();
      decoMesh = new THREE.Mesh(decoGeo, this.options.decoMaterial);
      decoMesh.renderOrder = 1;
      decoMesh.frustumCulled = true;
      this.options.scene.add(decoMesh);
    }

    this.chunks.set(payload.key, {
      cx: payload.cx,
      cz: payload.cz,
      blocks: payload.blocks,
      mesh,
      waterMesh,
      transparentMesh,
      decoMesh,
      lastSeen: 0,
      solidVoxels: countSolidVoxels(payload.blocks),
    });
    this.options.wildlife.spawnForChunk(payload.cx, payload.cz);
  }

  private scheduleChunkSave(key: ChunkKey): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const existing = this.chunkSaveTimers.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      this.chunkSaveTimers.delete(key);
      const latest = this.chunks.get(key);
      if (latest) this.options.worldStore.saveChunk(key, latest.blocks).catch(console.error);
    }, 250);
    this.chunkSaveTimers.set(key, timer);
  }

  private requestChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key) || this.requested.has(key)) return;
    this.requested.add(key);
    this.options.worldStore
      .loadSavedChunk(key)
      .then((blocks) => {
        if (!this.requested.has(key) || this.chunks.has(key)) return;
        this.pendingQueue.push(blocks ? { cx, cz, blocks } : { cx, cz });
      })
      .catch(() => {
        if (!this.requested.has(key) || this.chunks.has(key)) return;
        this.pendingQueue.push({ cx, cz });
      });
  }

  private remesh(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk || this.dirty.has(key)) return;
    this.dirty.add(key);
    const copy = new Uint16Array(chunk.blocks);
    this.postChunkJob(
      { type: 'remesh', cx, cz, seed: this.options.getSeed(), blocks: copy },
      [copy.buffer],
    );
  }

  private distSqToPlayer(cx: number, cz: number): number {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    return (cx - pcx) ** 2 + (cz - pcz) ** 2;
  }

  private postChunkJob(message: WorkerIn, transfer: Transferable[] = []): void {
    const chunkWorker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    chunkWorker.postMessage(message, transfer);
  }
}

function countSolidVoxels(blocks: Uint16Array): number {
  let count = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (isSolid(blocks[i] as Block)) count++;
  }
  return count;
}
