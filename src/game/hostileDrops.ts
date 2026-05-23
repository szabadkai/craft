import * as THREE from 'three';
import type { ItemPickupSystem } from '../world/itemPickups';

type HostileKind = 'cave_spider' | 'zombie' | 'skeleton';

export function dropHostileLoot(
  itemPickups: ItemPickupSystem,
  position: THREE.Vector3,
  kind: HostileKind,
): void {
  if (kind === 'zombie') {
    itemPickups.spawn('raw_meat', 1 + Math.floor(Math.random() * 2), position);
    if (Math.random() < 0.18) itemPickups.spawn('iron_ingot', 1, offset(position));
  } else if (kind === 'skeleton') {
    itemPickups.spawn('bone', 1 + Math.floor(Math.random() * 2), position);
    if (Math.random() < 0.45) itemPickups.spawn('coal', 1, offset(position));
  } else {
    itemPickups.spawn('string', 1 + Math.floor(Math.random() * 2), position);
    if (Math.random() < 0.35) itemPickups.spawn('raw_meat', 1, offset(position));
  }
}

function offset(position: THREE.Vector3): THREE.Vector3 {
  return position.clone().add(new THREE.Vector3(0.15, 0, 0));
}
