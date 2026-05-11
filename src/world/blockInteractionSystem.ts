import * as THREE from 'three';
import { blockColor } from '../blocks';
import { InventorySystem } from '../inventory/inventorySystem';
import { blockToItem } from '../inventory/items';
import { PlayerState } from '../player/playerController';
import { Block } from '../types';
import { BlockHit, BlockRaycaster } from './blockRaycaster';

export class BlockInteractionSystem {
  private readonly highlight: THREE.Mesh;
  private readonly placePreview: THREE.Mesh;
  private readonly placePreviewMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
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
  ) {
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    this.highlight = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), highlightMaterial);
    this.highlight.visible = false;
    scene.add(this.highlight);

    this.placePreview = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.placePreviewMaterial);
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

  place(hit: BlockHit): void {
    this.stopMining();
    const block = this.inventory.selectedPlaceBlock();
    if (block === null) {
      this.triggerSwing('place');
      return;
    }
    const item = this.inventory.selectedPlaceItem();
    if (item && this.inventory.itemCount(item) <= 0) return;
    const place = hit.block.clone().add(hit.normal);
    if (this.getBlock(place.x, place.y, place.z) !== Block.Air || this.wouldIntersectPlayer(place))
      return;
    this.setBlock(place.x, place.y, place.z, block);
    this.triggerSwing('place');
    if (item) this.inventory.addItem(item, -1);
  }

  startMining(hit: BlockHit): void {
    if (this.inventory.isOpen) return;
    this.mining.active = true;
    this.mining.block.copy(hit.block);
    this.mining.startedAt = performance.now();
    this.mining.lastSwingAt = this.mining.startedAt;
    this.mining.duration = this.blockHardness(this.getBlock(hit.block.x, hit.block.y, hit.block.z));
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
      this.inventory.addItem(blockToItem(block), 1);
      this.setBlock(this.mining.block.x, this.mining.block.y, this.mining.block.z, Block.Air);
      this.stopMining();
    }
  }

  private updatePlacePreview(hit: BlockHit): void {
    const block = this.inventory.selectedPlaceBlock();
    if (block === null) return;
    const item = this.inventory.selectedPlaceItem();
    if (item && this.inventory.itemCount(item) <= 0) return;

    const place = hit.block.clone().add(hit.normal);
    if (this.getBlock(place.x, place.y, place.z) !== Block.Air) return;
    if (this.wouldIntersectPlayer(place)) return;

    const [r, g, b] = blockColor(block);
    this.placePreviewMaterial.color.setRGB(r, g, b);
    this.placePreview.position.set(place.x + 0.5, place.y + 0.5, place.z + 0.5);
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

  private blockHardness(block: Block): number {
    const tool = this.inventory.selectedTool();
    switch (block) {
      case Block.Grass:
      case Block.Dirt:
      case Block.Sand:
      case Block.Snow:
        return 260;
      case Block.Leaves:
      case Block.BirchLeaves:
        return 180;
      case Block.Log:
      case Block.BirchLog:
      case Block.Planks:
      case Block.CraftingTable:
        return 520;
      case Block.Cactus:
      case Block.Pumpkin:
        return 360;
      case Block.Glass:
        return 300;
      case Block.Stone:
      case Block.CoalOre:
      case Block.CopperOre:
      case Block.Furnace:
      case Block.Cobblestone:
      case Block.MossyCobblestone:
      case Block.Brick:
        return tool?.tool === 'stone_pickaxe' || tool?.tool === 'wood_pickaxe' ? 650 : 1100;
      case Block.IronOre:
        return tool?.tool === 'stone_pickaxe' ? 850 : 1500;
      case Block.GoldOre:
        return tool?.tool === 'stone_pickaxe' ? 1000 : 1700;
      case Block.DiamondOre:
        return tool?.tool === 'stone_pickaxe' ? 1300 : 2200;
      default:
        return 450;
    }
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
}
