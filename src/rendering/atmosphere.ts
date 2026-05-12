import * as THREE from 'three';
import { terrainHeight } from '../terrain';
import { getFarRadius, getFogFar, getFogNear } from '../player/renderDistance';
import { Block, CHUNK_SIZE, WORLD_HEIGHT } from '../types';
import type { FarTerrainSystem } from './farTerrain';

export function applyRenderDistance(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  farTerrain: FarTerrainSystem,
  player: { position: THREE.Vector3 },
  seed: number,
  submergeFactor: number,
  caveFactor: number,
): void {
  const airFogNear = getFogNear();
  const airFogFar = getFogFar();
  camera.far = getFarRadius() * CHUNK_SIZE;
  camera.updateProjectionMatrix();
  if (scene.fog instanceof THREE.Fog && caveFactor < 0.005 && submergeFactor < 0.005) {
    scene.fog.near = airFogNear;
    scene.fog.far = airFogFar;
  }
  const pcx = Math.floor(player.position.x / CHUNK_SIZE);
  const pcz = Math.floor(player.position.z / CHUNK_SIZE);
  farTerrain.rebuild(pcx, pcz, seed, getFarRadius());
}

export function updateCaveFactor(
  dt: number,
  worldReady: boolean,
  player: { position: THREE.Vector3; eye: number },
  getBlock: (wx: number, y: number, wz: number) => Block,
  seed: number,
): number {
  if (!worldReady) return NaN;
  const px = Math.floor(player.position.x);
  const pz = Math.floor(player.position.z);
  const eyeY = player.position.y + player.eye;
  const surfaceH = terrainHeight(px, pz, seed);
  const depth = surfaceH - eyeY;
  if (depth < 4) {
    return 0;
  }
  let overheadSolid = 0;
  let overheadChecked = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      overheadChecked++;
      for (let y = Math.floor(eyeY) + 1; y <= Math.min(surfaceH, WORLD_HEIGHT - 1); y++) {
        if (getBlock(px + dx, y, pz + dz) !== Block.Air) {
          overheadSolid++;
          break;
        }
      }
    }
  }
  const overheadRatio = overheadChecked > 0 ? overheadSolid / overheadChecked : 0;
  return Math.min(1, (depth - 4) / 20) * Math.min(1, overheadRatio * 2);
}

export function applyUnderwaterEffects(
  dt: number,
  worldReady: boolean,
  scene: THREE.Scene,
  player: { position: THREE.Vector3; eye: number; height: number },
  getBlock: (wx: number, y: number, wz: number) => Block,
  submergeFactor: number,
  caveFactor: number,
  waterOverlayEl: HTMLElement,
): number {
  if (!worldReady) return 0;
  const eyeY = player.position.y + player.eye;
  const eyeInWater =
    getBlock(Math.floor(player.position.x), Math.floor(eyeY), Math.floor(player.position.z)) ===
    Block.Water;
  const headInWater =
    getBlock(
      Math.floor(player.position.x),
      Math.floor(player.position.y + player.height - 0.1),
      Math.floor(player.position.z),
    ) === Block.Water;
  const target = eyeInWater || headInWater ? 1 : 0;
  const newSubmerge = (submergeFactor + (target - submergeFactor) * Math.min(1, dt * 5));
  if (newSubmerge < 0.002) { waterOverlayEl.classList.remove('submerged'); return 0; }

  const airFogNear = getFogNear();
  const airFogFar = getFogFar();
  const airFogColor = new THREE.Color(0xd8e8f1);
  const waterFogColor = new THREE.Color(0x061a30);
  const caveFogColor = new THREE.Color(0x080810);
  const airBgColor = new THREE.Color(0xd8e8f1);
  const waterBgColor = new THREE.Color(0x061a30);
  const caveBgColor = new THREE.Color(0x080810);

  const dominant = newSubmerge > caveFactor ? 'water' : 'cave';
  const dominantFactor = Math.max(newSubmerge, caveFactor);

  if (dominantFactor > 0.005) {
    if (scene.fog instanceof THREE.Fog) {
      if (dominant === 'water') {
        const blended = THREE.MathUtils.lerp(
          caveFogColor.getHex(), waterFogColor.getHex(),
          newSubmerge > caveFactor ? 1 : caveFactor / newSubmerge,
        );
        scene.fog.color.setHex(blended);
        scene.fog.color.lerp(airFogColor, 1 - dominantFactor);
        scene.fog.near = THREE.MathUtils.lerp(airFogNear, 4, newSubmerge);
        scene.fog.far = THREE.MathUtils.lerp(airFogFar, 16, newSubmerge);
      } else {
        scene.fog.color.copy(caveFogColor).lerp(airFogColor, 1 - caveFactor);
        scene.fog.near = THREE.MathUtils.lerp(airFogNear, 8, caveFactor);
        scene.fog.far = THREE.MathUtils.lerp(airFogFar, 48, caveFactor);
      }
    }
    if (dominant === 'water') {
      (scene.background as THREE.Color).copy(airBgColor).lerp(waterBgColor, newSubmerge);
    } else {
      (scene.background as THREE.Color).copy(airBgColor).lerp(caveBgColor, caveFactor);
    }
    waterOverlayEl.classList.toggle('submerged', newSubmerge > 0.25);
  } else {
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(airFogColor);
      scene.fog.near = airFogNear;
      scene.fog.far = airFogFar;
    }
    scene.background = new THREE.Color(0xd8e8f1);
    waterOverlayEl.classList.remove('submerged');
  }
  return newSubmerge;
}
