import * as THREE from 'three';
import { blockColor } from '../blocks';
import { HeldItem, Item } from '../inventory/items';
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
    disposeObject(this.heldRoot);
    this.heldRoot.clear();

    if (!entry) {
      this.heldRoot.add(prepareHeldModel(makeEmptyHand()));
      return;
    }

    if (entry.kind === 'block') {
      this.heldRoot.add(prepareHeldModel(makeHeldBlock(entry.block)));
    } else if (entry.kind === 'food') {
      this.heldRoot.add(prepareHeldModel(makeFood(entry.item)));
    } else if (entry.kind === 'item') {
      this.heldRoot.add(prepareHeldModel(makeLooseItem(entry.item)));
    } else if (entry.tool === 'stick') {
      this.heldRoot.add(prepareHeldModel(makeStick()));
    } else {
      this.heldRoot.add(prepareHeldModel(makePickaxe(entry.tool)));
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

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

function prepareHeldModel(model: THREE.Group): THREE.Group {
  model.traverse((child) => {
    child.frustumCulled = false;
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.renderOrder = 10_000;
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      entry.depthTest = false;
      entry.depthWrite = false;
      entry.needsUpdate = true;
    }
  });
  return model;
}

function makeEmptyHand(): THREE.Group {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.set(-0.12, 0.16, -0.08);
  pivot.position.set(0.02, -0.08, 0);
  group.add(pivot);

  addBox(pivot, [0.18, 0.18, 0.62], [0, -0.02, 0.12], 0x8f5a36);
  addBox(pivot, [0.2, 0.2, 0.2], [0, -0.02, -0.28], 0xd09a6c);
  return group;
}

function makeHeldBlock(block: Block): THREE.Group {
  switch (block) {
    case Block.Torch:
      return makeTorch();
    case Block.OakSlab:
    case Block.OakSlabTop:
      return makeSlab(0xc28a49);
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
      return makeSlab(0x686a66);
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
      return makeStair(0xc28a49);
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return makeStair(0x686a66);
    case Block.OakDoor:
    case Block.OakDoorOpen:
      return makeDoor();
    case Block.Chest:
      return makeChest();
    case Block.CraftingTable:
      return makeCraftingTable();
    case Block.Furnace:
      return makeFurnace();
    case Block.Cactus:
      return makeCactus();
    case Block.Pumpkin:
      return makePumpkin();
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
    case Block.TallGrass:
    case Block.Mushroom:
    case Block.BerryBush:
    case Block.GlowBerry:
    case Block.AmethystCluster:
      return makeDecoration(block);
    case Block.IronBars:
      return makeBars();
    case Block.Glass:
      return makeGlass();
    default:
      return makeHeldCube(block);
  }
}

function makeHeldCube(block: Block): THREE.Group {
  const group = new THREE.Group();
  const [r, g, b] = blockColor(block);
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), material);
  cube.rotation.set(0.2, 0.55, -0.16);
  cube.position.set(0, 0, 0);
  group.add(cube);
  return group;
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(position[0], position[1], position[2]);
  group.add(mesh);
  return mesh;
}

function withBlockPose(group: THREE.Group): THREE.Group {
  group.rotation.set(0.2, 0.55, -0.16);
  return group;
}

function makeSlab(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.46, 0.23, 0.46], [0, -0.08, 0], color);
  return withBlockPose(group);
}

function makeStair(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.46, 0.23, 0.46], [0, -0.12, 0], color);
  addBox(group, [0.46, 0.23, 0.23], [0, 0.12, -0.115], color);
  return withBlockPose(group);
}

function makeDoor(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.34, 0.72, 0.045], [0, 0, 0], 0xb27635);
  addBox(group, [0.24, 0.22, 0.012], [0, 0.18, -0.03], 0xd09a55);
  addBox(group, [0.24, 0.22, 0.012], [0, -0.16, -0.03], 0x8f5728);
  addBox(group, [0.035, 0.035, 0.035], [0.12, 0.02, -0.05], 0xd8c070);
  group.rotation.set(0.08, 0.46, -0.12);
  return group;
}

function makeChest(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.46, 0.32, 0.34], [0, -0.04, 0], 0x8b5e2d);
  addBox(group, [0.49, 0.12, 0.37], [0, 0.18, 0], 0xb77a35);
  addBox(group, [0.08, 0.11, 0.035], [0, 0.04, -0.2], 0xd6b552);
  addBox(group, [0.5, 0.035, 0.39], [0, 0.1, 0], 0x5f3a20);
  return withBlockPose(group);
}

function makeCraftingTable(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.44, 0.42, 0.44], [0, 0, 0], 0x8a562c);
  addBox(group, [0.46, 0.045, 0.46], [0, 0.235, 0], 0xc99650);
  addBox(group, [0.045, 0.052, 0.46], [-0.08, 0.262, 0], 0x5c351b);
  addBox(group, [0.045, 0.052, 0.46], [0.08, 0.262, 0], 0x5c351b);
  addBox(group, [0.46, 0.052, 0.045], [0, 0.262, -0.08], 0x5c351b);
  addBox(group, [0.46, 0.052, 0.045], [0, 0.262, 0.08], 0x5c351b);
  return withBlockPose(group);
}

function makeFurnace(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.44, 0.44, 0.44], [0, 0, 0], 0x55575a);
  addBox(group, [0.24, 0.16, 0.028], [0, 0.04, -0.235], 0x1e2022);
  addBox(group, [0.18, 0.05, 0.03], [0, -0.12, -0.24], 0xd57a2a);
  return withBlockPose(group);
}

function makeCactus(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.26, 0.62, 0.26], [0, 0, 0], 0x2e8b3d);
  addBox(group, [0.04, 0.64, 0.285], [-0.11, 0, 0], 0x4fa95a);
  addBox(group, [0.04, 0.64, 0.285], [0.11, 0, 0], 0x1f6d31);
  group.rotation.set(0.08, 0.48, -0.1);
  return group;
}

function makePumpkin(): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.44, 0.36, 0.42], [0, -0.04, 0], 0xd36c19);
  addBox(group, [0.05, 0.12, 0.05], [0, 0.22, 0], 0x5d6f24);
  addBox(group, [0.035, 0.24, 0.43], [-0.12, -0.04, 0], 0xb65314);
  addBox(group, [0.035, 0.24, 0.43], [0.12, -0.04, 0], 0xf08a20);
  return withBlockPose(group);
}

function makeBars(): THREE.Group {
  const group = new THREE.Group();
  for (const x of [-0.16, 0, 0.16]) addBox(group, [0.035, 0.48, 0.035], [x, 0, 0], 0x9a9a96);
  addBox(group, [0.42, 0.035, 0.035], [0, 0.16, 0], 0xb5b5b0);
  addBox(group, [0.42, 0.035, 0.035], [0, -0.16, 0], 0x7f807c);
  group.rotation.set(0.12, 0.48, -0.1);
  return group;
}

function makeGlass(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({
    color: 0x9fd7e5,
    transparent: true,
    opacity: 0.48,
  });
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.045), material);
  group.add(pane);
  return withBlockPose(group);
}

function makeDecoration(block: Block): THREE.Group {
  const group = new THREE.Group();
  if (block === Block.Mushroom) {
    addBox(group, [0.08, 0.3, 0.08], [0, -0.1, 0], 0xd9c19d);
    addBox(group, [0.26, 0.12, 0.24], [0, 0.12, 0], 0xb94732);
  } else if (block === Block.BerryBush || block === Block.GlowBerry) {
    addBox(group, [0.3, 0.36, 0.26], [0, -0.04, 0], 0x3f7a35);
    addBox(group, [0.07, 0.07, 0.07], [-0.09, 0.06, -0.14], block === Block.GlowBerry ? 0xf0c53a : 0xb71f2a);
    addBox(group, [0.06, 0.06, 0.06], [0.1, -0.08, -0.14], 0xc7363f);
  } else if (block === Block.AmethystCluster) {
    for (const x of [-0.1, 0.02, 0.13]) {
      const shard = addBox(group, [0.07, 0.28 + Math.abs(x), 0.07], [x, -0.05 + Math.abs(x), 0], 0xb576d4);
      shard.rotation.z = x * 1.8;
    }
  } else {
    const [r, g, b] = blockColor(block);
    addBox(group, [0.06, 0.42, 0.06], [0, -0.08, 0], 0x4f8a31);
    addBox(group, [0.22, 0.16, 0.04], [0, 0.12, -0.02], new THREE.Color(r, g, b));
  }
  group.rotation.set(0.16, 0.42, -0.14);
  return group;
}

function makeFood(item: Item): THREE.Group {
  const group = new THREE.Group();
  if (item === 'apple') {
    addBox(group, [0.26, 0.24, 0.24], [0, -0.02, 0], 0xc83025);
    addBox(group, [0.05, 0.1, 0.05], [0.03, 0.14, 0], 0x6b4423);
    addBox(group, [0.12, 0.045, 0.07], [0.11, 0.17, 0], 0x4a8b35);
  } else {
    const cooked = item === 'cooked_meat';
    addBox(group, [0.3, 0.18, 0.2], [0, -0.02, 0], cooked ? 0x8b4a30 : 0xc46e5a);
    addBox(group, [0.1, 0.08, 0.1], [0.18, 0.0, 0], 0xe0d0b5);
  }
  group.rotation.set(0.24, 0.35, -0.22);
  return group;
}

function makeLooseItem(item: Item): THREE.Group {
  switch (item) {
    case 'coal':
      return makeNugget(0x222222);
    case 'diamond':
      return makeGem(0x58d8e4);
    case 'emerald':
      return makeGem(0x35c75a);
    case 'redstone':
      return makeDust(0xbc2424);
    case 'iron_ingot':
      return makeIngot(0xd7dde0);
    case 'copper_ingot':
      return makeIngot(0xd2844e);
    case 'gold_ingot':
      return makeIngot(0xf0c85a);
    case 'iron_ore':
      return makeOreChunk(0xa97855);
    case 'copper_ore':
      return makeOreChunk(0xb86d3d);
    case 'gold_ore':
      return makeOreChunk(0xe2b63d);
    default:
      return makeNugget(0x9a8f7f);
  }
}

function makeNugget(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.22, 0.18, 0.2], [-0.02, 0.02, 0], color);
  addBox(group, [0.12, 0.11, 0.13], [0.12, -0.06, -0.03], color);
  addBox(group, [0.1, 0.09, 0.12], [-0.13, -0.07, 0.04], color);
  group.rotation.set(0.22, 0.46, -0.22);
  return group;
}

function makeOreChunk(oreColor: THREE.ColorRepresentation): THREE.Group {
  const group = makeNugget(0x696a66);
  addBox(group, [0.07, 0.055, 0.035], [0.05, 0.12, -0.095], oreColor);
  addBox(group, [0.055, 0.045, 0.035], [-0.1, 0.01, -0.105], oreColor);
  addBox(group, [0.06, 0.05, 0.035], [0.14, -0.07, -0.085], oreColor);
  return group;
}

function makeIngot(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.34, 0.1, 0.18], [0, 0, 0], color);
  addBox(group, [0.26, 0.055, 0.14], [0, 0.078, 0], color);
  group.rotation.set(0.28, 0.38, -0.24);
  return group;
}

function makeGem(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  const core = addBox(group, [0.18, 0.26, 0.18], [0, 0, 0], color);
  core.rotation.z = 0.78;
  addBox(group, [0.08, 0.08, 0.2], [0, 0.17, 0], 0xe9ffff);
  group.rotation.set(0.24, 0.42, -0.16);
  return group;
}

function makeDust(color: THREE.ColorRepresentation): THREE.Group {
  const group = new THREE.Group();
  addBox(group, [0.24, 0.035, 0.12], [-0.04, 0.02, 0], color);
  addBox(group, [0.14, 0.035, 0.2], [0.08, -0.02, 0], color);
  addBox(group, [0.08, 0.035, 0.08], [-0.17, -0.03, 0.04], color);
  group.rotation.set(0.26, 0.4, -0.18);
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
