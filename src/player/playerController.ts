import * as THREE from 'three';
import { isSolid } from '../blocks';
import { Block } from '../types';

export type PlayerState = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
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
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const speed = this.keys.has('ShiftLeft') ? 8.5 : 5.2;
    const sin = Math.sin(this.state.yaw);
    const cos = Math.cos(this.state.yaw);
    const wishX = (strafe * cos - forward * sin) * speed;
    const wishZ = (-forward * cos - strafe * sin) * speed;
    this.state.velocity.x += (wishX - this.state.velocity.x) * Math.min(1, dt * 12);
    this.state.velocity.z += (wishZ - this.state.velocity.z) * Math.min(1, dt * 12);
    this.state.velocity.y -= 22 * dt;
    if (this.keys.has('Space') && this.state.onGround) {
      this.state.velocity.y = 8.2;
      this.state.onGround = false;
    }
    this.moveAxis('x', this.state.velocity.x * dt);
    this.moveAxis('z', this.state.velocity.z * dt);
    this.state.onGround = false;
    this.moveAxis('y', this.state.velocity.y * dt);
    this.syncCamera();
  }

  collides(position: THREE.Vector3): boolean {
    const half = this.state.width / 2;
    const minX = Math.floor(position.x - half);
    const maxX = Math.floor(position.x + half);
    const minY = Math.floor(position.y);
    const maxY = Math.floor(position.y + this.state.height);
    const minZ = Math.floor(position.z - half);
    const maxZ = Math.floor(position.z + half);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(this.getBlock(x, y, z))) return true;
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
