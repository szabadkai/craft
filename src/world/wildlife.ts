import * as THREE from 'three';
import { biomeAt, generatedBlockAt, terrainHeight, OCEAN_SURFACE_Y } from '../terrain';
import { Block, CHUNK_SIZE, chunkKey, ChunkKey } from '../types';
import { createMobPhysics, angleDelta, disposeMobMeshes, setHurtFlash, type MobPhysics } from './mobPhysics';

type WildlifeKind = 'rabbit' | 'deer' | 'fox' | 'boar' | 'bird';

export type Wildlife = {
  key: ChunkKey;
  kind: WildlifeKind;
  root: THREE.Group;
  home: THREE.Vector3;
  target: THREE.Vector3;
  heading: number;
  speed: number;
  width: number;
  height: number;
  health: number;
  verticalVelocity: number;
  hurtUntil: number;
  phase: number;
  nextTargetAt: number;
  turnSpeed: number;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
};

export type WildlifeHit = {
  animal: Wildlife;
  distance: number;
};

export class WildlifeSystem {
  private readonly animalsByChunk = new Map<ChunkKey, Wildlife[]>();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly rayBox = new THREE.Box3();
  private readonly rayHit = new THREE.Vector3();
  private readonly physics: MobPhysics;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getSeed: () => number,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly onDrop: (position: THREE.Vector3, kind: WildlifeKind) => void,
    private readonly onAnimalHit?: () => void,
    private readonly onAnimalDeath?: () => void,
  ) {
    this.physics = createMobPhysics(getBlock);
  }

  spawnForChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.animalsByChunk.has(key)) return;
    const animals: Wildlife[] = [];
    const count = this.hash(cx, cz, 1) > 0.64 ? 1 + Math.floor(this.hash(cx, cz, 2) * 3) : 0;
    for (let i = 0; i < count; i++) {
      const wx = cx * CHUNK_SIZE + 2 + this.hash(cx, cz, i * 5 + 3) * (CHUNK_SIZE - 4);
      const wz = cz * CHUNK_SIZE + 2 + this.hash(cx, cz, i * 5 + 4) * (CHUNK_SIZE - 4);
      const h = terrainHeight(wx, wz, this.getSeed());
      if (h <= OCEAN_SURFACE_Y) continue;
      const surface = generatedBlockAt(Math.floor(wx), h, Math.floor(wz), this.getSeed());
      if (surface !== Block.Grass && surface !== Block.Snow && surface !== Block.Sand) continue;
      const biome = biomeAt(wx, wz, this.getSeed());
      const roll = this.hash(cx, cz, i * 5 + 5);
      const kind: WildlifeKind =
        biome === 'dry'
          ? roll > 0.58
            ? 'bird'
            : 'rabbit'
          : biome === 'forest'
            ? roll > 0.72
              ? 'boar'
              : roll > 0.38
                ? 'fox'
                : 'deer'
            : biome === 'snow'
              ? roll > 0.52
                ? 'fox'
                : 'rabbit'
              : roll > 0.72
                ? 'deer'
                : roll > 0.36
                  ? 'rabbit'
                  : 'bird';
      const root = makeWildlifeMesh(kind);
      root.position.set(wx, h + (kind === 'bird' ? 4.2 : 1), wz);
      this.scene.add(root);
      const heading = this.hash(cx, cz, i * 5 + 6) * Math.PI * 2;
      const target = new THREE.Vector3(
        wx + Math.sin(heading) * (3 + this.hash(cx, cz, i * 5 + 8) * 5),
        0,
        wz + Math.cos(heading) * (3 + this.hash(cx, cz, i * 5 + 9) * 5),
      );
      animals.push({
        key,
        kind,
        root,
        home: root.position.clone(),
        target,
        heading,
        speed:
          kind === 'bird'
            ? 2.3
            : kind === 'rabbit' || kind === 'fox'
              ? 1.15
              : kind === 'boar'
                ? 0.62
                : 0.72,
        width: wildlifeSize(kind).width,
        height: wildlifeSize(kind).height,
        health: kind === 'deer' || kind === 'boar' ? 3 : kind === 'fox' ? 2 : 1,
        verticalVelocity: 0,
        hurtUntil: 0,
        phase: this.hash(cx, cz, i * 5 + 7) * Math.PI * 2,
        nextTargetAt: 0,
        turnSpeed: kind === 'bird' || kind === 'rabbit' ? 3.8 : 2.4,
        legs: root.userData.legs as THREE.Object3D[],
        wings: root.userData.wings as THREE.Object3D[],
      });
    }
    this.animalsByChunk.set(key, animals);
  }

  removeForChunk(key: ChunkKey): void {
    const animals = this.animalsByChunk.get(key);
    if (!animals) return;
    for (const animal of animals) {
      this.scene.remove(animal.root);
      disposeMobMeshes(animal.root);
    }
    this.animalsByChunk.delete(key);
  }

  raycast(camera: THREE.PerspectiveCamera, maxDistance = 5.5): WildlifeHit | null {
    camera.getWorldPosition(this.rayOrigin);
    camera.getWorldDirection(this.rayDirection);
    return this.raycastFrom(this.rayOrigin, this.rayDirection, maxDistance);
  }

  raycastFrom(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 5.5): WildlifeHit | null {
    this.rayOrigin.copy(origin);
    this.rayDirection.copy(direction);
    this.ray.set(this.rayOrigin, this.rayDirection);
    let closest: Wildlife | null = null;
    let closestDistance = maxDistance;
    for (const animals of this.animalsByChunk.values()) {
      for (const animal of animals) {
        this.setAnimalBox(animal, this.rayBox).expandByScalar(0.08);
        const hit = this.ray.intersectBox(this.rayBox, this.rayHit);
        if (!hit) continue;
        const hitDistance = hit.distanceTo(this.rayOrigin);
        if (hitDistance < closestDistance) {
          closestDistance = hitDistance;
          closest = animal;
        }
      }
    }
    return closest ? { animal: closest, distance: closestDistance } : null;
  }

  hit(animal: Wildlife, now: number): void {
    animal.health -= 1;
    animal.hurtUntil = now + 280;
    animal.nextTargetAt = 0;
    // Strong flinch — turn away and push back
    const flinchAngle =
      Math.PI + (this.hash(animal.root.position.x, animal.root.position.z, now) - 0.5);
    animal.heading += flinchAngle;
    // Push animal backward in the direction away from the hit
    const pushX = Math.sin(animal.heading + Math.PI) * 0.65;
    const pushZ = Math.cos(animal.heading + Math.PI) * 0.65;
    animal.root.position.x += pushX;
    animal.root.position.z += pushZ;
    animal.verticalVelocity += 2.2;
    this.onAnimalHit?.();
    if (animal.health > 0) return;
    const dropPos = animal.root.position.clone();
    dropPos.y += 0.05;
    this.onDrop(dropPos, animal.kind);
    this.onAnimalDeath?.();
    this.removeAnimal(animal);
  }

  update(dt: number, now: number): void {
    for (const animals of this.animalsByChunk.values()) {
      for (const animal of animals) {
        const t = now * 0.001 + animal.phase;
        const dx = animal.target.x - animal.root.position.x;
        const dz = animal.target.z - animal.root.position.z;
        const targetDistance = Math.hypot(dx, dz);
        if (targetDistance < 0.8 || now > animal.nextTargetAt) this.chooseTarget(animal, now);

        const desiredHeading = Math.atan2(
          animal.target.x - animal.root.position.x,
          animal.target.z - animal.root.position.z,
        );
        animal.heading += Math.max(
          -animal.turnSpeed * dt,
          Math.min(animal.turnSpeed * dt, angleDelta(animal.heading, desiredHeading)),
        );
        const turnPenalty = Math.max(
          0.25,
          1 - Math.abs(angleDelta(animal.heading, desiredHeading)) / Math.PI,
        );
        const idlePulse =
          animal.kind === 'rabbit'
            ? 0.7 + Math.max(0, Math.sin(t * 2.7)) * 0.55
            : 0.85 + Math.sin(t * 0.8) * 0.15;
        const speed = animal.speed * turnPenalty * idlePulse;
        if (animal.kind === 'bird') {
          this.physics.moveHorizontalAxis(animal, 'x', Math.sin(animal.heading) * speed * dt);
          this.physics.moveHorizontalAxis(animal, 'z', Math.cos(animal.heading) * speed * dt);
          const ground = this.physics.groundTopAt(animal, 12);
          const targetY =
            (ground ??
              terrainHeight(animal.root.position.x, animal.root.position.z, this.getSeed()) + 1) +
            2.2 +
            Math.sin(t * 2.4) * 0.45;
          animal.root.position.y += (targetY - animal.root.position.y) * Math.min(1, dt * 2.8);
        } else {
          const movedX = this.physics.moveHorizontalAxis(animal, 'x', Math.sin(animal.heading) * speed * dt);
          const movedZ = this.physics.moveHorizontalAxis(animal, 'z', Math.cos(animal.heading) * speed * dt);
          if (!movedX || !movedZ) animal.nextTargetAt = now;
          if (!this.physics.settleOnGround(animal, 6)) {
            this.physics.applyGravity(animal, dt);
          }
        }
        animal.root.rotation.y = animal.heading;
        setHurtFlash(animal.root, now < animal.hurtUntil);

        const stride = t * speed * 9;
        animal.legs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(stride + (index % 2 === 0 ? 0 : Math.PI)) * 0.45;
        });
        animal.wings.forEach((wing, index) => {
          wing.rotation.z = (index === 0 ? 1 : -1) * (0.25 + Math.sin(t * 8) * 0.45);
        });
      }
    }
  }

  clear(): void {
    for (const [key] of this.animalsByChunk) this.removeForChunk(key);
  }

  private chooseTarget(animal: Wildlife, now: number): void {
    const spread = animal.kind === 'bird' ? 15 : animal.kind === 'deer' ? 10 : 7;
    const angle =
      this.hash(animal.home.x, animal.home.z, Math.floor(now * 0.001 + animal.phase * 19)) *
      Math.PI *
      2;
    const distance =
      spread *
      (0.35 +
        this.hash(animal.home.x, animal.home.z, Math.floor(now * 0.001 + animal.phase * 29) + 7) *
          0.65);
    animal.target.set(
      animal.home.x + Math.sin(angle) * distance,
      0,
      animal.home.z + Math.cos(angle) * distance,
    );
    animal.nextTargetAt =
      now + 2200 + this.hash(animal.target.x, animal.target.z, animal.phase) * 3600;
  }

  private setAnimalBox(animal: Wildlife, box: THREE.Box3): THREE.Box3 {
    const half = animal.width / 2;
    const position = animal.root.position;
    return box.set(
      new THREE.Vector3(position.x - half, position.y, position.z - half),
      new THREE.Vector3(position.x + half, position.y + animal.height, position.z + half),
    );
  }

  private removeAnimal(animal: Wildlife): void {
    const animals = this.animalsByChunk.get(animal.key);
    if (animals) {
      const index = animals.indexOf(animal);
      if (index >= 0) animals.splice(index, 1);
    }
    this.scene.remove(animal.root);
    disposeMobMeshes(animal.root);
  }

  private hash(x: number, z: number, salt: number): number {
    const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7 + this.getSeed() * 0.013) * 43758.5453;
    return n - Math.floor(n);
  }
}

function wildlifeSize(kind: WildlifeKind): { width: number; height: number } {
  switch (kind) {
    case 'deer':
      return { width: 0.72, height: 1.2 };
    case 'boar':
      return { width: 0.68, height: 0.82 };
    case 'bird':
      return { width: 0.6, height: 0.48 };
    case 'fox':
      return { width: 0.54, height: 0.74 };
    case 'rabbit':
      return { width: 0.42, height: 0.72 };
  }
}

function makeWildlifeMesh(kind: WildlifeKind): THREE.Group {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];
  const palette: Record<WildlifeKind, [number, number, number]> = {
    rabbit: [0xd8d0bf, 0xf0eadf, 0x2b221d],
    deer: [0x9a6235, 0xd0b08a, 0x3f2a18],
    fox: [0xc45f24, 0xf2e2c8, 0x2b2018],
    boar: [0x514239, 0x8a7a66, 0x2b2420],
    bird: [0x365f86, 0xcbd7df, 0x1d2b36],
  };
  const [bodyColor, accentColor, darkColor] = palette[kind];
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: darkColor });
  const scale = kind === 'deer' ? 1.15 : kind === 'boar' ? 0.95 : kind === 'bird' ? 0.58 : 0.72;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * scale, 0.42 * scale, 0.78 * scale),
    bodyMat,
  );
  body.position.y = 0.48 * scale;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3 * scale, 0.3 * scale, 0.3 * scale),
    bodyMat,
  );
  head.position.set(0, 0.62 * scale, 0.48 * scale);
  group.add(head);
  if (kind !== 'bird') {
    for (const sx of [-0.14, 0.14]) {
      for (const sz of [-0.24, 0.24]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.08 * scale, 0.36 * scale, 0.08 * scale),
          darkMat,
        );
        leg.position.set(sx * scale, 0.18 * scale, sz * scale);
        group.add(leg);
        legs.push(leg);
      }
    }
  }
  if (kind === 'rabbit') {
    for (const x of [-0.08, 0.08]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.07 * scale, 0.34 * scale, 0.07 * scale),
        accentMat,
      );
      ear.position.set(x * scale, 0.92 * scale, 0.52 * scale);
      group.add(ear);
    }
  } else if (kind === 'deer') {
    for (const x of [-0.1, 0.1]) {
      const antler = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * scale, 0.34 * scale, 0.04 * scale),
        darkMat,
      );
      antler.position.set(x * scale, 0.96 * scale, 0.5 * scale);
      group.add(antler);
    }
  } else if (kind === 'bird') {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.62 * scale, 0.06 * scale, 0.2 * scale),
        accentMat,
      );
      wing.position.set(sx * 0.38 * scale, 0.5 * scale, 0);
      wing.rotation.z = sx * 0.2;
      group.add(wing);
      wings.push(wing);
    }
  } else {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * scale, 0.16 * scale, 0.28 * scale),
      kind === 'fox' ? accentMat : darkMat,
    );
    tail.position.set(0, 0.54 * scale, -0.52 * scale);
    group.add(tail);
  }
  group.userData.legs = legs;
  group.userData.wings = wings;
  return group;
}
