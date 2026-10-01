import { live } from './live';
import { spotify, type Now } from './spotify';

/**
 * Lyrics for the song Spotify is playing (GET /api/spotify/lyrics, src/lib/lyrics.ts) and which line is being sung.
 * Nothing is fetched until a page shows lyrics (subscribe / onLine); each song is asked for once per visit (the
 * browser and the edge keep the answer longer). The line comes from Spotify's own progress, the same number the
 * progress bars use, so there is no second clock to drift. While the DJ channel is live, the lyrics follow the
 * stream instead, which reaches listeners LIVE_DELAY after Spotify.
 */

/** `t` = start in ms (-1: unsynced). An empty `text` is an instrumental break (or the intro, at 0). */
export type Line = { t: number; text: string };
export type Status = 'off' | 'loading' | 'synced' | 'plain' | 'instrumental' | 'none' | 'error';
/** `onAir`: the DJ channel is live, so the lines run LIVE_DELAY behind Spotify (what listeners of the stream hear). */
export type LyricsState = { status: Status; id: string | null; lines: Line[]; paused: boolean; onAir: boolean };
type Answer = { state: 'synced' | 'plain' | 'instrumental' | 'none' | 'error'; lines: Line[] };

/** A line shows this much early: reading takes a moment, and a poll can't know the network delay exactly. */
export const LEAD = 250;
/** How far the radio runs behind Max's Spotify (BUTT → Icecast → the listener's player). */
export const LIVE_DELAY = 5000;
/** after an error, ask again (at the next poll after this long) while the same song plays */
const RETRY = 60_000;
const ANSWERS = new Set(['synced', 'plain', 'instrumental', 'none', 'error']);

const answers = new Map<string, { answer: Answer; at: number }>();
const stateFns = new Set<(s: LyricsState) => void>();
const lineFns = new Set<(i: number) => void>();
let state: LyricsState = { status: 'off', id: null, lines: [], paused: false, onAir: false };
let unfollow: (() => void) | null = null;
let unlive: (() => void) | null = null;
let slow: (() => void) | null = null;
let retryTimer = 0;
let lineTimer = 0;
let line = -1;
let stale = 0;

/** Index of the line being sung at `ms`: the last one started, -1 before the first. */
export function lineAt(lines: Line[], ms: number) {
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= ms) (found = mid), (lo = mid + 1);
    else hi = mid - 1;
  }
  return found;
}

export const fmtStamp = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function set(patch: Partial<LyricsState>) {
  state = { ...state, ...patch };
  stateFns.forEach((fn) => fn(state));
  tick(true);
  pace();
}

/** Synced lyrics on screen: poll Spotify more often, so a seek or a skip shows up sooner. */
function pace() {
  const want = state.status === 'synced' && !state.paused && !!unfollow;
  if (want && !slow) slow = spotify.fast();
  else if (!want && slow) (slow(), (slow = null));
}

/**
 * Where the song is for whoever is reading: Spotify's progress, or LIVE_DELAY earlier while it plays on air.
 * Paused, the stream catches up with Spotify (and then is quiet), so there's no delay to take off.
 */
export const position = () => spotify.progress() + LEAD - (state.onAir && !state.paused ? LIVE_DELAY : 0);

/** Tells the line listeners when the line changes; sleeps until the next one starts (or half a second). */
function tick(force = false) {
  clearTimeout(lineTimer);
  const synced = state.status === 'synced';
  const at = position();
  const i = synced ? lineAt(state.lines, at) : -1;
  if (force || i !== line) {
    line = i;
    lineFns.forEach((fn) => fn(i));
  }
  if (!synced || state.paused || !lineFns.size) return;
  const next = state.lines[i + 1];
  lineTimer = window.setTimeout(tick, Math.min(500, Math.max(30, next ? next.t - at + 5 : 500)));
}

function follow(n: Now) {
  const t = n.track;
  const paused = n.state === 'paused';
  if (!t?.id || (n.state !== 'playing' && !paused)) {
    clearTimeout(retryTimer);
    if (state.status !== 'off') set({ status: 'off', id: null, lines: [], paused: false });
    return;
  }
  const failed = state.status === 'error' && Date.now() - (answers.get(t.id)?.at ?? 0) > RETRY;
  if (t.id !== state.id || failed) return void load(t.id, paused);
  if (paused !== state.paused) set({ paused });
  // a poll can move the song (a seek): find the line again
  else tick();
}

async function load(id: string, paused: boolean) {
  clearTimeout(retryTimer);
  const known = answers.get(id);
  if (known && !(known.answer.state === 'error' && Date.now() - known.at > RETRY)) {
    return set({ status: known.answer.state, id, lines: known.answer.lines, paused });
  }
  set({ status: 'loading', id, lines: [], paused });
  let answer: Answer;
  try {
    const res = await fetch(`/api/spotify/lyrics?id=${encodeURIComponent(id)}`);
    if (res.status === 409) {
      // the site has moved on to another song (or not caught up yet): refresh Spotify, then ask again, a few times
      if (state.id === id && stale++ < 3) {
        spotify.refresh();
        retryTimer = window.setTimeout(() => state.id === id && load(id, state.paused), 4000);
        return;
      }
      throw new Error('stale');
    }
    const data = res.ok ? ((await res.json()) as Answer) : null;
    answer = data && ANSWERS.has(data.state) && Array.isArray(data.lines) ? data : { state: 'error', lines: [] };
  } catch {
    answer = { state: 'error', lines: [] };
  }
  stale = 0;
  answers.set(id, { answer, at: Date.now() });
  if (answers.size > 40) answers.delete(answers.keys().next().value!);
  if (state.id !== id) return; // another song meanwhile
  set({ status: answer.state, lines: answer.lines });
}

function use() {
  unfollow ??= spotify.subscribe(follow) as () => void;
  // going live (or ending the set) moves the lyrics by LIVE_DELAY
  unlive ??= live.subscribe((s) => s.isLive !== state.onAir && set({ onAir: s.isLive })) as () => void;
  pace();
}
function unuse() {
  if (stateFns.size + lineFns.size) return;
  unfollow?.();
  unlive?.();
  unfollow = unlive = null;
  clearTimeout(lineTimer);
  clearTimeout(retryTimer);
  pace();
}

export const lyrics = {
  get: () => state,
  /** Lyrics for the song on show (status 'off' when nothing plays). Calls `fn` now and on every change. */
  subscribe(fn: (s: LyricsState) => void) {
    stateFns.add(fn);
    fn(state);
    use();
    return () => (stateFns.delete(fn), unuse());
  },
  /** The line being sung (-1: none yet), whenever it changes and after new lyrics. */
  onLine(fn: (i: number) => void) {
    lineFns.add(fn);
    fn(line);
    use();
    tick();
    return () => (lineFns.delete(fn), unuse());
  },
};
