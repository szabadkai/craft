import { Block, WORLD_HEIGHT } from '../types';

const TICK_INTERVAL = 150;
const BUDGET_PER_TICK = 64;
const MAX_ACTIVE = 512;
const MAX_HORIZONTAL_SPREAD = 6;
const DEFAULT_SOURCE_BUDGET = 220;

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

function parseKey(k: string): { x: number; y: number; z: number } | null {
  const parts = k.split(',').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

export type WaterBudgetSnapshot = Record<string, number>;

export class WaterSimSystem {
  private active = new Map<string, { x: number; y: number; z: number; sourceKey: string | null }>();
  private sourceBudgets = new Map<string, number>();
  private lastTick = 0;

  constructor(
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly setBlocks: (entries: { wx: number; y: number; wz: number; block: Block }[]) => void,
    private readonly onBudgetChanged: () => void = () => {},
  ) {}

  activate(x: number, y: number, z: number): void {
    if (y < 1 || y >= WORLD_HEIGHT) return;
    const k = key(x, y, z);
    if (this.active.size >= MAX_ACTIVE && !this.active.has(k)) return;
    this.active.set(k, { x, y, z, sourceKey: this.findSourceKey(x, y, z) });
  }

  activateNeighbors(x: number, y: number, z: number): void {
    this.activate(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      this.activate(x + dx, y + dy, z + dz);
    }
  }

  clear(): void {
    this.active.clear();
    this.sourceBudgets.clear();
    this.lastTick = 0;
  }

  load(snapshot: WaterBudgetSnapshot | null): void {
    this.active.clear();
    this.sourceBudgets.clear();
    if (snapshot) {
      for (const [source, remaining] of Object.entries(snapshot)) {
        if (Number.isFinite(remaining) && remaining >= 0) {
          this.sourceBudgets.set(source, remaining);
        }
      }
    }
  }

  snapshot(): WaterBudgetSnapshot {
    const out: WaterBudgetSnapshot = {};
    for (const [source, remaining] of this.sourceBudgets) {
      if (remaining < DEFAULT_SOURCE_BUDGET) out[source] = remaining;
    }
    return out;
  }

  tick(now: number): void {
    if (now - this.lastTick < TICK_INTERVAL) return;
    this.lastTick = now;

    if (this.active.size === 0) return;

    const entries: { wx: number; y: number; wz: number; block: Block }[] = [];
    const plannedWater = new Set<string>();
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
        const sourceKey = pos.sourceKey ?? this.findSourceKey(pos.x, pos.y, pos.z);

        const below = this.getBlock(pos.x, pos.y - 1, pos.z);
        if (below === Block.Air) {
          const isSource = this.isSource(pos.x, pos.y, pos.z);
          const canFlowDown = !isSource || this.consumeSourceBudget(sourceKey, plannedWater, pos.x, pos.y - 1, pos.z);
          if (canFlowDown) {
            entries.push({ wx: pos.x, y: pos.y - 1, wz: pos.z, block: Block.Water });
            plannedWater.add(key(pos.x, pos.y - 1, pos.z));
            if (!isSource) {
              entries.push({ wx: pos.x, y: pos.y, wz: pos.z, block: Block.Air });
            }
            toAdd.push({ x: pos.x, y: pos.y - 1, z: pos.z });
            moved = true;
          }
        } else {
          for (const [dx, , dz] of NEIGHBORS_4) {
            const nx = pos.x + dx;
            const nz = pos.z + dz;
            const neighbor = this.getBlock(nx, pos.y, nz);
            if (neighbor !== Block.Air) continue;
            const belowNeighbor = this.getBlock(nx, pos.y - 1, nz);
            if (belowNeighbor === Block.Air) {
              if (this.consumeSourceBudget(sourceKey, plannedWater, nx, pos.y, nz)) {
                entries.push({ wx: nx, y: pos.y, wz: nz, block: Block.Water });
                plannedWater.add(key(nx, pos.y, nz));
                toAdd.push({ x: nx, y: pos.y, z: nz });
                moved = true;
              }
            } else {
              const dist = this.distanceToSource(pos.x, pos.y, pos.z, nx, nz);
              if (dist <= MAX_HORIZONTAL_SPREAD && this.consumeSourceBudget(sourceKey, plannedWater, nx, pos.y, nz)) {
                entries.push({ wx: nx, y: pos.y, wz: nz, block: Block.Water });
                plannedWater.add(key(nx, pos.y, nz));
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
        const hasWaterAbove = this.getBlock(pos.x, pos.y + 1, pos.z) === Block.Water;
        let hasWaterSide = false;
        if (!hasWaterAbove) {
          for (const [dx, , dz] of NEIGHBORS_4) {
            if (this.getBlock(pos.x + dx, pos.y, pos.z + dz) === Block.Water) {
              hasWaterSide = true;
              break;
            }
          }
        }
        const sourceKey = this.findSourceKey(pos.x, pos.y, pos.z);
        if ((hasWaterAbove || hasWaterSide) && this.consumeSourceBudget(sourceKey, plannedWater, pos.x, pos.y, pos.z)) {
          entries.push({ wx: pos.x, y: pos.y, wz: pos.z, block: Block.Water });
          plannedWater.add(key(pos.x, pos.y, pos.z));
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

  private findSourceKey(x: number, y: number, z: number): string | null {
    if (this.getBlock(x, y, z) === Block.Water && this.isSource(x, y, z)) return key(x, y, z);
    if (this.getBlock(x, y + 1, z) === Block.Water) {
      let cy = y + 1;
      while (cy < WORLD_HEIGHT - 1 && this.getBlock(x, cy + 1, z) === Block.Water) cy++;
      return key(x, cy, z);
    }
    for (const [dx, , dz] of NEIGHBORS_4) {
      const nx = x + dx;
      const nz = z + dz;
      if (this.getBlock(nx, y, nz) === Block.Water) return key(nx, y, nz);
    }
    return null;
  }

  private consumeSourceBudget(sourceKey: string | null, plannedWater: Set<string>, x: number, y: number, z: number): boolean {
    if (!sourceKey) return false;
    const waterKey = key(x, y, z);
    if (plannedWater.has(waterKey) || this.getBlock(x, y, z) === Block.Water) return true;
    const source = parseKey(sourceKey);
    if (!source || this.getBlock(source.x, source.y, source.z) !== Block.Water) return false;
    const remaining = this.sourceBudgets.get(sourceKey) ?? DEFAULT_SOURCE_BUDGET;
    if (remaining <= 0) return false;
    this.sourceBudgets.set(sourceKey, remaining - 1);
    this.onBudgetChanged();
    return true;
  }
}
