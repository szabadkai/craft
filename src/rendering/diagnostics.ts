import * as THREE from 'three';

export type DiagnosticsSummary = {
  loadedChunks: number;
  visibleChunks: number;
  chunkVertices: number;
  chunkIndices: number;
  chunkBytes: number;
  visibleVoxelCapacity: number;
  visibleSolidVoxels: number;
  workerCount: number;
  pendingRequests: number;
  requestedChunks: number;
  dirtyRemeshes: number;
  incomingResults: number;
  deferredDisposals: number;
  chunkReceivesLastFrame: number;
  chunkReceiveMsLastFrame: number;
  chunkReceiveMsWorst: number;
  chunkDisposeMsLastFrame: number;
  farTerrainMsLast: number;
  farTerrainMsWorst: number;
};

type GpuTimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

type DiagnosticsSample = {
  frameMs: number;
  updateMs: number;
  renderMs: number;
};

export class DiagnosticsSystem {
  private readonly frameBudgetMs = 1000 / 60;
  private readonly samples: DiagnosticsSample[] = [];
  private readonly maxSamples = 120;
  private readonly updateIntervalMs = 250;
  private readonly gpuGl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly gpuTimerExt: GpuTimerExtension | null;
  private open = false;
  private lastPaintAt = 0;
  private longFrameCount = 0;
  private worstFrameMs = 0;
  private chunkMessagesThisSecond = 0;
  private chunkMessagesPerSecond = 0;
  private chunkMessageSecondStartedAt = performance.now();
  private gpuQuery: WebGLQuery | null = null;
  private lastGpuFrameMs: number | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly el: HTMLDivElement,
    private readonly summarizeWorld: () => DiagnosticsSummary,
  ) {
    this.gpuGl = renderer.getContext();
    this.gpuTimerExt =
      typeof WebGL2RenderingContext !== 'undefined' && this.gpuGl instanceof WebGL2RenderingContext
        ? (this.gpuGl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null)
        : null;
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) this.lastPaintAt = 0;
  }

  incrementChunkMessages(): void {
    this.chunkMessagesThisSecond++;
  }

  pollGpuTimer(): void {
    if (!this.gpuTimerExt || !(this.gpuGl instanceof WebGL2RenderingContext) || !this.gpuQuery)
      return;
    const available = this.gpuGl.getQueryParameter(
      this.gpuQuery,
      this.gpuGl.QUERY_RESULT_AVAILABLE,
    ) as boolean;
    const disjoint = this.gpuGl.getParameter(this.gpuTimerExt.GPU_DISJOINT_EXT) as boolean;
    if (!available) return;
    if (!disjoint) {
      const elapsedNs = this.gpuGl.getQueryParameter(this.gpuQuery, this.gpuGl.QUERY_RESULT) as number;
      this.lastGpuFrameMs = elapsedNs / 1_000_000;
    }
    this.gpuGl.deleteQuery(this.gpuQuery);
    this.gpuQuery = null;
  }

  beginGpuTimer(): void {
    if (!this.gpuTimerExt || !(this.gpuGl instanceof WebGL2RenderingContext) || this.gpuQuery)
      return;
    this.gpuQuery = this.gpuGl.createQuery();
    if (!this.gpuQuery) return;
    this.gpuGl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, this.gpuQuery);
  }

  endGpuTimer(): void {
    if (!this.gpuTimerExt || !(this.gpuGl instanceof WebGL2RenderingContext) || !this.gpuQuery)
      return;
    this.gpuGl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT);
  }

  recordFrame(frameMs: number, updateMs: number, renderMs: number): void {
    this.samples.push({ frameMs, updateMs, renderMs });
    if (this.samples.length > this.maxSamples) this.samples.shift();
    if (frameMs > this.frameBudgetMs * 1.5) this.longFrameCount++;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
  }

  updateOverlay(now: number): void {
    this.updateChunkMessageRate(now);
    if (!this.open || now - this.lastPaintAt < this.updateIntervalMs) return;
    this.lastPaintAt = now;

    const samples = this.summarizeSamples();
    const world = this.summarizeWorld();
    const info = this.renderer.info;
    const memory = (performance as PerformanceWithMemory).memory;
    const heapText = memory
      ? `${formatBytes(memory.usedJSHeapSize)} / ${formatBytes(memory.totalJSHeapSize)}`
      : 'unsupported';
    const gpuText = this.gpuTimerExt
      ? this.lastGpuFrameMs === null
        ? 'pending'
        : `${formatMs(this.lastGpuFrameMs)} measured`
      : 'unsupported';
    const cpuLoad = (samples.frameAvg / this.frameBudgetMs) * 100;

    this.el.innerHTML = `
      <div class="diagnostics-title">Diagnostics <span>F3</span></div>
      <div class="diagnostics-group">
        <b>Frame</b>
        <div><span>FPS</span><strong>${formatNumber(samples.fps, 1)}</strong></div>
        <div><span>Frame ms avg/min/max</span><strong>${formatMs(samples.frameAvg)} / ${formatMs(samples.frameMin)} / ${formatMs(samples.frameMax)}</strong></div>
        <div><span>Main update ms</span><strong>${formatMs(samples.updateAvg)}</strong></div>
        <div><span>Render submit ms</span><strong>${formatMs(samples.renderAvg)}</strong></div>
        <div><span>CPU budget load</span><strong>${formatNumber(cpuLoad, 0)}% proxy</strong></div>
        <div><span>Long frames / worst</span><strong>${this.longFrameCount} / ${formatMs(this.worstFrameMs)}</strong></div>
        <div><span>GPU frame</span><strong>${gpuText}</strong></div>
      </div>
      <div class="diagnostics-group">
        <b>Render</b>
        <div><span>Draw calls</span><strong>${info.render.calls}</strong></div>
        <div><span>Triangles</span><strong>${formatInteger(info.render.triangles)}</strong></div>
        <div><span>Lines / points</span><strong>${formatInteger(info.render.lines)} / ${formatInteger(info.render.points)}</strong></div>
        <div><span>Geometries / textures</span><strong>${info.memory.geometries} / ${info.memory.textures}</strong></div>
        <div><span>Shader programs</span><strong>${info.programs?.length ?? 0}</strong></div>
      </div>
      <div class="diagnostics-group">
        <b>World</b>
        <div><span>Chunks loaded / visible</span><strong>${world.loadedChunks} / ${world.visibleChunks}</strong></div>
        <div><span>Chunk vertices / indices</span><strong>${formatInteger(world.chunkVertices)} / ${formatInteger(world.chunkIndices)}</strong></div>
        <div><span>Visible solid voxels</span><strong>${formatInteger(world.visibleSolidVoxels)} exact</strong></div>
        <div><span>Visible voxel capacity</span><strong>${formatInteger(world.visibleVoxelCapacity)} estimate</strong></div>
        <div><span>Chunk mesh buffers</span><strong>${formatBytes(world.chunkBytes)} estimate</strong></div>
      </div>
      <div class="diagnostics-group">
        <b>Worker</b>
        <div><span>Workers</span><strong>${world.workerCount}</strong></div>
        <div><span>Pending / requested</span><strong>${world.pendingRequests} / ${world.requestedChunks}</strong></div>
        <div><span>Incoming / dirty</span><strong>${world.incomingResults} / ${world.dirtyRemeshes}</strong></div>
        <div><span>Chunk messages/sec</span><strong>${this.chunkMessagesPerSecond}</strong></div>
        <div><span>Adopted chunks</span><strong>${world.chunkReceivesLastFrame} last frame</strong></div>
        <div><span>Adopt ms last / worst</span><strong>${formatMs(world.chunkReceiveMsLastFrame)} / ${formatMs(world.chunkReceiveMsWorst)}</strong></div>
        <div><span>Deferred disposals</span><strong>${world.deferredDisposals} queued, ${formatMs(world.chunkDisposeMsLastFrame)} last</strong></div>
        <div><span>Far terrain ms last / worst</span><strong>${formatMs(world.farTerrainMsLast)} / ${formatMs(world.farTerrainMsWorst)}</strong></div>
      </div>
      <div class="diagnostics-group">
        <b>Memory</b>
        <div><span>JS heap</span><strong>${heapText}</strong></div>
        <div><span>Renderer memory</span><strong>${info.memory.geometries} geo / ${info.memory.textures} tex</strong></div>
      </div>
    `;
  }

  private summarizeSamples(): {
    fps: number;
    frameAvg: number;
    frameMin: number;
    frameMax: number;
    updateAvg: number;
    renderAvg: number;
  } {
    if (this.samples.length === 0) {
      return { fps: 0, frameAvg: 0, frameMin: 0, frameMax: 0, updateAvg: 0, renderAvg: 0 };
    }
    let frameTotal = 0;
    let updateTotal = 0;
    let renderTotal = 0;
    let frameMin = Number.POSITIVE_INFINITY;
    let frameMax = 0;
    for (const sample of this.samples) {
      frameTotal += sample.frameMs;
      updateTotal += sample.updateMs;
      renderTotal += sample.renderMs;
      frameMin = Math.min(frameMin, sample.frameMs);
      frameMax = Math.max(frameMax, sample.frameMs);
    }
    const frameAvg = frameTotal / this.samples.length;
    return {
      fps: frameAvg > 0 ? 1000 / frameAvg : 0,
      frameAvg,
      frameMin,
      frameMax,
      updateAvg: updateTotal / this.samples.length,
      renderAvg: renderTotal / this.samples.length,
    };
  }

  private updateChunkMessageRate(now: number): void {
    if (now - this.chunkMessageSecondStartedAt < 1000) return;
    this.chunkMessagesPerSecond = this.chunkMessagesThisSecond;
    this.chunkMessagesThisSecond = 0;
    this.chunkMessageSecondStartedAt = now;
  }
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '0.00ms';
  return `${value.toFixed(2)}ms`;
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(fractionDigits);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(1)} MiB`;
  return `${(mib / 1024).toFixed(1)} GiB`;
}
