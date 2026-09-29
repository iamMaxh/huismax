import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { baseTitle, norm, parseLrc, pick } from '../src/lib/lyrics';

// Lyrics for the song on show: src/lib/lyrics.ts (LRCLIB) behind GET /api/spotify/lyrics, and ageMs on /api/spotify/now.

test('LRC: stamps in every form, several per line, offset, word tags and metadata', () => {
  const lines = parseLrc(
    [
      '[ar:Somebody]',
      '[ti:Title]',
      '[00:01.5] one',
      '[00:02] two',
      '[00:03:25] three',
      '[00:04.125] <00:04.125>four <00:04.600>words',
      '[00:06.00][00:08.00] twice',
      '[00:05.00]   spaced    out   ',
      'no stamp at all',
    ].join('\n'),
  );
  assert.deepEqual(lines, [
    { t: 1500, text: 'one' },
    { t: 2000, text: 'two' },
    { t: 3250, text: 'three' },
    { t: 4125, text: 'four words' },
    { t: 5000, text: 'spaced out' },
    { t: 6000, text: 'twice' },
    { t: 8000, text: 'twice' },
  ]);
  // [offset:+500] makes every line half a second earlier (and the words start late: an intro)
  assert.deepEqual(parseLrc('[offset:+500]\n[00:10.00] a\n[00:12.00] b'), [
    { t: 0, text: '' },
    { t: 9500, text: 'a' },
    { t: 11500, text: 'b' },
  ]);
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc('just some words\nwithout time'), []);
});

test('LRC: breaks only when long enough to notice, and an intro when the words start late', () => {
  // LRCLIB's usual shape: an empty line a tenth of a second before the next one is just the end of a line
  const lines = parseLrc('[00:17.38] Kiss me\n[00:21.61] Summer\n[00:33.62] \n[00:33.72] Red dress\n[00:40.00] \n[00:40.10] \n[00:52.00] Oh my\n[01:00.00] ');
  assert.deepEqual(lines, [
    { t: 0, text: '' },
    { t: 17380, text: 'Kiss me' },
    { t: 21610, text: 'Summer' },
    { t: 33720, text: 'Red dress' },
    { t: 40000, text: '' },
    { t: 52000, text: 'Oh my' },
    { t: 60000, text: '' },
  ]);
  // words from the first seconds: no intro
  assert.equal(parseLrc('[00:01.00] now\n[00:03.00] then')[0].text, 'now');
});

test('titles and names: release details, case, accents and punctuation do not matter', () => {
  assert.equal(baseTitle('Here Comes The Sun - Remastered 2009'), 'Here Comes The Sun');
  assert.equal(baseTitle('Get Lucky (feat. Pharrell Williams and Nile Rodgers)'), 'Get Lucky');
  assert.equal(baseTitle('Song [Radio Edit]'), 'Song');
  assert.equal(baseTitle('Song - Live at Wembley'), 'Song');
  assert.equal(baseTitle('Delilah (pull me out of this)'), 'Delilah (pull me out of this)');
  assert.equal(baseTitle('Up - Down'), 'Up - Down');
  assert.equal(baseTitle('(Remastered)'), '(Remastered)', 'never empty');
  assert.equal(norm('Beyoncé'), 'beyonce');
  assert.equal(norm('AC/DC'), 'ac dc');
  assert.equal(norm('晴天'), '晴天');
  assert.equal(norm('  Fred again..  '), 'fred again');
});

const hit = (over: object = {}) => ({
  trackName: 'Summertime Sadness',
  artistName: 'Lana Del Rey',
  albumName: 'Born To Die',
  duration: 265,
  instrumental: false,
  plainLyrics: 'Kiss me hard\nSummertime sadness',
  syncedLyrics: '[00:17.38] Kiss me hard\n[00:21.61] Summertime sadness',
  ...over,
});
const q = { name: 'Summertime Sadness', artist: 'Lana Del Rey', album: 'Born To Die – Paradise Edition (Special Version)', durationMs: 264_773 };

test('pick: synced lyrics of the same recording; otherwise words without timing; otherwise instrumental or nothing', () => {
  assert.equal(pick([hit()], q)?.state, 'synced');
  // synced lyrics from a recording 20 s longer would run off: shown unsynced instead
  const other = pick([hit({ duration: 285 })], q)!;
  assert.equal(other.state, 'plain');
  assert.deepEqual(other.lines, [
    { t: -1, text: 'Kiss me hard' },
    { t: -1, text: 'Summertime sadness' },
  ]);
  // the closest recording wins
  assert.equal(pick([hit({ duration: 300, syncedLyrics: '[00:01.00] wrong one' }), hit()], q)!.lines[1].text, 'Kiss me hard');
  // case and punctuation differences are the same song; another song or artist is not
  assert.equal(pick([hit({ trackName: 'SUMMERTIME SADNESS', artistName: 'lana del rey' })], q)?.state, 'synced');
  assert.equal(pick([hit({ trackName: 'Young and Beautiful' })], q), null);
  // a remix counts as the song; its own duration keeps its timing out
  assert.equal(pick([hit({ trackName: 'Summertime Sadness (Cedric Gervais Remix)', duration: 412 })], q)?.state, 'plain');
  assert.equal(pick([hit({ artistName: 'Someone Else' })], q), null);
  assert.equal(pick([], q), null);
  // instrumental
  assert.equal(pick([hit({ instrumental: true, plainLyrics: null, syncedLyrics: null })], q)?.state, 'instrumental');
  // a feat. / remaster title still finds the plain song
  assert.equal(pick([hit({ trackName: 'Get Lucky', artistName: 'Daft Punk', duration: 248 })], { name: 'Get Lucky (feat. Pharrell Williams)', artist: 'Daft Punk', album: '', durationMs: 248_000 })?.state, 'synced');
  // stanza breaks in plain lyrics: one at a time, none at the ends
  assert.deepEqual(pick([hit({ duration: 300, syncedLyrics: null, plainLyrics: '\n\na\n\n\nb\n\n' })], q)!.lines.map((l) => l.text), ['a', '', 'b']);
});

/* ——— the endpoints, with Spotify, LRCLIB and the edge cache stood in ——— */

const cacheStore = new Map<string, { res: Response; until: number }>();
(globalThis as { caches?: unknown }).caches = {
  default: {
    async match(req: Request) {
      const e = cacheStore.get(req.url);
      return e && e.until > Date.now() ? e.res.clone() : undefined;
    },
    async put(req: Request, res: Response) {
      const age = Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 0);
      cacheStore.set(req.url, { res: res.clone(), until: Date.now() + age * 1000 });
    },
    async delete(req: Request) {
      return cacheStore.delete(req.url);
    },
  },
};
const kv = new Map<string, string>([['spotify:refresh', 'refresh-token']]);
const STATE = {
  get: async (k: string, t?: unknown) => (kv.has(k) ? (t === 'json' ? JSON.parse(kv.get(k)!) : kv.get(k)) : null),
  put: async (k: string, v: string) => void kv.set(k, v),
  delete: async (k: string) => void kv.delete(k),
};
const env = { STATE, SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: 'secret' } as never;
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {}, props: {} } as never;
const settle = async () => void (await Promise.all(pending.splice(0)));

const ID = '1Ist6PR2BZR3n2z2Y5R6S1';
let playing: Record<string, unknown> | null = null;
let lrclib: (url: URL) => Response | Promise<Response> = () => new Response('[]');
const calls: string[] = [];
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  calls.push(`${url.host}${url.pathname}${url.search}`);
  if (url.host === 'accounts.spotify.com') return json({ access_token: 'access', expires_in: 3600 });
  if (url.pathname === '/v1/me/player/currently-playing') return playing ? json(playing) : new Response(null, { status: 204 });
  if (url.pathname === '/v1/me/player/recently-played') return json({ items: [] });
  if (url.host === 'lrclib.net') {
    assert.match(String(new Headers(init?.headers).get('user-agent')), /huismax\.com/, 'LRCLIB asks for a User-Agent');
    return lrclib(url);
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;
const track = (over: Record<string, unknown> = {}) => ({
  is_playing: true,
  progress_ms: 30_000,
  currently_playing_type: 'track',
  item: {
    id: ID,
    name: 'Summertime Sadness',
    duration_ms: 264_773,
    external_urls: { spotify: `https://open.spotify.com/track/${ID}` },
    artists: [{ name: 'Lana Del Rey' }, { name: 'Someone, Featured' }],
    album: { name: 'Born To Die – Paradise Edition (Special Version)', images: [] },
    ...over,
  },
});
const get = async (path: string) => {
  const res = await app.request(`https://huismax.com${path}`, {}, env, ctx);
  await settle();
  return res;
};
const lrclibCalls = () => calls.filter((c) => c.startsWith('lrclib.net'));
const reset = () => (cacheStore.clear(), (calls.length = 0));

// the worker logs LRCLIB failures; keep them out of the test output
const realError = console.error;
console.error = (...a: unknown[]) => (String(a[0]).startsWith('lyrics:') ? undefined : realError(...a));

test('/api/spotify/now: the track id and lead artist, and how old an edge-cached answer is', async () => {
  reset();
  playing = track();
  let data = await (await get('/api/spotify/now')).json();
  assert.equal(data.track.id, ID);
  assert.equal(data.track.leadArtist, 'Lana Del Rey', 'an artist name with a comma stays whole');
  assert.ok(data.ageMs >= 0 && data.ageMs < 1000, `fresh: ${data.ageMs}`);
  // the same answer from the edge 1.2 s later says so
  await new Promise((r) => setTimeout(r, 1200));
  data = await (await get('/api/spotify/now')).json();
  assert.equal(calls.filter((c) => c.includes('currently-playing')).length, 1, 'served from the edge cache');
  assert.ok(data.ageMs >= 1100 && data.ageMs < 3000, `aged: ${data.ageMs}`);
});

test('/api/spotify/lyrics: synced lines for the song on show, looked up once and then served from the cache', async () => {
  reset();
  playing = track();
  lrclib = (url) => {
    assert.equal(url.pathname, '/api/search');
    assert.equal(url.searchParams.get('track_name'), 'Summertime Sadness');
    assert.equal(url.searchParams.get('artist_name'), 'Lana Del Rey');
    return json([hit({ duration: 300, syncedLyrics: '[00:01.00] another recording' }), hit()]);
  };
  const res = await get(`/api/spotify/lyrics?id=${ID}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
  const body = await res.json();
  assert.deepEqual(body, { state: 'synced', lines: [{ t: 0, text: '' }, { t: 17380, text: 'Kiss me hard' }, { t: 21610, text: 'Summertime sadness' }] });
  assert.equal(lrclibCalls().length, 1);
  // again, from any visitor: no second lookup
  assert.deepEqual(await (await get(`/api/spotify/lyrics?id=${ID}`)).json(), body);
  assert.equal(lrclibCalls().length, 1);
});

test('/api/spotify/lyrics: only the song on show, by a real Spotify id', async () => {
  reset();
  playing = track();
  for (const bad of ['', 'short', `${ID}x`, '../../etc/passwd', `${ID.slice(0, 21)}!`]) {
    assert.equal((await get(`/api/spotify/lyrics?id=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
  const other = await get('/api/spotify/lyrics?id=0000000000000000000000');
  assert.equal(other.status, 409, 'not what is playing');
  assert.equal(other.headers.get('cache-control'), 'no-store');
  assert.equal(lrclibCalls().length, 0, 'never looked up');
  // nothing playing (and nothing played lately)
  reset();
  playing = null;
  assert.equal((await get(`/api/spotify/lyrics?id=${ID}`)).status, 409);
});

test('/api/spotify/lyrics: release details and special characters; searches until something fits', async () => {
  reset();
  const id = '4uLU6hMCjMI75M1A2tKUQC';
  const full = 'Déjà Vu (feat. JAY-Z) - Remastered 2006 & "Bonus" <Edit>?#';
  playing = track({ id, name: full, artists: [{ name: 'Beyoncé' }], duration_ms: 240_000 });
  const asked: string[] = [];
  lrclib = (url) => {
    asked.push(url.search);
    // LRCLIB only knows the bare title, and spells the names without accents
    return json(url.searchParams.get('track_name') === 'Déjà Vu' ? [hit({ trackName: 'Deja Vu', artistName: 'Beyonce', duration: 241 })] : []);
  };
  const body = await (await get(`/api/spotify/lyrics?id=${id}`)).json();
  assert.equal(body.state, 'synced');
  assert.equal(asked.length, 2, 'the full title first, then the bare one');
  assert.equal(new URLSearchParams(asked[0]).get('track_name'), full, 'sent as data, encoded');
  assert.equal(new URLSearchParams(asked[0]).get('artist_name'), 'Beyoncé');
});

test('/api/spotify/lyrics: none found, instrumental, and LRCLIB failing are answers too (kept for a day, a week, two minutes)', async () => {
  const ttl = (id: string) => Math.round((cacheStore.get(`https://huismax.com/api/spotify/lyrics?id=${id}`)!.until - Date.now()) / 1000);

  reset();
  playing = track();
  lrclib = () => json([]);
  let res = await get(`/api/spotify/lyrics?id=${ID}`);
  assert.deepEqual(await res.json(), { state: 'none', lines: [] });
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(lrclibCalls().length, 2, 'title + artist, then free text (the title has nothing to drop)');
  assert.ok(Math.abs(ttl(ID) - 86400) < 5);

  reset();
  lrclib = () => json([hit({ instrumental: true, plainLyrics: null, syncedLyrics: null })]);
  assert.deepEqual(await (await get(`/api/spotify/lyrics?id=${ID}`)).json(), { state: 'instrumental', lines: [] });
  assert.ok(Math.abs(ttl(ID) - 604800) < 5);

  for (const fail of [() => json({ message: 'The server is busy' }, 503), () => new Response('<html>', { status: 200 }), () => Promise.reject(new TypeError('fetch failed'))]) {
    reset();
    lrclib = fail;
    res = await get(`/api/spotify/lyrics?id=${ID}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { state: 'error', lines: [] });
    assert.ok(Math.abs(ttl(ID) - 120) < 5, 'LRCLIB is left alone for two minutes');
  }
  // LRCLIB giving up late (the worker's own limit is 5 s a search): still an answer, not a hung page
  reset();
  lrclib = (url) => new Promise((_ok, fail) => setTimeout(() => fail(new Error(`timed out ${url.search}`)), 50));
  assert.equal((await (await get(`/api/spotify/lyrics?id=${ID}`)).json()).state, 'error');
});
