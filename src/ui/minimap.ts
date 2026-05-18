import type { MinimapOut } from '../minimapWorker';

export type Waypoint = { name: string; x: number; z: number; color: string };

const SIZE = 70;
const HALF = SIZE / 2;
const SCALE = 4;

function storageKey(seed: number): string {
  return `craft-waypoints-${seed}`;
}

export function loadWaypoints(seed: number): Waypoint[] {
  try {
    const raw = localStorage.getItem(storageKey(seed));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWaypoints(seed: number, waypoints: Waypoint[]): void {
  localStorage.setItem(storageKey(seed), JSON.stringify(waypoints));
}

const WAYPOINT_COLORS = ['#ff5555', '#55ff55', '#5599ff', '#ffaa00', '#ff55ff', '#55ffff', '#ffffff', '#ffff55'];

export function nextWaypointColor(existing: Waypoint[]): string {
  const used = new Set(existing.map((w) => w.color));
  return WAYPOINT_COLORS.find((c) => !used.has(c)) ?? WAYPOINT_COLORS[existing.length % WAYPOINT_COLORS.length];
}

export class MinimapSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly container: HTMLDivElement;
  private readonly worker: Worker;
  private lastPx = NaN;
  private lastPz = NaN;
  private seed = 0;
  private waypoints: Waypoint[] = [];
  private terrainCache: ImageData | null = null;
  private inFlight = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'minimap hidden';

    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
    document.body.appendChild(this.container);

    this.worker = new Worker(new URL('../minimapWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<MinimapOut>) => {
      this.handleResult(event.data);
    };
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  setSeed(seed: number): void {
    this.seed = seed;
    this.waypoints = loadWaypoints(seed);
    this.lastPx = NaN;
  }

  getWaypoints(): Waypoint[] {
    return this.waypoints;
  }

  addWaypoint(name: string, x: number, z: number): Waypoint {
    const color = nextWaypointColor(this.waypoints);
    const wp: Waypoint = { name, x: Math.floor(x), z: Math.floor(z), color };
    this.waypoints.push(wp);
    saveWaypoints(this.seed, this.waypoints);
    this.lastPx = NaN;
    return wp;
  }

  removeWaypoint(name: string): boolean {
    const idx = this.waypoints.findIndex((w) => w.name.toLowerCase() === name.toLowerCase());
    if (idx < 0) return false;
    this.waypoints.splice(idx, 1);
    saveWaypoints(this.seed, this.waypoints);
    this.lastPx = NaN;
    return true;
  }

  update(px: number, pz: number, yaw: number): void {
    const bx = Math.floor(px / SCALE) * SCALE;
    const bz = Math.floor(pz / SCALE) * SCALE;
    if (bx !== this.lastPx || bz !== this.lastPz) {
      this.lastPx = bx;
      this.lastPz = bz;
      this.requestBuild(bx, bz);
    }
    if (this.terrainCache) this.ctx.putImageData(this.terrainCache, 0, 0);
    this.drawOverlay(px, pz, yaw);
  }

  private requestBuild(cx: number, cz: number): void {
    if (this.inFlight) return;
    this.inFlight = true;
    this.worker.postMessage({ cx, cz, seed: this.seed, size: SIZE, half: HALF, scale: SCALE });
  }

  private handleResult(result: MinimapOut): void {
    this.inFlight = false;
    this.terrainCache = new ImageData(new Uint8ClampedArray(result.data.buffer as ArrayBuffer), SIZE, SIZE);
    // If position changed while worker was busy, request a new build
    const bx = this.lastPx;
    const bz = this.lastPz;
    if (bx !== result.cx || bz !== result.cz) {
      this.requestBuild(bx, bz);
    }
  }

  private drawOverlay(px: number, pz: number, yaw: number): void {
    const ctx = this.ctx;

    for (const wp of this.waypoints) {
      const dx = (wp.x - Math.floor(px)) / SCALE + HALF;
      const dz = (wp.z - Math.floor(pz)) / SCALE + HALF;
      if (dx < -2 || dx > SIZE + 2 || dz < -2 || dz > SIZE + 2) continue;

      ctx.fillStyle = wp.color;
      ctx.fillRect(Math.floor(dx) - 1, Math.floor(dz) - 1, 3, 3);

      ctx.font = '600 5px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.textAlign = 'center';
      ctx.strokeText(wp.name, dx, dz - 3);
      ctx.fillText(wp.name, dx, dz - 3);
      ctx.lineWidth = 1;
    }

    ctx.save();
    ctx.translate(HALF, HALF);
    ctx.rotate(-yaw + Math.PI);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-2, 3);
    ctx.lineTo(0, 1);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.restore();
  }

  dispose(): void {
    this.container.remove();
  }
}
