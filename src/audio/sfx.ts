import { Block } from '../types';

export type BlockMaterial = 'stone' | 'wood' | 'dirt' | 'sand' | 'leaf' | 'glass' | 'metal';

export type SfxSystem = {
  miningTick(material: BlockMaterial): void;
  blockPlace(): void;
  blockBreak(material: BlockMaterial): void;
  footstep(surface: BlockMaterial): void;
  jump(): void;
  land(hard: boolean): void;
  splash(): void;
  itemPickup(): void;
  eating(): void;
  eatComplete(): void;
  playerHurt(): void;
  playerDeath(): void;
  mobHit(): void;
  mobDeath(): void;
  doorToggle(opening: boolean): void;
  chestOpen(): void;
  chestClose(): void;
  hotbarSelect(): void;
  uiClick(): void;
};

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noise(ctx: AudioContext, buffer: AudioBuffer, duration: number, dest: AudioNode, volume = 0.3): AudioBufferSourceNode {
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.connect(gain).connect(dest);
  src.start(now);
  src.stop(now + duration + 0.01);
  return src;
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function blockMaterial(block: Block): BlockMaterial {
  switch (block) {
    case Block.Stone:
    case Block.CoalOre:
    case Block.IronOre:
    case Block.CopperOre:
    case Block.GoldOre:
    case Block.DiamondOre:
    case Block.Cobblestone:
    case Block.MossyCobblestone:
    case Block.Brick:
    case Block.Furnace:
    case Block.CobblestoneSlab:
    case Block.CobblestoneSlabTop:
    case Block.CobblestoneStairsN:
    case Block.CobblestoneStairsS:
    case Block.CobblestoneStairsE:
    case Block.CobblestoneStairsW:
      return 'stone';
    case Block.Log:
    case Block.BirchLog:
    case Block.LogX:
    case Block.LogZ:
    case Block.BirchLogX:
    case Block.BirchLogZ:
    case Block.Planks:
    case Block.CraftingTable:
    case Block.OakDoor:
    case Block.OakDoorOpen:
    case Block.OakSlab:
    case Block.OakSlabTop:
    case Block.OakStairsN:
    case Block.OakStairsS:
    case Block.OakStairsE:
    case Block.OakStairsW:
    case Block.Chest:
      return 'wood';
    case Block.Grass:
    case Block.Dirt:
    case Block.Clay:
      return 'dirt';
    case Block.Sand:
    case Block.Gravel:
    case Block.Snow:
      return 'sand';
    case Block.Glass:
      return 'glass';
    case Block.Leaves:
    case Block.BirchLeaves:
    case Block.TallGrass:
    case Block.RedFlower:
    case Block.YellowFlower:
    case Block.BlueFlower:
    case Block.Mushroom:
    case Block.BerryBush:
    case Block.Cactus:
      return 'leaf';
    default:
      return 'stone';
  }
}

export function createSfxSystem(ctx: AudioContext, destination: GainNode): SfxSystem {
  const noiseBuffer = createNoiseBuffer(ctx, 2);

  function filteredNoise(freq: number, q: number, duration: number, volume: number, type: BiquadFilterType = 'bandpass'): void {
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq * rnd(0.9, 1.1);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter).connect(gain).connect(destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  function tone(freq: number, endFreq: number, duration: number, volume: number, type: OscillatorType = 'sine', lpFreq?: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    if (lpFreq) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lpFreq;
      osc.connect(lp).connect(gain).connect(destination);
    } else {
      osc.connect(gain).connect(destination);
    }
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  const materialFreqs: Record<BlockMaterial, number> = {
    stone: 600,
    wood: 300,
    dirt: 200,
    sand: 250,
    leaf: 400,
    glass: 1200,
    metal: 800,
  };

  return {
    miningTick(material: BlockMaterial): void {
      const freq = materialFreqs[material];
      filteredNoise(freq, 2, rnd(0.03, 0.06), rnd(0.15, 0.25));
      if (material === 'stone' || material === 'metal') {
        tone(freq * 1.5, freq * 0.8, 0.04, 0.06, 'triangle', 1500);
      }
    },

    blockPlace(): void {
      tone(220, 120, 0.08, 0.2, 'sine', 1200);
      filteredNoise(800, 1, 0.02, 0.15);
    },

    blockBreak(material: BlockMaterial): void {
      const freq = materialFreqs[material];
      filteredNoise(freq, 1.5, rnd(0.15, 0.25), 0.3);
      tone(400, 100, 0.15, 0.12, 'triangle', 1500);
      if (material === 'glass') {
        filteredNoise(3000, 3, 0.2, 0.25);
        filteredNoise(5000, 2, 0.15, 0.15);
      }
    },

    footstep(surface: BlockMaterial): void {
      const freqs: Record<BlockMaterial, [number, number]> = {
        stone: [1200, 4],
        wood: [800, 2],
        dirt: [400, 1],
        sand: [600, 1.5],
        leaf: [500, 1],
        glass: [1200, 4],
        metal: [1000, 3],
      };
      const [f, q] = freqs[surface] ?? [600, 1.5];
      filteredNoise(f, q, rnd(0.02, 0.04), rnd(0.08, 0.14));
    },

    jump(): void {
      tone(200, 400, 0.1, 0.08, 'sine', 2000);
    },

    land(hard: boolean): void {
      filteredNoise(200, 1, 0.04, hard ? 0.35 : 0.15, 'lowpass');
      if (hard) {
        tone(100, 50, 0.2, 0.2, 'sine', 400);
      }
    },

    splash(): void {
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400;
      bp.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      src.connect(bp).connect(gain).connect(destination);
      src.start(now);
      src.stop(now + 0.35);
      tone(120, 60, 0.15, 0.1, 'sine', 300);
    },

    itemPickup(): void {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(784, now + 0.06);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.setValueAtTime(0.15, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      osc.connect(lp).connect(gain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.16);
    },

    eating(): void {
      for (let i = 0; i < 5; i++) {
        const delay = i * 0.18;
        const now = ctx.currentTime + delay;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 500 * rnd(0.85, 1.15);
        bp.Q.value = 1.5;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        src.connect(bp).connect(gain).connect(destination);
        src.start(now);
        src.stop(now + 0.05);
      }
    },

    eatComplete(): void {
      tone(300, 150, 0.15, 0.15, 'sine', 1000);
      filteredNoise(600, 1, 0.08, 0.1);
    },

    playerHurt(): void {
      tone(400, 200, 0.1, 0.25, 'sine', 2000);
      filteredNoise(1000, 2, 0.06, 0.2);
    },

    playerDeath(): void {
      const notes = [440, 370, 311];
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.25;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1500;
        osc.connect(lp).connect(gain).connect(destination);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    },

    mobHit(): void {
      filteredNoise(800, 2.5, 0.06, 0.2);
      tone(300, 150, 0.05, 0.1, 'triangle', 1200);
    },

    mobDeath(): void {
      tone(350, 310, 0.15, 0.15, 'triangle', 1200);
      tone(310, 260, 0.2, 0.12, 'triangle', 1000);
    },

    doorToggle(opening: boolean): void {
      const [from, to] = opening ? [80, 200] : [200, 80];
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + 0.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(lp).connect(gain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.28);
    },

    chestOpen(): void {
      filteredNoise(2000, 3, 0.01, 0.12);
      tone(150, 200, 0.06, 0.1, 'sine', 800);
    },

    chestClose(): void {
      filteredNoise(2000, 3, 0.01, 0.12);
      tone(200, 120, 0.06, 0.1, 'sine', 800);
    },

    hotbarSelect(): void {
      tone(1000, 800, 0.015, 0.06, 'sine', 3000);
    },

    uiClick(): void {
      tone(800, 600, 0.025, 0.08, 'sine', 2500);
    },
  };
}
