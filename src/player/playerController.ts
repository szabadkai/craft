import * as THREE from 'three';
import { isSolid } from '../blocks';
import { Block } from '../types';

function isSlabBlock(block: Block): boolean {
  return (
    block === Block.OakSlab ||
    block === Block.OakSlabTop ||
    block === Block.CobblestoneSlab ||
    block === Block.CobblestoneSlabTop
  );
}

function isStairBlock(block: Block): boolean {
  return (
    block === Block.OakStairsN || block === Block.OakStairsS ||
    block === Block.OakStairsE || block === Block.OakStairsW ||
    block === Block.CobblestoneStairsN || block === Block.CobblestoneStairsS ||
    block === Block.CobblestoneStairsE || block === Block.CobblestoneStairsW
  );
}

function stairDir(block: Block): 'n' | 's' | 'e' | 'w' {
  switch (block) {
    case Block.OakStairsN: case Block.CobblestoneStairsN: return 'n';
    case Block.OakStairsS: case Block.CobblestoneStairsS: return 's';
    case Block.OakStairsE: case Block.CobblestoneStairsE: return 'e';
    case Block.OakStairsW: case Block.CobblestoneStairsW: return 'w';
    default: return 'n';
  }
}

function slabHalfY(block: Block): [number, number] {
  const isTop = block === Block.OakSlabTop || block === Block.CobblestoneSlabTop;
  return isTop ? [0.5, 1] : [0, 0.5];
}

export type PlayerState = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  inWater: boolean;
  waterDepth: number;
  width: number;
  height: number;
  eye: number;
};

export class PlayerController {
  constructor(
    readonly state: PlayerState,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly keys: Set<string>,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly isPaused: () => boolean,
  ) {}

  syncCamera(): void {
    this.camera.position.set(
      this.state.position.x,
      this.state.position.y + this.state.eye,
      this.state.position.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.state.yaw;
    this.camera.rotation.x = this.state.pitch;
  }

  update(dt: number): void {
    if (this.isPaused()) {
      this.state.velocity.x += (0 - this.state.velocity.x) * Math.min(1, dt * 14);
      this.state.velocity.z += (0 - this.state.velocity.z) * Math.min(1, dt * 14);
      this.syncCamera();
      return;
    }

    const prevDepth = this.state.waterDepth;
    this.state.waterDepth = this.computeWaterDepth();
    this.state.inWater = this.state.waterDepth > 0;
    const depth = this.state.waterDepth;

    // Water entry: dampen downward velocity on impact
    if (prevDepth === 0 && depth > 0 && this.state.velocity.y < -3.5) {
      this.state.velocity.y = -3.5;
    }

    // Horizontal movement — depth-scaled speed
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const landSpeed = this.keys.has('ShiftLeft') ? 8.5 : 5.2;
    const swimSpeed = this.keys.has('ShiftLeft') ? 3.6 : 2.8;
    const speed = landSpeed + (swimSpeed - landSpeed) * depth;
    const sin = Math.sin(this.state.yaw);
    const cos = Math.cos(this.state.yaw);
    const wishX = (strafe * cos - forward * sin) * speed;
    const wishZ = (-forward * cos - strafe * sin) * speed;
    const accel = 12 - 6 * depth;
    this.state.velocity.x += (wishX - this.state.velocity.x) * Math.min(1, dt * accel);
    this.state.velocity.z += (wishZ - this.state.velocity.z) * Math.min(1, dt * accel);

    if (depth > 0) {
      this.state.velocity.y -= 6 * dt;
      // Continuous drag scales with submersion
      this.state.velocity.y *= 1 - 8 * depth * dt;

      if (this.keys.has('Space')) {
        this.state.velocity.y = Math.min(this.state.velocity.y + 14 * dt, 5.5);
      } else if (this.keys.has('ShiftLeft')) {
        this.state.velocity.y = Math.max(this.state.velocity.y - 10 * dt, -5.0);
      } else if (depth < 0.6) {
        // Surface float: gently hold player at water line
        this.state.velocity.y += (0.8 - this.state.velocity.y) * Math.min(1, dt * 2.5);
      } else {
        // Deep water idle: gentle rise toward surface
        this.state.velocity.y += (0.5 - this.state.velocity.y) * Math.min(1, dt * 1.5);
      }
    } else {
      this.state.velocity.y -= 22 * dt;
      if (this.keys.has('Space') && this.state.onGround) {
        this.state.velocity.y = 8.2;
        this.state.onGround = false;
      }
    }

    this.moveAxis('x', this.state.velocity.x * dt);
    this.moveAxis('z', this.state.velocity.z * dt);
    this.state.onGround = false;
    this.moveAxis('y', this.state.velocity.y * dt);
    this.syncCamera();
  }

  private computeWaterDepth(): number {
    const px = Math.floor(this.state.position.x);
    const pz = Math.floor(this.state.position.z);
    const feetY = this.state.position.y;
    const h = this.state.height;
    const samples = [feetY, feetY + h * 0.33, feetY + h * 0.66, feetY + h];
    let count = 0;
    for (const sy of samples) {
      if (this.getBlock(px, Math.floor(sy), pz) === Block.Water) count++;
    }
    return count / samples.length;
  }

  collides(position: THREE.Vector3): boolean {
    const half = this.state.width / 2;
    const pxMin = position.x - half;
    const pxMax = position.x + half;
    const pyMin = position.y;
    const pyMax = position.y + this.state.height;
    const pzMin = position.z - half;
    const pzMax = position.z + half;
    const minX = Math.floor(pxMin);
    const maxX = Math.floor(pxMax + 0.999);
    const minY = Math.floor(pyMin);
    const maxY = Math.floor(pyMax + 0.999);
    const minZ = Math.floor(pzMin);
    const maxZ = Math.floor(pzMax + 0.999);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const block = this.getBlock(x, y, z);
          // Must actually overlap the block AABB
          if (pyMax <= y || pyMin >= y + 1) continue;
          if (pxMax <= x || pxMin >= x + 1) continue;
          if (pzMax <= z || pzMin >= z + 1) continue;

          if (block === Block.OakDoor) return true;
          if (isSlabBlock(block)) {
            const [yOff, yTop] = slabHalfY(block);
            if (pyMin < y + yTop && pyMax > y + yOff) return true;
            continue;
          }
          if (isSolid(block)) return true;
          if (isStairBlock(block)) {
            // Full collision in lower half (y to y+0.5)
            if (pyMin < y + 0.5) return true;
            // Upper half: only half the block is solid
            const dir = stairDir(block);
            if (dir === 'n' && pzMin < z + 0.5) return true;
            if (dir === 's' && pzMax > z + 0.5) return true;
            if (dir === 'e' && pxMax > x + 0.5) return true;
            if (dir === 'w' && pxMin < x + 0.5) return true;
          }
        }
      }
    }
    return false;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', amount: number): void {
    if (amount === 0) return;
    const next = this.state.position.clone();
    next[axis] += amount;
    if (!this.collides(next)) {
      this.state.position.copy(next);
      return;
    }
    const sign = Math.sign(amount);
    while (Math.abs(amount) > 0.001) {
      const tiny = Math.min(Math.abs(amount), 0.02) * sign;
      const test = this.state.position.clone();
      test[axis] += tiny;
      if (this.collides(test)) break;
      this.state.position.copy(test);
      amount -= tiny;
    }
    this.state.velocity[axis] = 0;
    if (axis === 'y' && sign < 0) this.state.onGround = true;
  }
}
