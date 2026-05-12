import * as THREE from 'three';
import { blockColor } from '../blocks';
import { itemDefs, Item, itemSwatch } from '../inventory/items';

type ItemPickup = {
  item: Item;
  count: number;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  bornAt: number;
};

const PICKUP_RADIUS = 1.35;
const PICKUP_LIFETIME_MS = 90_000;
const MAX_PICKUPS = 180;

export class ItemPickupSystem {
  private readonly pickups: ItemPickup[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  private readonly materials = new Map<Item, THREE.MeshStandardMaterial>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly addToInventory: (item: Item, amount: number) => number,
  ) {}

  spawn(item: Item | null, count: number, position: THREE.Vector3): void {
    if (!item || count <= 0) return;
    const mesh = new THREE.Mesh(this.geometry, this.materialFor(item));
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.item = item;
    this.scene.add(mesh);
    this.pickups.push({
      item,
      count,
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.8, (Math.random() - 0.5) * 0.7),
      bornAt: performance.now(),
    });
    this.trimOldPickups();
  }

  update(dt: number, now: number, playerPosition: THREE.Vector3): void {
    for (let index = this.pickups.length - 1; index >= 0; index--) {
      const pickup = this.pickups[index];
      const age = now - pickup.bornAt;
      if (age > PICKUP_LIFETIME_MS) {
        this.removeAt(index);
        continue;
      }

      pickup.velocity.y -= 9.8 * dt;
      pickup.mesh.position.addScaledVector(pickup.velocity, dt);
      if (pickup.mesh.position.y < 0.28) {
        pickup.mesh.position.y = 0.28;
        pickup.velocity.set(0, 0, 0);
      } else {
        pickup.velocity.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      }

      const bob = Math.sin(now * 0.006 + index) * 0.035;
      pickup.mesh.position.y += bob * dt;
      pickup.mesh.rotation.y += dt * 2.2;

      if (pickup.mesh.position.distanceTo(playerPosition) > PICKUP_RADIUS) continue;
      const accepted = this.addToInventory(pickup.item, pickup.count);
      pickup.count -= accepted;
      if (pickup.count <= 0) this.removeAt(index);
    }
  }

  clear(): void {
    for (const pickup of this.pickups) {
      this.scene.remove(pickup.mesh);
    }
    this.pickups.length = 0;
  }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }

  private materialFor(item: Item): THREE.MeshStandardMaterial {
    const existing = this.materials.get(item);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color: itemColor(item),
      roughness: 0.85,
      metalness: 0,
    });
    this.materials.set(item, material);
    return material;
  }

  private trimOldPickups(): void {
    while (this.pickups.length > MAX_PICKUPS) this.removeAt(0);
  }

  private removeAt(index: number): void {
    const [pickup] = this.pickups.splice(index, 1);
    this.scene.remove(pickup.mesh);
  }
}

function itemColor(item: Item): THREE.Color {
  const def = itemDefs.find((entry) => entry.id === item);
  if (def?.block !== undefined) {
    const [r, g, b] = blockColor(def.block);
    return new THREE.Color(r, g, b);
  }
  const swatch = itemSwatch(item);
  if (swatch.startsWith('#')) return new THREE.Color(swatch);
  if (item === 'sticks') return new THREE.Color(0x8b5a2b);
  if (item === 'wood_pickaxe') return new THREE.Color(0x9a6835);
  if (item === 'stone_pickaxe') return new THREE.Color(0xc2c7c4);
  if (item === 'iron_pickaxe') return new THREE.Color(0xd6d8db);
  return new THREE.Color(0x90999c);
}
