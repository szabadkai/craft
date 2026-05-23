export type AmbientSystem = {
  tick(dt: number, underwaterFactor: number, caveFactor: number, furnaceBurning: boolean): void;
};

function createReverbImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

function createCrackleBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 2;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = 0;
  }
  const numPops = 20 + Math.floor(Math.random() * 15);
  for (let p = 0; p < numPops; p++) {
    const pos = Math.floor(Math.random() * (length - 800));
    const amp = 0.1 + Math.random() * 0.3;
    const popLen = 30 + Math.floor(Math.random() * 60);
    for (let i = 0; i < popLen && pos + i < length; i++) {
      data[pos + i] = (Math.random() * 2 - 1) * amp * (1 - i / popLen);
    }
  }
  return buffer;
}

export function createAmbientSystem(ctx: AudioContext, destination: GainNode): AmbientSystem {
  const underwaterFilter = ctx.createBiquadFilter();
  underwaterFilter.type = 'lowpass';
  underwaterFilter.frequency.value = 20000;
  underwaterFilter.Q.value = 0.5;

  const reverb = ctx.createConvolver();
  reverb.buffer = createReverbImpulse(ctx, 2.5, 2.5);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;
  reverb.connect(reverbGain).connect(destination);

  const dronOsc = ctx.createOscillator();
  dronOsc.type = 'triangle';
  dronOsc.frequency.value = 40;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = 'lowpass';
  droneLp.frequency.value = 80;
  dronOsc.connect(droneLp).connect(droneGain).connect(destination);
  dronOsc.start();

  const crackleBuffer = createCrackleBuffer(ctx);
  let crackleSource: AudioBufferSourceNode | null = null;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0;
  const crackleLp = ctx.createBiquadFilter();
  crackleLp.type = 'lowpass';
  crackleLp.frequency.value = 2000;
  crackleGain.connect(crackleLp).connect(destination);
  let crackleActive = false;

  function startCrackle(): void {
    if (crackleActive) return;
    crackleActive = true;
    const src = ctx.createBufferSource();
    src.buffer = crackleBuffer;
    src.loop = true;
    src.connect(crackleGain);
    src.start();
    crackleSource = src;
  }

  function stopCrackle(): void {
    if (!crackleActive || !crackleSource) return;
    crackleActive = false;
    try { crackleSource.stop(); } catch {
      // Source may already be stopped by the Web Audio runtime.
    }
    crackleSource.disconnect();
    crackleSource = null;
  }

  let currentUnderwater = 0;
  let currentCave = 0;

  return {
    tick(dt: number, underwaterFactor: number, caveFactor: number, furnaceBurning: boolean): void {
      const speed = Math.min(1, dt * 3);

      currentUnderwater += (underwaterFactor - currentUnderwater) * speed;
      const filterFreq = 20000 * Math.pow(400 / 20000, Math.min(currentUnderwater, 1));
      underwaterFilter.frequency.value = filterFreq;

      currentCave += (caveFactor - currentCave) * speed;
      reverbGain.gain.value = Math.min(currentCave * 0.4, 0.4);
      droneGain.gain.value = Math.min(currentCave * 0.03, 0.03);

      if (furnaceBurning) {
        startCrackle();
        crackleGain.gain.value = Math.min(crackleGain.gain.value + dt * 2, 0.15);
      } else {
        crackleGain.gain.value = Math.max(crackleGain.gain.value - dt * 2, 0);
        if (crackleGain.gain.value <= 0.001) stopCrackle();
      }
    },
  };
}
