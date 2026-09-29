/**
 * One audio element for the whole site. It is created once and never touched by the router,
 * so a stream keeps playing while the visitor moves between pages.
 */
export type Source = { kind: 'live' | 'mix'; id: string; title: string; url: string | null };
export type PlayerState = {
  source: Source | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  message: string | null;
  time: number;
  duration: number;
  /** 0…1, remembered on this device */
  volume: number;
};

type Listener = (s: PlayerState) => void;

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let gain: GainNode | null = null;
let routed = false;
const listeners = new Set<Listener>();

function storedVolume() {
  try {
    const v = parseFloat(localStorage.getItem('volume') ?? '');
    return v >= 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}

const state: PlayerState = { source: null, status: 'idle', message: null, time: 0, duration: 0, volume: storedVolume() };

const emit = () => listeners.forEach((fn) => fn(state));
const set = (patch: Partial<PlayerState>) => {
  Object.assign(state, patch);
  emit();
};

/** Routed through Web Audio, the gain sets the volume (the element stays at full); otherwise the element does. */
function applyVolume() {
  if (gain) gain.gain.value = state.volume;
  if (audio) audio.volume = routed ? 1 : state.volume;
}

const idle = () => {
  audio?.pause();
  set({ source: null, status: 'idle', message: null, time: 0, duration: 0 });
};

function createAudio(cors: boolean) {
  audio?.pause();
  const el = new Audio();
  el.preload = 'none';
  if (cors) el.crossOrigin = 'anonymous';
  el.addEventListener('playing', () => set({ status: 'playing', message: null }));
  el.addEventListener('pause', () => state.status === 'playing' && set({ status: 'paused' }));
  el.addEventListener('waiting', () => set({ status: 'loading' }));
  el.addEventListener('timeupdate', () => set({ time: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0 }));
  // a live stream that ends (the set is over, the connection dropped) is gone, not paused
  el.addEventListener('ended', () => (state.source?.kind === 'live' ? idle() : set({ status: 'paused', time: 0 })));
  el.addEventListener('error', () => el === audio && state.source?.kind === 'live' && state.status === 'playing' && idle());
  audio = el;
  routed = false;
  applyVolume();
  return el;
}

/** Routes audio through an analyser (real spectrum data) and a gain (volume). Needs CORS on the source. */
function route(el: HTMLAudioElement) {
  if (routed || !el.crossOrigin) return;
  try {
    ctx ??= new AudioContext();
    if (!analyser || !gain) {
      analyser = Object.assign(ctx.createAnalyser(), { fftSize: 256, smoothingTimeConstant: 0.8 });
      gain = ctx.createGain();
      analyser.connect(gain).connect(ctx.destination);
    }
    ctx.createMediaElementSource(el).connect(analyser);
    routed = true;
    applyVolume();
  } catch {
    analyser = null;
    gain = null;
  }
}

let elementVolume: boolean | null = null;

async function start(source: Source) {
  if (!source.url) {
    set({ source, status: 'error', message: 'stream not connected yet' });
    return;
  }
  set({ source, status: 'loading', message: null, time: 0, duration: 0 });
  // Try with CORS (enables the analyser). If the host refuses, fall back to plain playback.
  for (const cors of [true, false]) {
    const el = createAudio(cors);
    el.src = source.url;
    try {
      route(el);
      await ctx?.resume();
      await el.play();
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') break;
    }
  }
  set({ status: 'error', message: source.kind === 'mix' ? 'could not load this mix' : 'could not reach the stream' });
}

export const player = {
  state: () => state,
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  play: start,
  toggle() {
    if (!audio || !state.source) return;
    if (state.status === 'playing' || state.status === 'loading') audio.pause();
    else {
      ctx?.resume();
      // A live stream resumes at the live edge rather than where it was paused.
      if (state.source.kind === 'live' && state.source.url) audio.src = state.source.url;
      audio.play().catch(() => set({ status: 'error', message: 'playback blocked' }));
    }
  },
  stop: idle,
  setVolume(v: number) {
    const volume = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem('volume', String(volume));
    } catch {
      /* still applies, just not remembered */
    }
    set({ volume });
    applyVolume();
  },
  /** iOS ignores `volume` on media elements; there only the Web Audio route (a stream with CORS) can change it. */
  volumeWorks(): boolean {
    if (routed) return true;
    if (elementVolume === null) {
      const probe = new Audio();
      probe.volume = 0.5;
      elementVolume = probe.volume === 0.5;
    }
    return elementVolume;
  },
  seek(fraction: number) {
    if (audio && state.duration) audio.currentTime = fraction * state.duration;
  },
  /** Fills `out` with frequency data. Returns false when there is no real signal to read. */
  spectrum(out: Uint8Array): boolean {
    // Only the element that is playing now counts: after a fallback to plain playback (no CORS)
    // the analyser still exists but hears nothing.
    if (!analyser || !routed || state.status !== 'playing') return false;
    analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    // a browser that routes the stream yet hands the analyser silence: the stand-in instead
    return out.some((v) => v > 0);
  },
  get audioContext() {
    return ctx;
  },
};
