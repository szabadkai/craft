import * as THREE from 'three';
import { isSolid } from '../blocks';
import { terrainHeight } from '../terrain';
import { Block, WORLD_HEIGHT } from '../types';

type HostileKind = 'cave_spider';

export type Hostile = {
  kind: HostileKind;
  root: THREE.Group;
  health: number;
  width: number;
  height: number;
  speed: number;
  verticalVelocity: number;
  hurtUntil: number;
  lastAttackAt: number;
  phase: number;
};

export type HostileHit = {
  mob: Hostile;
  distance: number;
};

export class HostileSystem {
  private readonly mobs: Hostile[] = [];
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly rayBox = new THREE.Box3();
  private readonly rayHit = new THREE.Vector3();
  private readonly spawnTimer = { next: 0, cooldownMs: 8000 };
  private readonly MAX_MOBS = 12;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getSeed: () => number,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly onDrop: (position: THREE.Vector3, kind: HostileKind) => void,
  ) {}

  spawnNear(playerPos: THREE.Vector3, now: number): void {
    if (now < this.spawnTimer.next || this.mobs.length >= this.MAX_MOBS) return;
    const seed = this.getSeed();
    const px = Math.floor(playerPos.x);
    const py = Math.floor(playerPos.y);
    const pz = Math.floor(playerPos.z);
    const surface = terrainHeight(px, pz, seed);
    // Only spawn if player is deep enough underground
    if (py > surface - 8) {
      this.spawnTimer.next = now + this.spawnTimer.cooldownMs;
      return;
    }
    // Try a few random positions around the player
    for (let attempt = 0; attempt < 8; attempt++) {
      const dx = Math.floor((Math.random() - 0.5) * 28);
      const dy = Math.floor((Math.random() - 0.5) * 10);
      const dz = Math.floor((Math.random() - 0.5) * 28);
      const wx = px + dx;
      const wy = py + dy;
      const wz = pz + dz;
      if (wy < 4 || wy >= WORLD_HEIGHT - 2) continue;
      if (wy >= terrainHeight(wx, wz, seed) - 3) continue;
      // Spawn in air with solid below
      if (this.getBlock(wx, wy, wz) !== Block.Air) continue;
      if (!isSolid(this.getBlock(wx, wy - 1, wz))) continue;
      // Check two blocks clear above
      if (this.getBlock(wx, wy + 1, wz) !== Block.Air) continue;
      const mob = this.createMob(wx + 0.5, wy, wz + 0.5);
      this.mobs.push(mob);
      this.scene.add(mob.root);
      this.spawnTimer.next = now + this.spawnTimer.cooldownMs;
      return;
    }
    this.spawnTimer.next = now + 2000;
  }

  raycast(camera: THREE.PerspectiveCamera, maxDistance = 5.5): HostileHit | null {
    camera.getWorldPosition(this.rayOrigin);
    camera.getWorldDirection(this.rayDirection);
    this.ray.set(this.rayOrigin, this.rayDirection);
    let closest: Hostile | null = null;
    let closestDistance = maxDistance;
    for (const mob of this.mobs) {
      this.setMobBox(mob, this.rayBox).expandByScalar(0.08);
      const hit = this.ray.intersectBox(this.rayBox, this.rayHit);
      if (!hit) continue;
      const hitDistance = hit.distanceTo(this.rayOrigin);
      if (hitDistance < closestDistance) {
        closestDistance = hitDistance;
        closest = mob;
      }
    }
    return closest ? { mob: closest, distance: closestDistance } : null;
  }

  hit(mob: Hostile, now: number): void {
    mob.health -= 1;
    mob.hurtUntil = now + 280;
    // Push back
    mob.verticalVelocity = 2.2;
    if (mob.health <= 0) {
      const dropPos = mob.root.position.clone();
      dropPos.y += 0.05;
      this.onDrop(dropPos, mob.kind);
      this.removeMob(mob);
    }
  }

  update(dt: number, now: number, playerPos: THREE.Vector3): void {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const t = now * 0.001 + mob.phase;
      const dx = playerPos.x - mob.root.position.x;
      const dy = playerPos.y - mob.root.position.y;
      const dz = playerPos.z - mob.root.position.z;
      const dist = Math.hypot(dx, dz);
      const dist3 = Math.hypot(dx, dy, dz);

      // Only move toward player if within range
      const aggroRange = 18;
      if (dist3 < aggroRange && dist > 0.1) {
        const speed = mob.speed * (dist3 < 4 ? 1.3 : 1.0);
        const mx = (dx / dist) * speed * dt;
        const mz = (dz / dist) * speed * dt;
        this.moveHorizontal(mob, mx);
        this.moveHorizontal(mob, mz, true);
        mob.root.rotation.y = Math.atan2(dx, dz);

        // Simple vertical movement: try to reach player Y
        if (dy > 1.5) {
          this.tryVerticalMove(mob, Math.min(dy, 4.0) * dt, dt);
        } else if (dy < -1.5) {
          mob.verticalVelocity -= 18 * dt;
        }
      }

      // Gravity and ground detection
      const ground = this.findGround(mob);
      if (ground !== null && mob.root.position.y - ground <= 0.12 && mob.verticalVelocity <= 0) {
        mob.root.position.y = ground;
        mob.verticalVelocity = 0;
      } else {
        mob.verticalVelocity -= 18 * dt;
        const nextY = mob.root.position.y + mob.verticalVelocity * dt;
        const testPos = mob.root.position.clone();
        testPos.y = nextY;
        if (this.collidesAt(mob, testPos)) {
          if (mob.verticalVelocity < 0) {
            const landed = this.findGround(mob);
            if (landed !== null) mob.root.position.y = landed;
          }
          mob.verticalVelocity = 0;
        } else {
          mob.root.position.y = Math.max(0, nextY);
        }
      }

      // Damage player on contact
      if (now - mob.lastAttackAt > 500 && dist3 < 1.0) {
        mob.lastAttackAt = now;
        // Damage is dealt externally via callback — we just signal contact
        this.onPlayerContact(mob);
      }

      // Death by falling out of world
      if (mob.root.position.y < -16) {
        this.removeMob(mob);
        continue;
      }

      // Hurt flash
      mob.root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.material) return;
        const material = mesh.material as THREE.MeshLambertMaterial;
        if ('emissive' in material) {
          material.emissive.setHex(now < mob.hurtUntil ? 0x552222 : 0x000000);
        }
      });

      // Animations
      if (dist3 < aggroRange && dist > 0.15) {
        const stride = t * mob.speed * 12;
        mob.root.children.forEach((child, idx) => {
          if (child.userData.leg) {
            child.rotation.x = Math.sin(stride + (idx % 2 === 0 ? 0 : Math.PI)) * 0.5;
          }
        });
      }
    }
  }

  private onPlayerContact = (_mob: Hostile): void => {
    // Handled via external callback registered in main.ts
    this._playerDamageCallback?.(2);
  };

  private _playerDamageCallback: ((amount: number) => void) | null = null;

  setPlayerDamageCallback(cb: (amount: number) => void): void {
    this._playerDamageCallback = cb;
  }

  private moveHorizontal(mob: Hostile, amount: number, _axisZ = false): boolean {
    if (Math.abs(amount) < 0.0001) return true;
    const sign = Math.sign(amount);
    let remaining = Math.abs(amount);
    let moved = false;
    while (remaining > 0.0001) {
      const step = Math.min(remaining, 0.025);
      const next = mob.root.position.clone();
      const axis = _axisZ ? 'z' : 'x';
      next[axis] += step * sign;
      if (this.collidesAt(mob, next)) return moved;
      mob.root.position.copy(next);
      remaining -= step;
      moved = true;
    }
    return true;
  }

  private tryVerticalMove(mob: Hostile, amount: number, _dt: number): void {
    if (amount <= 0) return;
    const sign = 1;
    let remaining = amount;
    while (remaining > 0.0001) {
      const step = Math.min(remaining, 0.025);
      const next = mob.root.position.clone();
      next.y += step * sign;
      if (this.collidesAt(mob, next)) return;
      mob.root.position.copy(next);
      remaining -= step;
    }
  }

  private collidesAt(mob: Hostile, pos: THREE.Vector3): boolean {
    const half = mob.width / 2;
    const minX = Math.floor(pos.x - half);
    const maxX = Math.floor(pos.x + half);
    const minY = Math.floor(pos.y + 0.04);
    const maxY = Math.floor(pos.y + mob.height);
    const minZ = Math.floor(pos.z - half);
    const maxZ = Math.floor(pos.z + half);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(this.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  private findGround(mob: Hostile): number | null {
    const half = mob.width / 2;
    const minX = Math.floor(mob.root.position.x - half);
    const maxX = Math.floor(mob.root.position.x + half);
    const minZ = Math.floor(mob.root.position.z - half);
    const maxZ = Math.floor(mob.root.position.z + half);
    const startY = Math.floor(mob.root.position.y + 0.15);
    for (let y = startY; y >= Math.max(0, startY - 8); y--) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(this.getBlock(x, y - 1, z))) return y;
        }
      }
    }
    return null;
  }

  private setMobBox(mob: Hostile, box: THREE.Box3): THREE.Box3 {
    const half = mob.width / 2;
    const p = mob.root.position;
    return box.set(
      new THREE.Vector3(p.x - half, p.y, p.z - half),
      new THREE.Vector3(p.x + half, p.y + mob.height, p.z + half),
    );
  }

  private createMob(x: number, y: number, z: number): Hostile {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1512 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.52), darkMat);
    body.position.y = 0.32;
    group.add(body);
    for (const sx of [-0.16, 0.16]) {
      for (const sz of [-0.18, 0.18]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), darkMat);
        leg.position.set(sx, 0.14, sz);
        leg.userData.leg = true;
        group.add(leg);
      }
    }
    return {
      kind: 'cave_spider',
      root: group,
      health: 3,
      width: 0.52,
      height: 0.68,
      speed: 1.4,
      verticalVelocity: 0,
      hurtUntil: 0,
      lastAttackAt: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private removeMob(mob: Hostile): void {
    const idx = this.mobs.indexOf(mob);
    if (idx >= 0) this.mobs.splice(idx, 1);
    this.scene.remove(mob.root);
    mob.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material)?.dispose();
    });
  }

  clear(): void {
    for (const mob of [...this.mobs]) this.removeMob(mob);
  }
}
