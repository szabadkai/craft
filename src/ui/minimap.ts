import { biomeAt, terrainHeight, WATER_LEVEL } from '../terrain';

export type Waypoint = { name: string; x: number; z: number; color: string };

const SIZE = 140;
const HALF = SIZE / 2;
const SCALE = 2;

const BIOME_COLORS: Record<string, string> = {
  plains: '#5a8f3c',
  forest: '#3d6b2e',
  hills: '#7a7a6e',
  beach: '#d4c576',
  snow: '#e8eaec',
  dry: '#b5a44c',
};
const WATER_COLOR = '#3366aa';
const HIGH_HILL_COLOR = '#9a9a8a';

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
  private lastPx = NaN;
  private lastPz = NaN;
  private seed = 0;
  private waypoints: Waypoint[] = [];
  private terrainCache: ImageData | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'minimap';

    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
    document.body.appendChild(this.container);
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
      this.terrainCache = this.buildTerrain(bx, bz);
    }
    if (this.terrainCache) this.ctx.putImageData(this.terrainCache, 0, 0);
    this.drawOverlay(px, pz, yaw);
  }

  private buildTerrain(cx: number, cz: number): ImageData {
    const img = this.ctx.createImageData(SIZE, SIZE);
    const data = img.data;

    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const wx = cx + (px - HALF) * SCALE;
        const wz = cz + (py - HALF) * SCALE;
        const h = terrainHeight(wx, wz, this.seed);
        const i = (py * SIZE + px) * 4;

        if (h <= WATER_LEVEL) {
          const depth = Math.max(0, WATER_LEVEL - h);
          const darkening = Math.max(0.5, 1 - depth * 0.03);
          data[i] = 51 * darkening;
          data[i + 1] = 102 * darkening;
          data[i + 2] = 170 * darkening;
          data[i + 3] = 255;
          continue;
        }

        const biome = biomeAt(wx, wz, this.seed);
        let color: string;
        if (biome === 'hills' && h > 55) {
          color = HIGH_HILL_COLOR;
        } else {
          color = BIOME_COLORS[biome] ?? BIOME_COLORS.plains;
        }

        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        const shade = 0.85 + (h - 40) * 0.004;
        data[i] = Math.min(255, r * shade);
        data[i + 1] = Math.min(255, g * shade);
        data[i + 2] = Math.min(255, b * shade);
        data[i + 3] = 255;
      }
    }

    return img;
  }

  private drawOverlay(px: number, pz: number, yaw: number): void {
    const ctx = this.ctx;

    for (const wp of this.waypoints) {
      const dx = (wp.x - Math.floor(px)) / SCALE + HALF;
      const dz = (wp.z - Math.floor(pz)) / SCALE + HALF;
      if (dx < -4 || dx > SIZE + 4 || dz < -4 || dz > SIZE + 4) continue;

      ctx.fillStyle = wp.color;
      ctx.beginPath();
      ctx.arc(dx, dz, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(dx, dz, 3.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.textAlign = 'center';
      ctx.strokeText(wp.name, dx, dz - 6);
      ctx.fillText(wp.name, dx, dz - 6);
      ctx.lineWidth = 1;
    }

    ctx.save();
    ctx.translate(HALF, HALF);
    ctx.rotate(-yaw + Math.PI);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  dispose(): void {
    this.container.remove();
  }
}
