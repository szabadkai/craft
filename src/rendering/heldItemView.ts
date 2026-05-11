import * as THREE from 'three';
import { blockColor } from '../blocks';
import { HeldItem } from '../inventory/items';
import { Block } from '../types';

export class HeldItemView {
  private readonly handRoot = new THREE.Group();
  private readonly heldRoot = new THREE.Group();
  private readonly handState = {
    swingStart: -1000,
    swingDuration: 260,
    swingKind: 'idle' as 'idle' | 'mine' | 'place',
  };

  constructor(camera: THREE.Camera) {
    this.handRoot.position.set(0.5, -0.52, -1.08);
    this.handRoot.rotation.set(-0.16, -0.22, -0.14);
    this.handRoot.add(this.heldRoot);
    camera.add(this.handRoot);
  }

  rebuild(entry: HeldItem): void {
    for (const child of this.heldRoot.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    }
    this.heldRoot.clear();

    if (entry.kind === 'block') {
      this.heldRoot.add(makeHeldBlock(entry.block));
    } else if (entry.tool === 'stick') {
      this.heldRoot.add(makeStick());
    } else {
      this.heldRoot.add(makePickaxe(entry.tool));
    }
  }

  triggerSwing(kind: 'mine' | 'place'): void {
    this.handState.swingKind = kind;
    this.handState.swingDuration = kind === 'mine' ? 230 : 170;
    this.handState.swingStart = performance.now();
  }

  update(now: number): void {
    const bob = Math.sin(now * 0.004) * 0.012;
    this.handRoot.position.set(0.5, -0.52 + bob, -1.08);
    this.handRoot.rotation.set(-0.16, -0.22, -0.14);

    const t = Math.min(
      1,
      Math.max(0, (now - this.handState.swingStart) / this.handState.swingDuration),
    );
    if (t < 1) {
      const swing = Math.sin(t * Math.PI);
      const strike = this.handState.swingKind === 'mine' ? Math.sin(t * Math.PI * 1.7) : swing;
      this.handRoot.position.x += swing * -0.1;
      this.handRoot.position.y += swing * -0.16;
      this.handRoot.position.z += swing * -0.16;
      this.handRoot.rotation.x += strike * -0.85;
      this.handRoot.rotation.y += swing * 0.22;
      this.handRoot.rotation.z += swing * -0.38;
    }
  }
}

function makeHeldBlock(block: Block): THREE.Group {
  const group = new THREE.Group();
  const [r, g, b] = blockColor(block);
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), material);
  cube.rotation.set(0.2, 0.55, -0.16);
  cube.position.set(0, 0, 0);
  group.add(cube);
  return group;
}

function makeStick(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x8a572b });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.06), material);
  shaft.rotation.set(0.36, 0, -0.52);
  shaft.position.set(0.02, 0, 0);
  group.add(shaft);
  return group;
}

function makePickaxe(tool: 'wood_pickaxe' | 'stone_pickaxe'): THREE.Group {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.64, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x8a572b }),
  );
  handle.rotation.set(0.34, 0, -0.55);
  handle.position.set(0.02, -0.06, 0);
  group.add(handle);

  const headColor = tool === 'stone_pickaxe' ? 0x9b9d98 : 0x9a6835;
  const headMaterial = new THREE.MeshLambertMaterial({ color: headColor });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.09), headMaterial);
  head.rotation.set(0.34, 0, -0.55);
  head.position.set(-0.09, 0.22, 0);
  group.add(head);

  const tipA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), headMaterial.clone());
  tipA.rotation.set(0.34, 0, -0.9);
  tipA.position.set(-0.3, 0.29, 0);
  group.add(tipA);

  const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), headMaterial.clone());
  tipB.rotation.set(0.34, 0, -0.2);
  tipB.position.set(0.12, 0.16, 0);
  group.add(tipB);
  return group;
}
