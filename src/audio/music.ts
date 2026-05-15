type Track = { file: string; title: string; artist: string };

const TRACKS: Track[] = [
  { file: '/music/lofi/a-cup-of-tea.mp3', title: 'A Cup of Tea', artist: 'TAD' },
  { file: '/music/lofi/cue.mp3', title: 'Cue', artist: 'TAD' },
  { file: '/music/lofi/bartender.mp3', title: 'Bartender', artist: 'TAD' },
  { file: '/music/lofi/cat-caffe.mp3', title: 'Cat Caffe', artist: 'TAD' },
  { file: '/music/lofi/rainy-forest.mp3', title: 'Rainy Forest', artist: 'TAD' },
  { file: '/music/lofi/countryside.mp3', title: 'Countryside', artist: 'TAD' },
  { file: '/music/lofi/oceanside.mp3', title: 'Oceanside', artist: 'TAD' },
  { file: '/music/lofi/florist.mp3', title: 'Florist', artist: 'TAD' },
  { file: '/music/lofi/morning-rain.mp3', title: 'Morning Rain', artist: 'TAD' },
  { file: '/music/exploration/lvl_0_the_tutorial.mp3', title: 'The Tutorial', artist: 'YannZ' },
  { file: '/music/exploration/lvl_1_the_royal_palace.mp3', title: 'The Royal Palace', artist: 'YannZ' },
  { file: '/music/exploration/lvl_2_the_village.mp3', title: 'The Village', artist: 'YannZ' },
  { file: '/music/exploration/lvl_3_the_grassland.mp3', title: 'The Grassland', artist: 'YannZ' },
  { file: '/music/exploration/lvl_4_the_desert.mp3', title: 'The Desert', artist: 'YannZ' },
  { file: '/music/exploration/lvl_5_the_oasis_or_resting_place.mp3', title: 'The Oasis', artist: 'YannZ' },
  { file: '/music/exploration/lvl_6_the_beach.mp3', title: 'The Beach', artist: 'YannZ' },
  { file: '/music/exploration/lvl_7_the_raft_on_the_ocean.mp3', title: 'The Raft on the Ocean', artist: 'YannZ' },
  { file: '/music/exploration/lvl_8_the_volcanic_sea_shore.mp3', title: 'The Volcanic Sea Shore', artist: 'YannZ' },
  { file: '/music/exploration/lvl_9_the_volcanic_ascent.mp3', title: 'The Volcanic Ascent', artist: 'YannZ' },
  { file: '/music/fantasy/ravi_de_te_revoir_main_menu_ost.mp3', title: 'Ravi de te Revoir', artist: 'YannZ' },
  { file: '/music/fantasy/deja_vus_in-game_ost_loop.mp3', title: 'Deja Vus', artist: 'YannZ' },
  { file: '/music/fantasy/deja_vus_1st_loop.mp3', title: 'Deja Vus I', artist: 'YannZ' },
  { file: '/music/fantasy/deja_vus_2nd_loop.mp3', title: 'Deja Vus II', artist: 'YannZ' },
  { file: '/music/fantasy/deja_vus_3rd_loop.mp3', title: 'Deja Vus III', artist: 'YannZ' },
];

export type MusicSystem = {
  play(): void;
  pause(): void;
  next(): void;
  isPlaying(): boolean;
  currentTrack(): string | null;
  tick(dt: number): void;
};

export function createMusicSystem(ctx: AudioContext, destination: GainNode): MusicSystem {
  let playlist = shuffle([...TRACKS]);
  let index = 0;
  let playing = false;
  let activeSource: AudioBufferSourceNode | null = null;
  let activeGain: GainNode | null = null;
  let activeBuffer: AudioBuffer | null = null;
  let trackStartTime = 0;
  let nextBuffer: AudioBuffer | null = null;
  let crossfading = false;

  const CROSSFADE = 3;

  async function loadTrack(track: Track): Promise<AudioBuffer> {
    const res = await fetch(track.file);
    const data = await res.arrayBuffer();
    return ctx.decodeAudioData(data);
  }

  function preloadNext(): void {
    const nextIdx = (index + 1) % playlist.length;
    loadTrack(playlist[nextIdx]).then((buf) => {
      nextBuffer = buf;
    }).catch(() => {});
  }

  function startTrack(buffer: AudioBuffer): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    gain.connect(destination);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(0);

    source.onended = () => {
      if (source === activeSource) {
        advanceTrack();
      }
    };

    activeSource = source;
    activeGain = gain;
    activeBuffer = buffer;
    trackStartTime = ctx.currentTime;
    crossfading = false;
  }

  function advanceTrack(): void {
    index = (index + 1) % playlist.length;
    if (index === 0) playlist = shuffle([...TRACKS]);

    if (nextBuffer) {
      startTrack(nextBuffer);
      nextBuffer = null;
      preloadNext();
    } else {
      loadTrack(playlist[index]).then((buf) => {
        if (playing) {
          startTrack(buf);
          preloadNext();
        }
      }).catch(() => {});
    }
  }

  function stopCurrent(): void {
    if (activeSource) {
      try { activeSource.stop(); } catch {}
      activeSource.disconnect();
      activeSource = null;
    }
    if (activeGain) {
      activeGain.disconnect();
      activeGain = null;
    }
    activeBuffer = null;
  }

  return {
    play(): void {
      if (playing) return;
      playing = true;
      loadTrack(playlist[index]).then((buf) => {
        if (playing) {
          startTrack(buf);
          preloadNext();
        }
      }).catch(() => {});
    },

    pause(): void {
      playing = false;
      stopCurrent();
    },

    next(): void {
      stopCurrent();
      crossfading = false;
      advanceTrack();
    },

    isPlaying: () => playing,

    currentTrack(): string | null {
      if (!playing) return null;
      const t = playlist[index];
      return t ? `${t.title} — ${t.artist}` : null;
    },

    tick(_dt: number): void {
      if (!playing || !activeBuffer || !activeGain || crossfading) return;
      const elapsed = ctx.currentTime - trackStartTime;
      const remaining = activeBuffer.duration - elapsed;
      if (remaining < CROSSFADE && remaining > 0) {
        crossfading = true;
        activeGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + CROSSFADE);
        advanceTrack();
      }
    },
  };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
