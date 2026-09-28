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
};

type Listener = (s: PlayerState) => void;

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let routed = false;
const listeners = new Set<Listener>();
const state: PlayerState = { source: null, status: 'idle', message: null, time: 0, duration: 0 };

const emit = () => listeners.forEach((fn) => fn(state));
const set = (patch: Partial<PlayerState>) => {
  Object.assign(state, patch);
  emit();
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
  el.addEventListener('ended', () => set({ status: 'paused', time: 0 }));
  audio = el;
  routed = false;
  return el;
}

/** Routes audio through an analyser for real spectrum data. Needs CORS on the source. */
function route(el: HTMLAudioElement) {
  if (routed || !el.crossOrigin) return;
  try {
    ctx ??= new AudioContext();
    analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: 256, smoothingTimeConstant: 0.8 });
    ctx.createMediaElementSource(el).connect(analyser);
    analyser.connect(ctx.destination);
    routed = true;
  } catch {
    analyser = null;
  }
}

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
  set({ status: 'error', message: 'could not reach the stream' });
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
  stop() {
    audio?.pause();
    set({ source: null, status: 'idle', message: null, time: 0, duration: 0 });
  },
  seek(fraction: number) {
    if (audio && state.duration) audio.currentTime = fraction * state.duration;
  },
  /** Fills `out` with frequency data. Returns false when there is no real signal to read. */
  spectrum(out: Uint8Array): boolean {
    if (!analyser || state.status !== 'playing') return false;
    analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>);
    return true;
  },
  get audioContext() {
    return ctx;
  },
};
