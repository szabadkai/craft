import * as THREE from 'three';
import { isSolid } from '../blocks';
import { Block } from '../types';

export type PhysicsBody = {
  root: THREE.Group;
  width: number;
  height: number;
  verticalVelocity: number;
};

export type MobPhysics = {
  collides: (body: PhysicsBody, position: THREE.Vector3) => boolean;
  groundTopAt: (body: PhysicsBody, searchDepth: number) => number | null;
  moveHorizontalAxis: (body: PhysicsBody, axis: 'x' | 'z', amount: number) => boolean;
  applyGravity: (body: PhysicsBody, dt: number) => void;
  settleOnGround: (body: PhysicsBody, searchDepth: number) => boolean;
};

export function createMobPhysics(
  getBlock: (wx: number, y: number, wz: number) => Block,
): MobPhysics {
  function collides(body: PhysicsBody, position: THREE.Vector3): boolean {
    const half = body.width / 2;
    const minX = Math.floor(position.x - half);
    const maxX = Math.floor(position.x + half);
    const minY = Math.floor(position.y + 0.04);
    const maxY = Math.floor(position.y + body.height);
    const minZ = Math.floor(position.z - half);
    const maxZ = Math.floor(position.z + half);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  function groundTopAt(body: PhysicsBody, searchDepth: number): number | null {
    const half = body.width / 2;
    const pos = body.root.position;
    const minX = Math.floor(pos.x - half);
    const maxX = Math.floor(pos.x + half);
    const minZ = Math.floor(pos.z - half);
    const maxZ = Math.floor(pos.z + half);
    const startY = Math.floor(pos.y + 0.15);
    const minY = Math.max(0, startY - searchDepth);
    for (let y = startY; y >= minY; y--) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(getBlock(x, y - 1, z))) return y;
        }
      }
    }
    return null;
  }

  function moveHorizontalAxis(body: PhysicsBody, axis: 'x' | 'z', amount: number): boolean {
    if (Math.abs(amount) < 0.0001) return true;
    const sign = Math.sign(amount);
    let remaining = Math.abs(amount);
    let moved = false;
    while (remaining > 0.0001) {
      const step = Math.min(remaining, 0.025);
      const next = body.root.position.clone();
      next[axis] += step * sign;
      if (collides(body, next)) return moved;
      body.root.position.copy(next);
      remaining -= step;
      moved = true;
    }
    return true;
  }

  function applyGravity(body: PhysicsBody, dt: number): void {
    body.verticalVelocity -= 18 * dt;
    const next = body.root.position.clone();
    next.y += body.verticalVelocity * dt;
    if (collides(body, next)) {
      if (body.verticalVelocity < 0) {
        const landed = groundTopAt(body, 8);
        if (landed !== null) body.root.position.y = landed;
      }
      body.verticalVelocity = 0;
    } else {
      body.root.position.y = Math.max(0, next.y);
    }
  }

  function settleOnGround(body: PhysicsBody, searchDepth: number): boolean {
    const ground = groundTopAt(body, searchDepth);
    if (ground !== null && body.root.position.y - ground <= 0.12 && body.verticalVelocity <= 0) {
      body.root.position.y = ground;
      body.verticalVelocity = 0;
      return true;
    }
    return false;
  }

  return { collides, groundTopAt, moveHorizontalAxis, applyGravity, settleOnGround };
}

export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function disposeMobMeshes(root: THREE.Group): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

export function setHurtFlash(root: THREE.Group, hurt: boolean): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.material) return;
    const material = mesh.material as THREE.MeshLambertMaterial;
    if ('emissive' in material)
      material.emissive.setHex(hurt ? 0x552222 : 0x000000);
  });
}
