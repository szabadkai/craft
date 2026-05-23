import * as THREE from 'three';
import { isSolid } from '../blocks';
import type { PlayerState } from '../player/playerController';
import { WorldStore } from '../persistence/worldStore';
import type { DiagnosticsSummary } from '../rendering/diagnostics';
import type { FarTerrainSystem } from '../rendering/farTerrain';
import { getDetailRadius, getFarRadius, getPreloadRadius } from '../player/renderDistance';
import { buildChunkMeshes } from './chunkMeshFactory';
import { createStreamingStats } from './streamingStats';
import {
  Block,
  blockIndex,
  CHUNK_SIZE,
  chunkKey,
  ChunkKey,
  ChunkMeshPayload,
  divFloor,
  mod,
  NeighborBlocks,
  WorkerIn,
  WorkerOut,
  WORLD_HEIGHT,
} from '../types';
import { getBlockLightEmission, unpackBlock, unpackSky } from '../lighting';
import type { WildlifeSystem } from './wildlife';

type LoadedChunk = {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  lightMap: Uint8Array;
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
  onChunkLoaded?: (cx: number, cz: number, blocks: Uint16Array) => void;
};

const INITIAL_READY_RADIUS = 1;

export class ChunkWorldSystem {
  private readonly chunks = new Map<ChunkKey, LoadedChunk>();
  private readonly requested = new Set<ChunkKey>();
  private readonly dirty = new Set<ChunkKey>();
  private readonly chunkSaveTimers = new Map<ChunkKey, number>();
  private readonly workers: Worker[];
  private readonly pendingQueue: PendingChunkRequest[] = [];
  private readonly incomingResults: ChunkMeshPayload[] = [];
  private readonly deferredDisposals: THREE.Mesh[] = [];
  private readonly streamingStats = createStreamingStats();
  private readonly maxRequestsPerFrame: number;
  private readonly receiveBudgetMs = 3.5;
  private readonly initialReceiveBudgetMs = 8;
  private readonly disposalBudgetMs = 1.25;
  private readonly maxReceivesPerFrame = 4;
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
    this.incomingResults.length = 0;
    this.requested.clear();
    this.dirty.clear();
    this.drainDeferredDisposals(true);
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

  getSkylight(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return y >= WORLD_HEIGHT ? 15 : 0;
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return 15;
    return unpackSky(chunk.lightMap[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))]);
  }

  getBlocklight(wx: number, y: number, wz: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return 0;
    return unpackBlock(chunk.lightMap[blockIndex(mod(wx, CHUNK_SIZE), y, mod(wz, CHUNK_SIZE))]);
  }

  setBlock(wx: number, y: number, wz: number, block: Block): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = divFloor(wx, CHUNK_SIZE);
    const cz = divFloor(wz, CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const lx = mod(wx, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);
    const oldBlock = chunk.blocks[blockIndex(lx, y, lz)] as Block;
    chunk.blocks[blockIndex(lx, y, lz)] = block;
    this.scheduleChunkSave(key);
    // Clear dirty so a fresh remesh is always queued with the latest block data,
    // even if a stale remesh from a prior edit is still in-flight.
    this.dirty.delete(key);
    this.remesh(cx, cz);
    if (getBlockLightEmission(oldBlock) > 0 || getBlockLightEmission(block) > 0) {
      this.remeshAllNeighbours(cx, cz);
    } else {
      this.remeshNeighbours(wx, wz);
    }
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
      // If already dirty (e.g., block was just set to Air), a stale remesh is
      // in-flight. Clear dirty so a fresh remesh with the current blocks is queued.
      if (this.dirty.has(key)) {
        this.dirty.delete(key);
      }
      if (!this.dirty.has(key)) {
        this.dirty.add(key);
        const copy = new Uint16Array(chunk.blocks);
        const { neighbors, transfers } = this.gatherNeighborBlocks(group.cx, group.cz);
        this.postChunkJob(
          { type: 'remesh', cx: group.cx, cz: group.cz, seed: this.options.getSeed(), blocks: copy, neighbors },
          [copy.buffer, ...transfers],
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

  private remeshAllNeighbours(cx: number, cz: number): void {
    this.remesh(cx + 1, cz);
    this.remesh(cx - 1, cz);
    this.remesh(cx, cz + 1);
    this.remesh(cx, cz - 1);
  }

  updateChunkSet(frame: number): void {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    if (pcx !== this.playerChunkX || pcz !== this.playerChunkZ) {
      this.playerChunkX = pcx;
      this.playerChunkZ = pcz;
      this.options.farTerrain.requestRebuild(pcx, pcz, this.options.getSeed(), getFarRadius(), getDetailRadius());
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
        if (chunk.waterMesh) {
          this.options.scene.remove(chunk.waterMesh);
        }
        if (chunk.transparentMesh) {
          this.options.scene.remove(chunk.transparentMesh);
        }
        if (chunk.decoMesh) {
          this.options.scene.remove(chunk.decoMesh);
        }
        this.queueDisposal(chunk.mesh, chunk.waterMesh, chunk.transparentMesh, chunk.decoMesh);
        this.chunks.delete(key);
        this.options.wildlife.removeForChunk(key);
      }
    }
  }

  flushRequests(): void {
    this.drainDeferredDisposals();
    this.pendingQueue.sort((a, b) => this.chunkPriority(a.cx, a.cz) - this.chunkPriority(b.cx, b.cz));
    for (let i = 0; i < this.maxRequestsPerFrame && this.pendingQueue.length > 0; i++) {
      const request = this.pendingQueue.shift()!;
      if (request.blocks) {
        const { neighbors, transfers } = this.gatherNeighborBlocks(request.cx, request.cz);
        this.postChunkJob(
          {
            type: 'remesh',
            cx: request.cx,
            cz: request.cz,
            seed: this.options.getSeed(),
            blocks: request.blocks,
            neighbors,
          },
          [request.blocks.buffer, ...transfers],
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

    if (this.incomingResults.length > 0) {
      this.incomingResults.sort(
        (a, b) => this.chunkPriority(a.cx, a.cz) - this.chunkPriority(b.cx, b.cz),
      );
      const startedAt = performance.now();
      const budget = this.chunks.size < (INITIAL_READY_RADIUS * 2 + 1) ** 2
        ? this.initialReceiveBudgetMs
        : this.receiveBudgetMs;
      let count = 0;
      while (this.incomingResults.length > 0 && count < this.maxReceivesPerFrame) {
        this.receiveChunk(this.incomingResults.shift()!);
        count++;
        if (count > 0 && performance.now() - startedAt >= budget) break;
      }
      this.streamingStats.chunkReceivesLastFrame = count;
      this.streamingStats.chunkReceiveMsLastFrame = performance.now() - startedAt;
      this.streamingStats.chunkReceiveMsWorst = Math.max(
        this.streamingStats.chunkReceiveMsWorst,
        this.streamingStats.chunkReceiveMsLastFrame,
      );
    } else {
      this.streamingStats.chunkReceivesLastFrame = 0;
      this.streamingStats.chunkReceiveMsLastFrame = 0;
    }
    this.streamingStats.incomingResults = this.incomingResults.length;
    this.streamingStats.deferredDisposals = this.deferredDisposals.length;
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
      const geometries = [
        chunk.mesh.geometry,
        chunk.waterMesh?.geometry,
        chunk.transparentMesh?.geometry,
        chunk.decoMesh?.geometry,
      ];
      for (const geometry of geometries) {
        if (!geometry) continue;
        const position = geometry.getAttribute('position');
        if (position) chunkVertices += position.count;
        if (geometry.index) chunkIndices += geometry.index.count;
        chunkBytes += this.geometryBytes(geometry);
      }
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
      incomingResults: this.streamingStats.incomingResults,
      deferredDisposals: this.streamingStats.deferredDisposals,
      chunkReceivesLastFrame: this.streamingStats.chunkReceivesLastFrame,
      chunkReceiveMsLastFrame: this.streamingStats.chunkReceiveMsLastFrame,
      chunkReceiveMsWorst: this.streamingStats.chunkReceiveMsWorst,
      chunkDisposeMsLastFrame: this.streamingStats.chunkDisposeMsLastFrame,
      farTerrainMsLast: this.options.farTerrain.lastBuildMs,
      farTerrainMsWorst: this.options.farTerrain.worstBuildMs,
      farTerrainDisposeMsLast: this.options.farTerrain.lastDisposeMs,
      farTerrainDisposeMsWorst: this.options.farTerrain.worstDisposeMs,
    };
  }

  private handleWorkerMessage(event: MessageEvent<WorkerOut>): void {
    if (event.data.type === 'error') {
      console.error(event.data.message);
      if (event.data.cx != null && event.data.cz != null) {
        this.dirty.delete(chunkKey(event.data.cx, event.data.cz));
      }
      return;
    }
    this.options.onChunkMessage();
    this.dirty.delete(event.data.payload.key);
    this.incomingResults.push(event.data.payload);
  }

  private receiveChunk(payload: ChunkMeshPayload): void {
    this.requested.delete(payload.key);

    const old = this.chunks.get(payload.key);
    const isRemesh = Boolean(old);
    if (old) {
      this.options.scene.remove(old.mesh);
      if (old.waterMesh) {
        this.options.scene.remove(old.waterMesh);
      }
      if (old.transparentMesh) {
        this.options.scene.remove(old.transparentMesh);
      }
      if (old.decoMesh) {
        this.options.scene.remove(old.decoMesh);
      }
      this.queueDisposal(old.mesh, old.waterMesh, old.transparentMesh, old.decoMesh);
    }

    const { mesh, waterMesh, transparentMesh, decoMesh } = buildChunkMeshes(
      payload,
      {
        chunk: this.options.chunkMaterial,
        fade: this.options.fadeMaterial,
        water: this.options.waterMaterial,
        transparent: this.options.transparentMaterial,
        deco: this.options.decoMaterial,
      },
      isRemesh,
    );
    this.options.scene.add(mesh);
    if (waterMesh) this.options.scene.add(waterMesh);
    if (transparentMesh) this.options.scene.add(transparentMesh);
    if (decoMesh) this.options.scene.add(decoMesh);

    this.chunks.set(payload.key, {
      cx: payload.cx,
      cz: payload.cz,
      blocks: payload.blocks,
      lightMap: payload.lightMap,
      mesh,
      waterMesh,
      transparentMesh,
      decoMesh,
      lastSeen: 0,
      solidVoxels: payload.solidVoxels,
    });
    this.options.wildlife.spawnForChunk(payload.cx, payload.cz);
    this.options.onChunkLoaded?.(payload.cx, payload.cz, payload.blocks);

    if (!isRemesh) {
      if (payload.borderLightPx) this.remesh(payload.cx + 1, payload.cz);
      if (payload.borderLightNx) this.remesh(payload.cx - 1, payload.cz);
      if (payload.borderLightPz) this.remesh(payload.cx, payload.cz + 1);
      if (payload.borderLightNz) this.remesh(payload.cx, payload.cz - 1);
    }
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

  private queueDisposal(...meshes: Array<THREE.Mesh | null>): void {
    for (const mesh of meshes) {
      if (mesh) this.deferredDisposals.push(mesh);
    }
  }

  private drainDeferredDisposals(disposeAll = false): void {
    const startedAt = performance.now();
    let disposed = 0;
    while (this.deferredDisposals.length > 0 && (disposeAll || disposed < 8)) {
      const mesh = this.deferredDisposals.shift()!;
      mesh.geometry.dispose();
      const material = mesh.material;
      if (material !== this.options.chunkMaterial &&
          material !== this.options.waterMaterial &&
          material !== this.options.transparentMaterial &&
          material !== this.options.decoMaterial) {
        if (Array.isArray(material)) {
          for (const mat of material) mat.dispose();
        } else {
          material.dispose();
        }
      }
      disposed++;
      if (!disposeAll && performance.now() - startedAt >= this.disposalBudgetMs) break;
    }
    this.streamingStats.chunkDisposeMsLastFrame = performance.now() - startedAt;
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

  private gatherNeighborBlocks(cx: number, cz: number): { neighbors: NeighborBlocks; transfers: ArrayBuffer[] } {
    const neighbors: NeighborBlocks = {};
    const transfers: ArrayBuffer[] = [];
    const blockDirs: (keyof NeighborBlocks)[] = ['px', 'nx', 'pz', 'nz'];
    const lightDirs: (keyof NeighborBlocks)[] = ['pxLight', 'nxLight', 'pzLight', 'nzLight'];
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < 4; i++) {
      const n = this.chunks.get(chunkKey(cx + offsets[i][0], cz + offsets[i][1]) as ChunkKey);
      if (n) {
        const blocksCopy = new Uint16Array(n.blocks);
        const lightCopy = new Uint8Array(n.lightMap);
        (neighbors as Record<string, unknown>)[blockDirs[i]] = blocksCopy;
        (neighbors as Record<string, unknown>)[lightDirs[i]] = lightCopy;
        transfers.push(blocksCopy.buffer as ArrayBuffer, lightCopy.buffer as ArrayBuffer);
      }
    }
    return { neighbors, transfers };
  }

  private remesh(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk || this.dirty.has(key)) return;
    this.dirty.add(key);
    const copy = new Uint16Array(chunk.blocks);
    const { neighbors, transfers } = this.gatherNeighborBlocks(cx, cz);
    this.postChunkJob(
      { type: 'remesh', cx, cz, seed: this.options.getSeed(), blocks: copy, neighbors },
      [copy.buffer, ...transfers],
    );
  }

  private distSqToPlayer(cx: number, cz: number): number {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    return (cx - pcx) ** 2 + (cz - pcz) ** 2;
  }

  private geometryBytes(geometry: THREE.BufferGeometry): number {
    let bytes = 0;
    for (const attribute of Object.values(geometry.attributes)) {
      bytes += (attribute.array as ArrayBufferView).byteLength;
    }
    if (geometry.index) bytes += (geometry.index.array as ArrayBufferView).byteLength;
    return bytes;
  }

  private chunkPriority(cx: number, cz: number): number {
    const pcx = divFloor(this.options.player.position.x, CHUNK_SIZE);
    const pcz = divFloor(this.options.player.position.z, CHUNK_SIZE);
    const dx = cx - pcx;
    const dz = cz - pcz;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);
    if (dist < 1.5) return distSq;
    const forwardX = -Math.sin(this.options.player.yaw);
    const forwardZ = -Math.cos(this.options.player.yaw);
    const forwardDot = (dx * forwardX + dz * forwardZ) / dist;
    return distSq - forwardDot * 4;
  }

  private postChunkJob(message: WorkerIn, transfer: Transferable[] = []): void {
    const chunkWorker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    chunkWorker.postMessage(message, transfer);
  }
}
