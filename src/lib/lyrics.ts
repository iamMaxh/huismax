import type { Env } from './env';

/**
 * Lyrics for the track Spotify is playing, from LRCLIB (lrclib.net: free, no key). Looked up here rather than in
 * the browser so one lookup per song serves every visitor from the edge cache (src/index.tsx), LRCLIB sees a proper
 * User-Agent, and visitors' browsers only ever talk to this site. The page gets parsed lines, nothing else.
 */

/** `t` = when the line starts, in ms (-1 for unsynced lyrics). An empty `text` is an instrumental break. */
export type Line = { t: number; text: string };
export type Lyrics = { state: 'synced' | 'plain' | 'instrumental' | 'none' | 'error'; lines: Line[] };
export type Query = { name: string; artist: string; album: string; durationMs: number };

type Hit = {
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const base = (env: Env) => env.LRCLIB_BASE || 'https://lrclib.net';
const UA = 'huismax.com (https://huismax.com)';
const TIMEOUT = 5000;
const MAX_LINES = 400;
const MAX_TEXT = 300;
/** synced lyrics are timed to one recording: only trust them within this much of Spotify's duration */
const SYNC_TOLERANCE = 3000;
/** an empty line shorter than this is just the end of the previous line, not a break worth showing */
const MIN_BREAK = 4000;

/* ——— LRC ——— */

const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

/**
 * Parses LRC ("[01:02.34] text"): several stamps on a line, [mm:ss], [mm:ss.x|xx|xxx], [offset:±ms], and
 * word-level <mm:ss.xx> tags (dropped). Returns lines by time; only breaks long enough to notice are kept,
 * including an intro (a break at 0) when the words start late.
 */
export function parseLrc(lrc: string): Line[] {
  const offset = Number(lrc.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/im)?.[1] ?? 0);
  const out: Line[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps: number[] = [];
    let rest = raw.trim();
    // stamps are at the start of the line, possibly several: [00:12.00][01:30.00] chorus
    for (let m; (m = STAMP.exec(rest)); rest = rest.slice(m[0].length).trimStart()) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0;
      stamps.push(Math.max(0, Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac - offset));
    }
    if (!stamps.length) continue; // metadata ([ar:…]) or stray text
    const text = rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    for (const t of stamps) out.push({ t, text });
  }
  out.sort((a, b) => a.t - b.t);
  const first = out.find((l) => l.text);
  const lines: Line[] = first && first.t >= MIN_BREAK ? [{ t: 0, text: '' }] : [];
  out.forEach((l, i) => {
    if (l.text) return void lines.push(l);
    if (!first || l.t < first.t) return; // the intro is there already (or too short to show)
    if (lines[lines.length - 1].text === '') return; // one break at a time
    const next = out.slice(i + 1).find((n) => n.text);
    if (!next || next.t - l.t >= MIN_BREAK) lines.push(l);
  });
  return lines.slice(0, MAX_LINES);
}

const plainLines = (text: string): Line[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT))
    // stanza breaks stay (one at a time), the ends are trimmed
    .filter((l, i, all) => l || (i > 0 && all[i - 1] !== ''))
    .map((text) => ({ t: -1, text }))
    .slice(0, MAX_LINES)
    .reduceRight<Line[]>((acc, l) => (acc.length || l.text ? [l, ...acc] : acc), []);

/* ——— matching ——— */

/** Case, accents and punctuation don't matter: "Beyoncé" = "beyonce", "AC/DC" = "ac dc", "晴天" stays "晴天". */
export const norm = (s: string) =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The title without what varies between releases: "(feat. X)", "- Remastered 2009", "[Live]", "(Radio Edit)". */
export function baseTitle(name: string) {
  const kinds = 'remaster|version|edit|live|mono|stereo|demo|acoustic|deluxe|bonus|explicit|clean|recorded|single|mix';
  const cut = name
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(new RegExp(`\\s*[([][^)\\]]*(?:${kinds})[^)\\]]*[)\\]]`, 'gi'), '')
    .replace(new RegExp(`\\s+[-–—]\\s+[^-–—]*(?:${kinds}|feat\\.?|with ).*$`, 'i'), '')
    .trim();
  return cut || name.trim();
}

/** The best of LRCLIB's results for the track, or null. */
export function pick(hits: Hit[], q: Query): Lyrics | null {
  const title = norm(q.name), titleBase = norm(baseTitle(q.name)), artist = norm(q.artist);
  const same = hits.filter((h) => {
    const t = norm(h.trackName ?? ''), a = norm(h.artistName ?? '');
    const titleOk = t === title || norm(baseTitle(h.trackName ?? '')) === titleBase;
    return titleOk && (!artist || a.includes(artist) || (!!a && artist.includes(a)));
  });
  if (!same.length) return null;
  const off = (h: Hit) => Math.abs(h.duration * 1000 - q.durationMs);
  const byDuration = [...same].sort((a, b) => off(a) - off(b));
  const timed = byDuration.filter((h) => off(h) <= SYNC_TOLERANCE);
  for (const h of timed) {
    if (!h.syncedLyrics) continue;
    const lines = parseLrc(h.syncedLyrics);
    if (lines.some((l) => l.text)) return { state: 'synced', lines };
  }
  // words without timing: from this recording first, else from another (its timing wouldn't fit this one)
  const words = (h: Hit) => plainLines(h.plainLyrics || (h.syncedLyrics ? parseLrc(h.syncedLyrics).map((l) => l.text).join('\n') : ''));
  for (const h of timed) {
    const lines = words(h);
    if (lines.length) return { state: 'plain', lines };
  }
  // the matching recording (or every version found) says it has no words
  if ((timed.length ? timed : byDuration).every((h) => h.instrumental)) return { state: 'instrumental', lines: [] };
  for (const h of byDuration) {
    const lines = words(h);
    if (lines.length) return { state: 'plain', lines };
  }
  return null;
}

/* ——— LRCLIB ——— */

async function search(env: Env, params: Record<string, string>): Promise<Hit[]> {
  const res = await fetch(`${base(env)}/api/search?${new URLSearchParams(params)}`, {
    headers: { 'User-Agent': UA, 'Lrclib-Client': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`lrclib ${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Hit[]).filter((h) => h && typeof h.trackName === 'string' && typeof h.duration === 'number') : [];
}

/**
 * Title + lead artist first; then the bare title ("- Remastered", "feat." dropped); then a free-text search.
 * 'none' only when every search answered; if LRCLIB failed along the way it's 'error' (tried again later).
 */
export async function findLyrics(env: Env, q: Query): Promise<Lyrics> {
  const name = q.name.trim(), bare = baseTitle(name);
  const tries: Record<string, string>[] = [{ track_name: name, artist_name: q.artist }];
  if (bare !== name) tries.push({ track_name: bare, artist_name: q.artist });
  tries.push({ q: `${bare} ${q.artist}`.trim() });
  let failed = false;
  for (const params of tries) {
    try {
      const found = pick(await search(env, params), q);
      if (found) return found;
    } catch (e) {
      failed = true;
      console.error('lyrics:', (e as Error).message);
    }
  }
  return { state: failed ? 'error' : 'none', lines: [] };
}
