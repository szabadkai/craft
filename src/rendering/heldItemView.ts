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
    // Position further from camera to reduce wall clipping, with slight rightward offset
    this.handRoot.position.set(0.52, -0.44, -0.88);
    this.handRoot.rotation.set(-0.12, -0.18, -0.10);
    this.handRoot.add(this.heldRoot);
    camera.add(this.handRoot);
  }

  rebuild(entry: HeldItem | null): void {
    for (const child of this.heldRoot.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    }
    this.heldRoot.clear();

    if (!entry) return;

    if (entry.kind === 'block' && entry.block === Block.Torch) {
      this.heldRoot.add(makeTorch());
    } else if (entry.kind === 'block') {
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
    this.handRoot.position.set(0.52, -0.44 + bob, -0.88);
    this.handRoot.rotation.set(-0.12, -0.18, -0.10);

    const t = Math.min(
      1,
      Math.max(0, (now - this.handState.swingStart) / this.handState.swingDuration),
    );
    if (t < 1) {
      const swing = Math.sin(t * Math.PI);
      const strike = this.handState.swingKind === 'mine' ? Math.sin(t * Math.PI * 1.7) : swing;
      this.handRoot.position.x += swing * -0.1;
      this.handRoot.position.y += swing * -0.16;
      this.handRoot.position.z += swing * -0.14;
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
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), material);
  cube.rotation.set(0.2, 0.55, -0.16);
  cube.position.set(0, 0, 0);
  group.add(cube);
  return group;
}

function makeStick(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0x8a572b });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.72, 0.10), material);
  shaft.rotation.set(0.36, 0, -0.52);
  shaft.position.set(0.02, 0, 0);
  group.add(shaft);
  return group;
}

function makeTorch(): THREE.Group {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.set(0.36, 0, -0.52);
  pivot.position.set(0.02, -0.06, 0);
  group.add(pivot);

  const stickMat = new THREE.MeshLambertMaterial({ color: 0x8a572b });
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.58, 0.10), stickMat);
  pivot.add(stick);

  const flameMat = new THREE.MeshLambertMaterial({ color: 0xf0c040, emissive: 0xf0a020, emissiveIntensity: 0.8 });
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), flameMat);
  flame.position.set(0, 0.34, 0);
  pivot.add(flame);
  return group;
}

function makePickaxe(tool: 'wood_pickaxe' | 'stone_pickaxe' | 'iron_pickaxe'): THREE.Group {
  const group = new THREE.Group();

  // Handle and head share position + rotation so the head is built in handle-local space.
  const pos = { x: 0.02, y: -0.08, z: 0 };
  const rot = { x: 0.34, y: 0, z: -0.55 };

  // ---- handle ----
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x8a572b });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.80, 0.10), handleMat);
  handle.rotation.set(rot.x, rot.y, rot.z);
  handle.position.set(pos.x, pos.y, pos.z);
  group.add(handle);

  // ---- pickaxe head in handle-local coordinates ----
  // +Y is along the handle, +X is side-to-side, +Z is forward-back.
  // The handle top is at local Y = +0.40.
  const headColor =
    tool === 'iron_pickaxe' ? 0xd6d8db : tool === 'stone_pickaxe' ? 0x9b9d98 : 0x9a6835;
  const headMat = new THREE.MeshLambertMaterial({ color: headColor });

  const head = new THREE.Group();
  head.rotation.set(rot.x, rot.y, rot.z);
  head.position.set(pos.x, pos.y, pos.z);
  group.add(head);

  // Eye — wraps the handle near its top
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.14), headMat);
  eye.position.set(0, 0.36, 0);
  head.add(eye);

  // Left arm — extends -X, angles slightly downward
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), headMat);
  armL.position.set(-0.22, 0.35, 0);
  armL.rotation.z = 0.18;
  head.add(armL);

  // Right arm — extends +X, angles slightly downward
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), headMat);
  armR.position.set(0.22, 0.35, 0);
  armR.rotation.z = -0.18;
  head.add(armR);

  // Left tip — narrower, angled further downward (pick point)
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.11), headMat);
  tipL.position.set(-0.39, 0.29, 0);
  tipL.rotation.z = 0.45;
  head.add(tipL);

  // Right tip
  const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.11), headMat);
  tipR.position.set(0.39, 0.29, 0);
  tipR.rotation.z = -0.45;
  head.add(tipR);

  return group;
}
