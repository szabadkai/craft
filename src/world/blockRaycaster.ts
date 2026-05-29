import * as THREE from 'three';
import { isSolid } from '../blocks';
import { Block } from '../types';

export type BlockHit = {
  block: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
};

export class BlockRaycaster {
  private readonly direction = new THREE.Vector3();
  private readonly pointer = new THREE.Vector2();
  private readonly pointerWorld = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
  ) {}

  raycast(maxDistance = 6): BlockHit | null {
    this.camera.getWorldDirection(this.direction);
    return this.raycastFrom(this.camera.position, this.direction, maxDistance);
  }

  raycastAt(clientX: number, clientY: number, domElement: HTMLElement, maxDistance = 6): BlockHit | null {
    const rect = domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.pointerWorld.set(this.pointer.x, this.pointer.y, 0.5).unproject(this.camera);
    this.direction.copy(this.pointerWorld).sub(this.camera.position).normalize();
    return this.raycastFrom(this.camera.position, this.direction, maxDistance);
  }

  raycastFrom(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 6): BlockHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(direction.x);
    const stepY = Math.sign(direction.y);
    const stepZ = Math.sign(direction.z);
    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.x);
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.y);
    const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.z);
    let tMaxX = rayIntBound(origin.x, direction.x);
    let tMaxY = rayIntBound(origin.y, direction.y);
    let tMaxZ = rayIntBound(origin.z, direction.z);
    let distance = 0;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;

    while (distance <= maxDistance) {
      const block = this.getBlock(x, y, z);
      if (block === Block.OakDoor || block === Block.OakDoorOpen || isSolid(block)) {
        return {
          block: new THREE.Vector3(x, y, z),
          normal: new THREE.Vector3(normalX, normalY, normalZ),
          distance,
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
        normalX = -stepX;
        normalY = 0;
        normalZ = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        distance = tMaxY;
        tMaxY += tDeltaY;
        normalX = 0;
        normalY = -stepY;
        normalZ = 0;
      } else {
        z += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        normalX = 0;
        normalY = 0;
        normalZ = -stepZ;
      }
    }
    return null;
  }
}

function rayIntBound(origin: number, direction: number): number {
  if (direction > 0) return (Math.floor(origin + 1) - origin) / direction;
  if (direction < 0) return (origin - Math.floor(origin)) / -direction;
  return Number.POSITIVE_INFINITY;
}
