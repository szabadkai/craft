import * as THREE from 'three';
import { isSolid } from '../blocks';
import { terrainHeight, OCEAN_SURFACE_Y } from '../terrain';
import { Block, WORLD_HEIGHT } from '../types';
import { createMobPhysics, disposeMobMeshes, setHurtFlash, type MobPhysics } from './mobPhysics';

type HostileKind = 'cave_spider' | 'zombie' | 'skeleton';

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
  lastRangedAt: number;
  phase: number;
};

type HostileProjectile = {
  root: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  createdAt: number;
};

export type HostileHit = {
  mob: Hostile;
  distance: number;
};

export class HostileSystem {
  private readonly mobs: Hostile[] = [];
  private readonly projectiles: HostileProjectile[] = [];
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly rayBox = new THREE.Box3();
  private readonly rayHit = new THREE.Vector3();
  private readonly spawnTimer = { next: 0, cooldownMs: 8000 };
  private readonly MAX_MOBS = 12;
  private readonly physics: MobPhysics;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getSeed: () => number,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly onDrop: (position: THREE.Vector3, kind: HostileKind) => void,
    private readonly getTimeOfDay: () => number = () => 0,
    private readonly onMobHit?: () => void,
    private readonly onMobDeath?: () => void,
    private readonly getSkylight?: (wx: number, y: number, wz: number) => number,
    private readonly getBlocklight?: (wx: number, y: number, wz: number) => number,
  ) {
    this.physics = createMobPhysics(getBlock);
  }

  private isNight(): boolean {
    const tod = this.getTimeOfDay();
    return tod > 13000 && tod < 23000;
  }

  spawnNear(playerPos: THREE.Vector3, now: number): void {
    if (now < this.spawnTimer.next || this.mobs.length >= this.MAX_MOBS) return;
    const seed = this.getSeed();
    const px = Math.floor(playerPos.x);
    const py = Math.floor(playerPos.y);
    const pz = Math.floor(playerPos.z);
    const surface = terrainHeight(px, pz, seed);
    const isUnderground = py < surface - 8;
    const isSurface = py >= surface - 3 && this.isNight();

    if (!isUnderground && !isSurface) {
      this.spawnTimer.next = now + this.spawnTimer.cooldownMs;
      return;
    }

    // Try a few random positions around the player
    for (let attempt = 0; attempt < 10; attempt++) {
      const dx = Math.floor((Math.random() - 0.5) * 28);
      const dy = isSurface
        ? 0
        : Math.floor((Math.random() - 0.5) * 10);
      const dz = Math.floor((Math.random() - 0.5) * 28);
      const wx = px + dx;
      let wy = py + dy;
      const wz = pz + dz;

      if (isSurface) {
        wy = terrainHeight(wx, wz, seed);
        // Must be on solid ground above water
        if (wy <= OCEAN_SURFACE_Y || wy < 12 || wy >= WORLD_HEIGHT - 2) continue;
        const groundBlock = this.getBlock(wx, wy - 1, wz);
        if (groundBlock !== Block.Grass && groundBlock !== Block.Sand && groundBlock !== Block.Snow) continue;
      } else {
        if (wy < 4 || wy >= WORLD_HEIGHT - 2) continue;
        if (wy >= terrainHeight(wx, wz, seed) - 3) continue;
      }

      // Spawn in air with solid below, two blocks clear above
      if (this.getBlock(wx, wy, wz) !== Block.Air) continue;
      if (!isSolid(this.getBlock(wx, wy - 1, wz))) continue;
      if (this.getBlock(wx, wy + 1, wz) !== Block.Air) continue;

      const skyLight = this.getSkylight?.(wx, wy, wz) ?? (isSurface ? 0 : 15);
      const blockLight = this.getBlocklight?.(wx, wy, wz) ?? 0;
      if (isSurface) {
        if (blockLight >= 8) continue;
      } else if (Math.max(skyLight, blockLight) >= 7) {
        continue;
      }

      const kind: HostileKind = isSurface
        ? (Math.random() < 0.5 ? 'zombie' : 'skeleton')
        : 'cave_spider';
      const mob = this.createMob(kind, wx + 0.5, wy, wz + 0.5);
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
    return this.raycastFrom(this.rayOrigin, this.rayDirection, maxDistance);
  }

  raycastFrom(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 5.5): HostileHit | null {
    this.rayOrigin.copy(origin);
    this.rayDirection.copy(direction);
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

  hit(mob: Hostile, now: number, attackerPos?: THREE.Vector3): void {
    mob.health -= 1;
    mob.hurtUntil = now + 280;
    mob.verticalVelocity = 2.2;
    if (attackerPos) {
      const dx = mob.root.position.x - attackerPos.x;
      const dz = mob.root.position.z - attackerPos.z;
      const len = Math.hypot(dx, dz) || 1;
      mob.root.position.x += (dx / len) * 0.32;
      mob.root.position.z += (dz / len) * 0.32;
    }
    mob.root.scale.setScalar(1.08);
    this.onMobHit?.();
    if (mob.health <= 0) {
      const dropPos = mob.root.position.clone();
      dropPos.y += 0.05;
      this.onDrop(dropPos, mob.kind);
      this.onMobDeath?.();
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
        const preferredRange = mob.kind === 'skeleton' ? 7.0 : 0;
        const direction = mob.kind === 'skeleton' && dist < preferredRange ? -1 : 1;
        const speed = mob.speed * (dist3 < 4 && mob.kind !== 'skeleton' ? 1.3 : 1.0);
        const mx = (dx / dist) * speed * dt * direction;
        const mz = (dz / dist) * speed * dt * direction;
        this.physics.moveHorizontalAxis(mob, 'x', mx);
        this.physics.moveHorizontalAxis(mob, 'z', mz);
        mob.root.rotation.y = Math.atan2(dx, dz);

        if (dy > 1.5) {
          this.tryVerticalMove(mob, Math.min(dy, 4.0) * dt);
        } else if (dy < -1.5) {
          mob.verticalVelocity -= 18 * dt;
        }
      }

      if (!this.physics.settleOnGround(mob, 8)) {
        this.physics.applyGravity(mob, dt);
      }

      // Damage player on contact
      if (now - mob.lastAttackAt > 500 && dist3 < 1.0) {
        mob.lastAttackAt = now;
        this.onPlayerContact(mob, mob.kind === 'zombie' ? 3 : 2);
      }

      if (mob.kind === 'skeleton' && dist3 < 13 && dist3 > 2.2 && now - mob.lastRangedAt > 1450) {
        mob.lastRangedAt = now;
        this.spawnProjectile(mob, playerPos, now);
      }

      // Death by falling out of world
      if (mob.root.position.y < -16) {
        this.removeMob(mob);
        continue;
      }

      setHurtFlash(mob.root, now < mob.hurtUntil);
      if (now >= mob.hurtUntil) mob.root.scale.setScalar(1);

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
    this.updateProjectiles(dt, now, playerPos);
  }

  private onPlayerContact = (_mob: Hostile, damage: number): void => {
    // Handled via external callback registered in main.ts
    this._playerDamageCallback?.(damage);
  };

  private _playerDamageCallback: ((amount: number) => void) | null = null;

  setPlayerDamageCallback(cb: (amount: number) => void): void {
    this._playerDamageCallback = cb;
  }

  private tryVerticalMove(mob: Hostile, amount: number): void {
    if (amount <= 0) return;
    let remaining = amount;
    while (remaining > 0.0001) {
      const step = Math.min(remaining, 0.025);
      const next = mob.root.position.clone();
      next.y += step;
      if (this.physics.collides(mob, next)) return;
      mob.root.position.copy(next);
      remaining -= step;
    }
  }

  private setMobBox(mob: Hostile, box: THREE.Box3): THREE.Box3 {
    const half = mob.width / 2;
    const p = mob.root.position;
    return box.set(
      new THREE.Vector3(p.x - half, p.y, p.z - half),
      new THREE.Vector3(p.x + half, p.y + mob.height, p.z + half),
    );
  }

  private createMob(kind: HostileKind, x: number, y: number, z: number): Hostile {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    if (kind === 'cave_spider') {
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
        lastRangedAt: 0,
        phase: Math.random() * Math.PI * 2,
      };
    }

    if (kind === 'zombie') {
      const skinMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
      const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a4a8c });
      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.36), skinMat);
      body.position.y = 1.08;
      group.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
      head.position.y = 1.64;
      group.add(head);
      // Arms
      for (const sx of [-0.38, 0.38]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), skinMat);
        arm.position.set(sx, 1.12, 0);
        arm.userData.leg = true;
        group.add(arm);
      }
      // Legs
      for (const sx of [-0.14, 0.14]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.18), pantsMat);
        leg.position.set(sx, 0.32, 0);
        leg.userData.leg = true;
        group.add(leg);
      }
      return {
        kind: 'zombie',
        root: group,
        health: 6,
        width: 0.6,
        height: 1.84,
        speed: 1.05,
        verticalVelocity: 0,
        hurtUntil: 0,
        lastAttackAt: 0,
        lastRangedAt: 0,
        phase: Math.random() * Math.PI * 2,
      };
    }

    // skeleton
    const boneMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 });
    const darkMat2 = new THREE.MeshLambertMaterial({ color: 0x3a3834 });
    // Body (ribcage)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.28), boneMat);
    body.position.y = 1.14;
    group.add(body);
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), boneMat);
    head.position.y = 1.66;
    group.add(head);
    // Arms
    for (const sx of [-0.34, 0.34]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), boneMat);
      arm.position.set(sx, 1.16, 0);
      arm.userData.leg = true;
      group.add(arm);
    }
    // Legs
    for (const sx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), boneMat);
      leg.position.set(sx, 0.32, 0);
      leg.userData.leg = true;
      group.add(leg);
    }
    // Bow (on back)
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), darkMat2);
    bow.position.set(-0.28, 1.2, 0.22);
    bow.rotation.z = 0.25;
    group.add(bow);
    return {
      kind: 'skeleton',
      root: group,
      health: 4,
      width: 0.54,
      height: 1.84,
      speed: 1.25,
      verticalVelocity: 0,
      hurtUntil: 0,
      lastAttackAt: 0,
      lastRangedAt: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private spawnProjectile(mob: Hostile, playerPos: THREE.Vector3, now: number): void {
    const origin = mob.root.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    const target = playerPos.clone().add(new THREE.Vector3(0, 1.15, 0));
    const velocity = target.sub(origin).normalize().multiplyScalar(7.5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
    );
    mesh.position.copy(origin);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);
    mesh.rotation.x = -Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
    this.projectiles.push({ root: mesh, velocity, damage: 2, createdAt: now });
    this.scene.add(mesh);
  }

  private updateProjectiles(dt: number, now: number, playerPos: THREE.Vector3): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.root.position.addScaledVector(projectile.velocity, dt);
      const p = projectile.root.position;
      if (this.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== Block.Air) {
        this.removeProjectile(i);
        continue;
      }
      const hitPos = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
      if (p.distanceTo(hitPos) < 0.75) {
        this._playerDamageCallback?.(projectile.damage);
        this.removeProjectile(i);
        continue;
      }
      if (now - projectile.createdAt > 3500 || p.y < -16) {
        this.removeProjectile(i);
      }
    }
  }

  private removeProjectile(index: number): void {
    const projectile = this.projectiles[index];
    this.projectiles.splice(index, 1);
    this.scene.remove(projectile.root);
    projectile.root.geometry.dispose();
    const material = projectile.root.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }

  private removeMob(mob: Hostile): void {
    const idx = this.mobs.indexOf(mob);
    if (idx >= 0) this.mobs.splice(idx, 1);
    this.scene.remove(mob.root);
    disposeMobMeshes(mob.root);
  }

  clear(): void {
    for (const mob of [...this.mobs]) this.removeMob(mob);
    while (this.projectiles.length > 0) this.removeProjectile(this.projectiles.length - 1);
  }
}
