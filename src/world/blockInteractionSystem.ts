import * as THREE from 'three';
import { isSolid } from '../blocks';
import { tileForBlockFace, tileRect } from '../atlas';
import { InventorySystem } from '../inventory/inventorySystem';
import { Item } from '../inventory/items';
import { PlayerState } from '../player/playerController';
import { Block } from '../types';
import { BlockHit, BlockRaycaster } from './blockRaycaster';
import { DoorSystem } from './doorSystem';
import {
  blockHardness,
  damagesTool,
  miningDrop,
  MiningTool,
} from './miningRules';
import { WaterSimSystem } from './waterSim';

type UseBlockResult = 'handled' | 'pass';

export class BlockInteractionSystem {
  private readonly highlight: THREE.Mesh;
  private readonly atlasTexture: THREE.CanvasTexture;
  private readonly placePreview: THREE.Mesh;
  private readonly placePreviewMaterial: THREE.MeshLambertMaterial;
  private previewBlock: Block | null = null;
  private readonly crackCanvas = document.createElement('canvas');
  private readonly crackTexture: THREE.CanvasTexture;
  private readonly crackOverlay: THREE.Mesh;
  private readonly crackMaterial: THREE.MeshBasicMaterial;
  private readonly mining = {
    active: false,
    block: new THREE.Vector3(),
    startedAt: 0,
    lastSwingAt: 0,
    duration: 450,
    progress: 0,
    damageStage: -1,
  };

  constructor(
    scene: THREE.Scene,
    private readonly raycaster: BlockRaycaster,
    private readonly inventory: InventorySystem,
    private readonly player: PlayerState,
    private readonly getBlock: (wx: number, y: number, wz: number) => Block,
    private readonly setBlock: (wx: number, y: number, wz: number, block: Block) => void,
    private readonly triggerSwing: (kind: 'mine' | 'place') => void,
    private readonly spawnItemDrop: (item: Item | null, count: number, position: THREE.Vector3) => void,
    private readonly onBlockBroken: (wx: number, y: number, wz: number, block: Block) => void,
    private readonly doorSystem: DoorSystem,
    private readonly setBlocks: (entries: { wx: number; y: number; wz: number; block: Block }[]) => void,
    private readonly waterSim: WaterSimSystem,
    atlasTexture: THREE.CanvasTexture,
  ) {
    this.atlasTexture = atlasTexture;
    this.placePreviewMaterial = new THREE.MeshLambertMaterial({
      map: atlasTexture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    this.highlight = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), highlightMaterial);
    this.highlight.visible = false;
    scene.add(this.highlight);

    this.placePreview = new THREE.Mesh(
      atlasBoxGeometry(Block.Stone),
      this.placePreviewMaterial,
    );
    this.placePreview.visible = false;
    scene.add(this.placePreview);

    this.crackCanvas.width = 128;
    this.crackCanvas.height = 128;
    this.crackTexture = new THREE.CanvasTexture(this.crackCanvas);
    this.crackTexture.colorSpace = THREE.SRGBColorSpace;
    this.crackTexture.magFilter = THREE.NearestFilter;
    this.crackTexture.minFilter = THREE.NearestFilter;
    this.crackTexture.generateMipmaps = false;
    this.crackMaterial = new THREE.MeshBasicMaterial({
      map: this.crackTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
    });
    this.crackOverlay = new THREE.Mesh(new THREE.BoxGeometry(1.018, 1.018, 1.018), this.crackMaterial);
    this.crackOverlay.visible = false;
    scene.add(this.crackOverlay);
  }

  raycast(): BlockHit | null {
    return this.raycaster.raycast();
  }

  hide(): void {
    this.highlight.visible = false;
    this.placePreview.visible = false;
    this.crackOverlay.visible = false;
  }

  updateHighlight(): void {
    if (this.inventory.isOpen) {
      this.highlight.visible = false;
      this.placePreview.visible = false;
      return;
    }
    const hit = this.raycaster.raycast();
    this.highlight.visible = Boolean(hit);
    this.placePreview.visible = false;
    if (hit) {
      this.highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
      this.updatePlacePreview(hit);
    }
  }

  use(hit: BlockHit): UseBlockResult {
    const block = this.getBlock(hit.block.x, hit.block.y, hit.block.z);
    if (block === Block.Furnace) return 'handled';
    if (block === Block.OakDoor || block === Block.OakDoorOpen) {
      this.doorSystem.toggle(hit.block.x, hit.block.y, hit.block.z, this.getBlock, this.setBlocks);
      return 'handled';
    }
    if (block === Block.Spawner) {
      this.lootSpawner(hit.block.x, hit.block.y, hit.block.z);
      return 'handled';
    }
    return 'pass';
  }

  private lootSpawner(wx: number, y: number, wz: number): void {
    const pos = new THREE.Vector3(wx + 0.5, y + 0.65, wz + 0.5);
    const roll = Math.random();
    if (roll < 0.25) {
      this.spawnItemDrop('iron_ingot', 1 + Math.floor(Math.random() * 2), pos);
    } else if (roll < 0.45) {
      this.spawnItemDrop('gold_ingot', 1, pos);
    } else if (roll < 0.55) {
      this.spawnItemDrop('diamond', 1, pos);
    } else if (roll < 0.72) {
      this.spawnItemDrop('coal', 2 + Math.floor(Math.random() * 3), pos);
    } else if (roll < 0.85) {
      this.spawnItemDrop('iron_pickaxe', 1, pos);
    } else {
      this.spawnItemDrop('apple', 2 + Math.floor(Math.random() * 2), pos);
    }
    this.setBlock(wx, y, wz, Block.MossyStoneBrick);
  }

  place(hit: BlockHit): void {
    this.stopMining();
    const block = this.inventory.selectedPlaceBlock();
    if (block === null) {
      this.triggerSwing('place');
      return;
    }
    const item = this.inventory.selectedPlaceItem();
    if (item && this.inventory.itemCount(item) <= 0) return;

    // Toggle door if targeting a door
    const targetBlock = this.getBlock(hit.block.x, hit.block.y, hit.block.z);
    if (targetBlock === Block.OakDoor || targetBlock === Block.OakDoorOpen) {
      this.doorSystem.toggle(hit.block.x, hit.block.y, hit.block.z, this.getBlock, this.setBlocks);
      return;
    }

    const place = hit.block.clone().add(hit.normal);
    if (!this.canReplaceForPlacement(place.x, place.y, place.z) || this.wouldIntersectPlayer(place))
      return;

    // Orient logs based on placement face normal
    let placeBlock = block;
    if (block === Block.Log) {
      if (Math.abs(hit.normal.x) > 0) placeBlock = Block.LogX;
      else if (Math.abs(hit.normal.z) > 0) placeBlock = Block.LogZ;
    } else if (block === Block.BirchLog) {
      if (Math.abs(hit.normal.x) > 0) placeBlock = Block.BirchLogX;
      else if (Math.abs(hit.normal.z) > 0) placeBlock = Block.BirchLogZ;
    } else if (block === Block.OakSlab || block === Block.CobblestoneSlab) {
      // Top face → bottom slab; Bottom face → top slab; Side → bottom slab
      if (hit.normal.y < 0) {
        placeBlock = block === Block.OakSlab ? Block.OakSlabTop : Block.CobblestoneSlabTop;
      }
    } else if (block === Block.OakStairsN || block === Block.CobblestoneStairsN) {
      // Orient stairs based on player's yaw: higher step faces away from player
      placeBlock = stairForYaw(block === Block.OakStairsN ? 'oak' : 'cobble', this.player.yaw);
    }

    // Handle door placement (two-tall)
    if (block === Block.OakDoor) {
      const below = this.getBlock(place.x, place.y - 1, place.z);
      if (!isSolid(below) || !this.canReplaceForPlacement(place.x, place.y + 1, place.z)) return;
      if (this.wouldIntersectPlayer(new THREE.Vector3(place.x, place.y + 1, place.z))) return;
      const orientation: 'x' | 'z' = Math.abs(hit.normal.x) > 0 ? 'z' : 'x';
      this.doorSystem.place(place.x, place.y, place.z, orientation, this.setBlocks);
      this.triggerSwing('place');
      if (item) this.inventory.consumeSelectedItem(1);
      return;
    }

    this.setBlock(place.x, place.y, place.z, placeBlock);
    this.triggerSwing('place');
    if (item) this.inventory.consumeSelectedItem(1);
  }

  startMining(hit: BlockHit): void {
    if (this.inventory.isOpen) return;
    this.mining.active = true;
    this.mining.block.copy(hit.block);
    this.mining.startedAt = performance.now();
    this.mining.lastSwingAt = this.mining.startedAt;
    this.mining.duration = blockHardness(
      this.getBlock(hit.block.x, hit.block.y, hit.block.z),
      this.currentMiningTool(),
    );
    this.mining.progress = 0;
    this.mining.damageStage = -2;
    this.crackOverlay.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
    this.crackOverlay.visible = true;
    this.drawCracks(0);
    this.triggerSwing('mine');
  }

  stopMining(): void {
    this.mining.active = false;
    this.mining.progress = 0;
    this.mining.damageStage = -1;
    this.crackOverlay.visible = false;
  }

  updateMining(now: number): void {
    if (!this.mining.active) return;
    const hit = this.raycaster.raycast();
    if (
      !hit ||
      !hit.block.equals(this.mining.block) ||
      this.getBlock(this.mining.block.x, this.mining.block.y, this.mining.block.z) === Block.Air
    ) {
      this.stopMining();
      return;
    }
    this.mining.progress = Math.min(1, (now - this.mining.startedAt) / this.mining.duration);
    if (now - this.mining.lastSwingAt > 190) {
      this.mining.lastSwingAt = now;
      this.triggerSwing('mine');
    }
    this.crackOverlay.position.set(
      this.mining.block.x + 0.5,
      this.mining.block.y + 0.5,
      this.mining.block.z + 0.5,
    );
    this.crackOverlay.visible = true;
    this.drawCracks(this.mining.progress);
    if (this.mining.progress >= 1) {
      const block = this.getBlock(this.mining.block.x, this.mining.block.y, this.mining.block.z);
      const tool = this.currentMiningTool();
      const drop = miningDrop(block, tool);
      const dropPosition = new THREE.Vector3(
        this.mining.block.x + 0.5,
        this.mining.block.y + 0.65,
        this.mining.block.z + 0.5,
      );
      if (drop) this.spawnItemDrop(drop.item, drop.count, dropPosition);
      if (damagesTool(block, tool)) this.inventory.damageSelectedTool(1);

      // Handle door breaking — remove both halves atomically
      if (block === Block.OakDoor || block === Block.OakDoorOpen) {
        this.doorSystem.remove(
          this.mining.block.x, this.mining.block.y, this.mining.block.z,
          this.getBlock, this.setBlocks,
        );
      } else {
        this.onBlockBroken(this.mining.block.x, this.mining.block.y, this.mining.block.z, block);
        this.setBlock(this.mining.block.x, this.mining.block.y, this.mining.block.z, Block.Air);
        // Water flow: fill the new air space and its surroundings if adjacent to water
        this.triggerWaterFlow(
          this.mining.block.x,
          this.mining.block.y,
          this.mining.block.z,
        );
      }
      // Leaf decay: when a log is broken, nearby leaves decay with drops
      if (
        block === Block.Log || block === Block.LogX || block === Block.LogZ ||
        block === Block.BirchLog || block === Block.BirchLogX || block === Block.BirchLogZ
      ) {
        this.decayLeaves(this.mining.block.x, this.mining.block.y, this.mining.block.z);
      }
      // Chain into next block if still holding
      const nextHit = this.raycaster.raycast();
      if (nextHit && this.getBlock(nextHit.block.x, nextHit.block.y, nextHit.block.z) !== Block.Air) {
        this.startMining(nextHit);
      } else {
        this.stopMining();
      }
    }
  }

  private updatePlacePreview(hit: BlockHit): void {
    const block = this.inventory.selectedPlaceBlock();
    if (block === null) return;
    const item = this.inventory.selectedPlaceItem();
    if (item && this.inventory.itemCount(item) <= 0) return;

    const place = hit.block.clone().add(hit.normal);
    if (!this.canReplaceForPlacement(place.x, place.y, place.z)) return;
    if (this.wouldIntersectPlayer(place)) return;

    // Orient log preview based on placement face normal
    let previewBlock = block;
    if (block === Block.Log) {
      if (Math.abs(hit.normal.x) > 0) previewBlock = Block.LogX;
      else if (Math.abs(hit.normal.z) > 0) previewBlock = Block.LogZ;
    } else if (block === Block.BirchLog) {
      if (Math.abs(hit.normal.x) > 0) previewBlock = Block.BirchLogX;
      else if (Math.abs(hit.normal.z) > 0) previewBlock = Block.BirchLogZ;
    } else if (block === Block.OakSlab || block === Block.CobblestoneSlab) {
      if (hit.normal.y < 0) {
        previewBlock = block === Block.OakSlab ? Block.OakSlabTop : Block.CobblestoneSlabTop;
      }
    } else if (block === Block.OakStairsN || block === Block.CobblestoneStairsN) {
      previewBlock = stairForYaw(block === Block.OakStairsN ? 'oak' : 'cobble', this.player.yaw);
    }
    // For doors, also check space above and solid below
    if (block === Block.OakDoor) {
      const below = this.getBlock(place.x, place.y - 1, place.z);
      if (!isSolid(below) || !this.canReplaceForPlacement(place.x, place.y + 1, place.z)) return;
      if (this.wouldIntersectPlayer(new THREE.Vector3(place.x, place.y + 1, place.z))) return;
    }
    if (this.previewBlock !== previewBlock) {
      this.previewBlock = previewBlock;
      this.placePreview.geometry.dispose();
      this.placePreview.geometry = atlasBoxGeometry(previewBlock);
    }
    const isTopSlab = previewBlock === Block.OakSlabTop || previewBlock === Block.CobblestoneSlabTop;
    this.placePreview.position.set(place.x + 0.5, place.y + (isTopSlab ? 0.75 : 0.5), place.z + 0.5);
    this.placePreview.visible = true;
  }

  private wouldIntersectPlayer(block: THREE.Vector3): boolean {
    const half = this.player.width / 2;
    const minX = this.player.position.x - half;
    const maxX = this.player.position.x + half;
    const minY = this.player.position.y;
    const maxY = this.player.position.y + this.player.height;
    const minZ = this.player.position.z - half;
    const maxZ = this.player.position.z + half;
    return (
      block.x < maxX &&
      block.x + 1 > minX &&
      block.y < maxY &&
      block.y + 1 > minY &&
      block.z < maxZ &&
      block.z + 1 > minZ
    );
  }

  private canReplaceForPlacement(wx: number, y: number, wz: number): boolean {
    const block = this.getBlock(wx, y, wz);
    return block === Block.Air || block === Block.Water;
  }

  private currentMiningTool(): MiningTool {
    const tool = this.inventory.selectedTool();
    return tool?.tool ?? 'hand';
  }

  private drawCracks(progress: number): void {
    const context = this.crackCanvas.getContext('2d');
    if (!context) return;

    const stage = progress <= 0 ? -1 : Math.min(9, Math.floor(progress * 10));
    if (stage === this.mining.damageStage) return;
    this.mining.damageStage = stage;

    const size = this.crackCanvas.width;
    context.clearRect(0, 0, size, size);
    if (stage < 0) {
      this.crackTexture.needsUpdate = true;
      return;
    }

    context.imageSmoothingEnabled = false;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = `rgba(0, 0, 0, ${0.18 + stage * 0.045})`;
    context.fillRect(0, 0, size, size);

    const cracks = [
      [
        [64, 64],
        [46, 54],
        [30, 42],
        [18, 34],
      ],
      [
        [64, 64],
        [78, 48],
        [90, 28],
        [100, 14],
      ],
      [
        [64, 64],
        [78, 72],
        [96, 80],
        [116, 86],
      ],
      [
        [64, 64],
        [52, 78],
        [42, 96],
        [32, 116],
      ],
      [
        [46, 54],
        [42, 70],
        [30, 76],
      ],
      [
        [78, 72],
        [82, 92],
        [92, 106],
      ],
      [
        [78, 48],
        [94, 56],
        [108, 54],
      ],
    ];

    const visibleCracks = Math.min(cracks.length, Math.ceil(((stage + 1) / 10) * cracks.length));
    const pixelScale = 8;
    context.lineCap = 'square';
    context.lineJoin = 'miter';
    context.strokeStyle = `rgba(12, 10, 8, ${0.58 + stage * 0.035})`;
    context.lineWidth = stage < 4 ? 4 : stage < 8 ? 6 : 8;

    for (let i = 0; i < visibleCracks; i++) {
      const points = cracks[i];
      context.beginPath();
      points.forEach(([x, y], index) => {
        const snappedX = Math.round(x / pixelScale) * pixelScale;
        const snappedY = Math.round(y / pixelScale) * pixelScale;
        if (index === 0) context.moveTo(snappedX, snappedY);
        else context.lineTo(snappedX, snappedY);
      });
      context.stroke();

      if (stage >= 3) {
        const tip = points[Math.min(points.length - 1, Math.floor(points.length * 0.72))];
        this.drawCrackChip(context, tip[0], tip[1], stage, i);
      }
    }

    if (stage >= 5) this.drawFractureNoise(context, stage);
    this.crackMaterial.opacity = 0.62 + stage * 0.035;
    this.crackTexture.needsUpdate = true;
  }

  private drawCrackChip(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    stage: number,
    seed: number,
  ): void {
    const snappedX = Math.round(x / 8) * 8;
    const snappedY = Math.round(y / 8) * 8;
    const size = stage >= 8 ? 8 : 4;
    context.fillStyle = `rgba(6, 5, 4, ${0.32 + stage * 0.045})`;
    context.fillRect(snappedX - size / 2, snappedY - size / 2, size, size);

    if (stage < 6) return;
    const offsetX = seed % 2 === 0 ? -8 : 8;
    const offsetY = seed % 3 === 0 ? 8 : -8;
    context.fillRect(snappedX + offsetX, snappedY + offsetY, 4, 4);
  }

  private drawFractureNoise(context: CanvasRenderingContext2D, stage: number): void {
    context.fillStyle = `rgba(8, 7, 6, ${0.18 + stage * 0.025})`;
    const chips = 5 + stage * 2;
    for (let i = 0; i < chips; i++) {
      const x = Math.floor(this.stageNoise(stage, i) * 16) * 8;
      const y = Math.floor(this.stageNoise(stage, i + 31) * 16) * 8;
      const size = this.stageNoise(stage, i + 67) > 0.68 ? 8 : 4;
      context.fillRect(x, y, size, size);
    }
  }

  private stageNoise(stage: number, index: number): number {
    const n = Math.sin(stage * 71.17 + index * 23.41) * 43758.5453;
    return n - Math.floor(n);
  }

  private decayLeaves(wx: number, wy: number, wz: number): void {
    const entries: { wx: number; y: number; wz: number; block: Block }[] = [];
    const dropped = new Set<string>();
    for (let dy = -4; dy <= 7; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > 6) continue;
          const lx = wx + dx;
          const ly = wy + dy;
          const lz = wz + dz;
          const block = this.getBlock(lx, ly, lz);
          if (block !== Block.Leaves && block !== Block.BirchLeaves) continue;
          const key = `${lx},${ly},${lz}`;
          if (dropped.has(key)) continue;
          dropped.add(key);
          if (Math.random() < 0.28) {
            entries.push({ wx: lx, y: ly, wz: lz, block: Block.Air });
            const drop = miningDrop(block, 'hand');
            if (drop) {
              this.spawnItemDrop(
                drop.item,
                drop.count,
                new THREE.Vector3(lx + 0.5, ly + 0.65, lz + 0.5),
              );
            }
          }
        }
      }
    }
    if (entries.length > 0) this.setBlocks(entries);
  }

  private triggerWaterFlow(wx: number, wy: number, wz: number): void {
    this.waterSim.activateNeighbors(wx, wy, wz);
  }
}

const FACE_NORMALS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function atlasBoxGeometry(block: Block): THREE.BoxGeometry {
  const isSlab = block === Block.OakSlab || block === Block.OakSlabTop ||
    block === Block.CobblestoneSlab || block === Block.CobblestoneSlabTop;
  const height = isSlab ? 0.5 : 1;
  const geo = new THREE.BoxGeometry(1, height, 1);
  const uvs = geo.attributes.uv.array as Float32Array;
  for (let face = 0; face < 6; face++) {
    const tile = tileForBlockFace(block, FACE_NORMALS[face]);
    const [minU, minV, w, h] = tileRect(tile);
    const base = face * 8;
    for (let v = 0; v < 4; v++) {
      const i = base + v * 2;
      uvs[i] = minU + uvs[i] * w;
      uvs[i + 1] = minV + uvs[i + 1] * h;
    }
  }
  geo.attributes.uv.needsUpdate = true;
  return geo;
}

function stairForYaw(material: 'oak' | 'cobble', yaw: number): Block {
  // Snap yaw to nearest cardinal: 0=-Z, PI/2=-X, ±PI=+Z, -PI/2=+X
  // Higher step faces away from player's look direction
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; // normalize to [-PI, PI]
  if (a >= -Math.PI / 4 && a < Math.PI / 4) {
    // Looking -Z (north): higher step on +Z (south)
    return material === 'oak' ? Block.OakStairsS : Block.CobblestoneStairsS;
  } else if (a >= Math.PI / 4 && a < 3 * Math.PI / 4) {
    // Looking -X (west): higher step on +X (east)
    return material === 'oak' ? Block.OakStairsE : Block.CobblestoneStairsE;
  } else if (a >= -3 * Math.PI / 4 && a < -Math.PI / 4) {
    // Looking +X (east): higher step on -X (west)
    return material === 'oak' ? Block.OakStairsW : Block.CobblestoneStairsW;
  } else {
    // Looking +Z (south): higher step on -Z (north)
    return material === 'oak' ? Block.OakStairsN : Block.CobblestoneStairsN;
  }
}
