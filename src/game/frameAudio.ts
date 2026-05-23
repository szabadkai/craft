import * as THREE from 'three';
import type { SfxSystem } from '../audio/sfx';
import { blockMaterial } from '../audio/sfx';
import type { PlayerState } from '../player/playerController';
import type { Block } from '../types';

type FrameAudioOptions = {
  player: PlayerState;
  sfx: SfxSystem;
  getBlock: (wx: number, y: number, wz: number) => Block;
};

export function createFrameAudio(options: FrameAudioOptions): (now: number) => void {
  let prevOnGround = false;
  let prevInWater = false;
  let lastFootstepTime = 0;
  const lastFootstepPos = new THREE.Vector3();

  return (now: number): void => {
    const { player, sfx, getBlock } = options;
    if (player.onGround && !prevOnGround) {
      const fallSpeed = Math.abs(player.velocity.y);
      sfx.land(fallSpeed > 6);
    }
    if (!player.onGround && prevOnGround && player.velocity.y > 0) {
      sfx.jump();
    }
    if (player.inWater && !prevInWater) sfx.splash();
    if (player.onGround && !player.inWater) {
      const hDist = Math.hypot(player.position.x - lastFootstepPos.x, player.position.z - lastFootstepPos.z);
      if (hDist > 1.6 && now - lastFootstepTime > 300) {
        const bx = Math.floor(player.position.x);
        const by = Math.floor(player.position.y) - 1;
        const bz = Math.floor(player.position.z);
        sfx.footstep(blockMaterial(getBlock(bx, by, bz)));
        lastFootstepTime = now;
        lastFootstepPos.copy(player.position);
      }
    }
    prevOnGround = player.onGround;
    prevInWater = player.inWater;
  };
}
