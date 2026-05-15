export type AudioEngine = {
  ctx: AudioContext;
  masterGain: GainNode;
  sfxGain: GainNode;
  musicGain: GainNode;
  ambientGain: GainNode;
  resume(): void;
  setMasterVolume(v: number): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  getMasterVolume(): number;
  getSfxVolume(): number;
  getMusicVolume(): number;
  isMuted(): boolean;
  toggleMute(): boolean;
};

export function createAudioEngine(): AudioEngine {
  const ctx = new AudioContext();

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  const sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);

  const musicGain = ctx.createGain();
  musicGain.connect(masterGain);

  const ambientGain = ctx.createGain();
  ambientGain.connect(masterGain);

  let muted = localStorage.getItem('craft-audio-muted') === 'true';
  let masterVol = 1;
  const sfxVol = parseFloat(localStorage.getItem('craft-audio-sfx-vol') ?? '1');
  const musicVol = parseFloat(localStorage.getItem('craft-audio-music-vol') ?? '0.5');

  sfxGain.gain.value = sfxVol;
  musicGain.gain.value = musicVol;
  ambientGain.gain.value = sfxVol;
  masterGain.gain.value = muted ? 0 : masterVol;

  function resume(): void {
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMasterVolume(v: number): void {
    masterVol = Math.max(0, Math.min(1, v));
    if (!muted) masterGain.gain.value = masterVol;
  }

  function setSfxVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    sfxGain.gain.value = clamped;
    ambientGain.gain.value = clamped;
    localStorage.setItem('craft-audio-sfx-vol', String(clamped));
  }

  function setMusicVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    musicGain.gain.value = clamped;
    localStorage.setItem('craft-audio-music-vol', String(clamped));
  }

  function toggleMute(): boolean {
    muted = !muted;
    masterGain.gain.value = muted ? 0 : masterVol;
    localStorage.setItem('craft-audio-muted', String(muted));
    return muted;
  }

  return {
    ctx,
    masterGain,
    sfxGain,
    musicGain,
    ambientGain,
    resume,
    setMasterVolume,
    setSfxVolume,
    setMusicVolume,
    getMasterVolume: () => masterVol,
    getSfxVolume: () => sfxGain.gain.value,
    getMusicVolume: () => musicGain.gain.value,
    isMuted: () => muted,
    toggleMute,
  };
}
