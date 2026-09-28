/** Live Spotify state for the public pages. The server holds every token; this only reads /api/spotify/*. */
export type Track = {
  name: string;
  artists: string;
  album: string;
  artwork: string | null;
  thumb: string | null;
  url: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  playedAt: string | null;
};
export type Now = { state: 'playing' | 'paused' | 'recent' | 'idle' | 'unconfigured' | 'disconnected' | 'error' | 'loading'; track: Track | null };

type Listener = (n: Now, receivedAt: number) => void;
const listeners = new Set<Listener>();
let current: Now = { state: 'loading', track: null };
let receivedAt = 0;
let started = false;

export const spotify = {
  get: () => current,
  /** Progress right now, extrapolated from the last poll while playing. */
  progress(): number {
    const t = current.track;
    if (!t) return 0;
    if (current.state !== 'playing') return t.progressMs;
    return Math.min(t.durationMs, t.progressMs + (Date.now() - receivedAt));
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(current, receivedAt);
    start();
    return () => listeners.delete(fn);
  },
};

let timer = 0;
async function poll() {
  clearTimeout(timer);
  let next: Now;
  try {
    const res = await fetch('/api/spotify/now', { cache: 'no-store' });
    next = res.ok ? await res.json() : { state: 'error', track: null };
  } catch {
    next = { state: 'error', track: null };
  }
  // keep showing the last good track through a transient error
  if (next.state === 'error' && current.track) next = { ...current };
  current = next;
  receivedAt = Date.now();
  listeners.forEach((fn) => fn(current, receivedAt));
  // poll sooner when a song is about to end, otherwise every 20s
  let wait = 20_000;
  if (current.state === 'playing' && current.track) wait = Math.max(3_000, Math.min(wait, current.track.durationMs - current.track.progressMs + 1_500));
  if (document.visibilityState === 'visible') timer = window.setTimeout(poll, wait);
}

function start() {
  if (started) return;
  started = true;
  poll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
    else clearTimeout(timer);
  });
  // Phones can bring a page back (from the tab switcher or back/forward cache) without a visibility change,
  // and can drop a pending timer while asleep: refresh whenever the page is shown again and the data has aged.
  const refreshIfStale = () => document.visibilityState === 'visible' && Date.now() - receivedAt > 10_000 && poll();
  window.addEventListener('pageshow', refreshIfStale);
  window.addEventListener('focus', refreshIfStale);
  window.addEventListener('online', refreshIfStale);
  setInterval(() => Date.now() - receivedAt > 30_000 && refreshIfStale(), 5_000);
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ago(iso: string | null) {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
