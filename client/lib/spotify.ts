/** Live Spotify state for the public pages. The server holds every token; this only reads /api/spotify/*. */
export type Track = {
  /** Spotify track id (null for local files); keys the lyrics */
  id: string | null;
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
export type Now = {
  state: 'playing' | 'paused' | 'recent' | 'idle' | 'unconfigured' | 'disconnected' | 'error' | 'loading';
  track: Track | null;
  /** how old the answer was when the server sent it (the edge keeps one for up to 10 s) */
  ageMs?: number;
};

type Listener = (n: Now, receivedAt: number) => void;
const listeners = new Set<Listener>();
let current: Now = { state: 'loading', track: null };
let receivedAt = 0;
/** the last poll, answered or not (receivedAt stays at the last good answer through errors) */
let polledAt = 0;
let started = false;
/** pages showing synced lyrics ask for fresher data (a seek or skip shows up sooner) */
let fast = 0;

export const spotify = {
  get: () => current,
  /** Progress right now, extrapolated from the last poll while playing (plus how old that answer already was). */
  progress(): number {
    const t = current.track;
    if (!t) return 0;
    if (current.state !== 'playing') return t.progressMs;
    return Math.min(t.durationMs, t.progressMs + (current.ageMs ?? 0) + (Date.now() - receivedAt));
  },
  /** Poll every 10 s instead of 20 s while it's on; returns the undo. */
  fast() {
    if (!fast++) schedule(polledAt);
    return () => void fast--;
  },
  /** Ask again now (e.g. the lyrics endpoint says the song has changed). */
  refresh: () => started && poll(),
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
  polledAt = Date.now();
  // keep showing the last good track through a transient error, still counting from the last good answer
  if (!(next.state === 'error' && current.track)) {
    current = next;
    receivedAt = Date.now();
    listeners.forEach((fn) => fn(current, receivedAt));
  }
  schedule(Date.now());
}

/**
 * Poll sooner when a song is about to end, otherwise every 20 s (10 s with `fast`), counted from `since`: the poll
 * that just happened, or the one before when `fast` switches on (so that doesn't push the next poll back).
 */
function schedule(since: number) {
  clearTimeout(timer);
  if (!started || document.visibilityState !== 'visible') return;
  let wait = fast ? 10_000 : 20_000;
  const t = current.track;
  if (current.state === 'playing' && t) wait = Math.max(3_000, Math.min(wait, t.durationMs - spotify.progress() + 1_500));
  timer = window.setTimeout(poll, Math.max(0, wait - (Date.now() - since)));
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
  const refreshIfStale = () => document.visibilityState === 'visible' && Date.now() - polledAt > 10_000 && poll();
  window.addEventListener('pageshow', refreshIfStale);
  window.addEventListener('focus', refreshIfStale);
  window.addEventListener('online', refreshIfStale);
  setInterval(() => Date.now() - polledAt > 30_000 && refreshIfStale(), 5_000);
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
