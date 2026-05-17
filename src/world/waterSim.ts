import { Block } from '../types';

const TICK_INTERVAL = 150;
const BUDGET_PER_TICK = 64;
const MAX_ACTIVE = 512;
const MAX_HORIZONTAL_SPREAD = 6;

const NEIGHBORS_6: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

const NEIGHBORS_4: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 0, 1], [0, 0, -1],
];

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class WaterSimSystem {
  private active = new Map<string, { x: number; y: number; z: number }>();
  private lastTick = 0;

  constructor(
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly setBlocks: (entries: { wx: number; y: number; wz: number; block: Block }[]) => void,
  ) {}

  activate(x: number, y: number, z: number): void {
    if (y < 1 || y > 127) return;
    const k = key(x, y, z);
    if (this.active.size >= MAX_ACTIVE && !this.active.has(k)) return;
    this.active.set(k, { x, y, z });
  }

  activateNeighbors(x: number, y: number, z: number): void {
    this.activate(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      this.activate(x + dx, y + dy, z + dz);
    }
  }

  tick(now: number): void {
    if (now - this.lastTick < TICK_INTERVAL) return;
    this.lastTick = now;

    if (this.active.size === 0) return;

    const entries: { wx: number; y: number; wz: number; block: Block }[] = [];
    const toRemove: string[] = [];
    const toAdd: { x: number; y: number; z: number }[] = [];
    let processed = 0;

    const sorted = [...this.active.values()].sort((a, b) => a.y - b.y);

    for (const pos of sorted) {
      if (processed >= BUDGET_PER_TICK) break;
      processed++;

      const k = key(pos.x, pos.y, pos.z);
      const block = this.getBlock(pos.x, pos.y, pos.z);

      if (block === Block.Water) {
        let moved = false;

        const below = this.getBlock(pos.x, pos.y - 1, pos.z);
        if (below === Block.Air) {
          entries.push({ wx: pos.x, y: pos.y - 1, wz: pos.z, block: Block.Water });
          if (!this.isSource(pos.x, pos.y, pos.z)) {
            entries.push({ wx: pos.x, y: pos.y, wz: pos.z, block: Block.Air });
          }
          toAdd.push({ x: pos.x, y: pos.y - 1, z: pos.z });
          moved = true;
        } else {
          for (const [dx, , dz] of NEIGHBORS_4) {
            const nx = pos.x + dx;
            const nz = pos.z + dz;
            const neighbor = this.getBlock(nx, pos.y, nz);
            if (neighbor !== Block.Air) continue;
            const belowNeighbor = this.getBlock(nx, pos.y - 1, nz);
            if (belowNeighbor === Block.Air) {
              entries.push({ wx: nx, y: pos.y, wz: nz, block: Block.Water });
              toAdd.push({ x: nx, y: pos.y, z: nz });
              moved = true;
            } else {
              const dist = this.distanceToSource(pos.x, pos.y, pos.z, nx, nz);
              if (dist <= MAX_HORIZONTAL_SPREAD) {
                entries.push({ wx: nx, y: pos.y, wz: nz, block: Block.Water });
                toAdd.push({ x: nx, y: pos.y, z: nz });
                moved = true;
              }
            }
          }
        }

        if (!moved) {
          toRemove.push(k);
        }
      } else if (block === Block.Air) {
        let hasWaterAbove = this.getBlock(pos.x, pos.y + 1, pos.z) === Block.Water;
        let hasWaterSide = false;
        if (!hasWaterAbove) {
          for (const [dx, , dz] of NEIGHBORS_4) {
            if (this.getBlock(pos.x + dx, pos.y, pos.z + dz) === Block.Water) {
              hasWaterSide = true;
              break;
            }
          }
        }
        if (hasWaterAbove || hasWaterSide) {
          entries.push({ wx: pos.x, y: pos.y, wz: pos.z, block: Block.Water });
          toAdd.push({ x: pos.x, y: pos.y, z: pos.z });
        } else {
          toRemove.push(k);
        }
      } else {
        toRemove.push(k);
      }
    }

    for (const k of toRemove) this.active.delete(k);
    for (const p of toAdd) this.activate(p.x, p.y, p.z);

    if (entries.length > 0) {
      this.setBlocks(entries);
    }
  }

  private isSource(x: number, y: number, z: number): boolean {
    if (this.getBlock(x, y + 1, z) === Block.Water) return true;
    let waterNeighbors = 0;
    for (const [dx, , dz] of NEIGHBORS_4) {
      if (this.getBlock(x + dx, y, z + dz) === Block.Water) {
        waterNeighbors++;
        if (waterNeighbors >= 2) return true;
      }
    }
    return false;
  }

  private distanceToSource(srcX: number, _srcY: number, srcZ: number, nx: number, nz: number): number {
    return Math.abs(nx - srcX) + Math.abs(nz - srcZ);
  }
}
