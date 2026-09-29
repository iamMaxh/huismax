import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { parseIcecast, radioStatus } from '../src/lib/radio';
import { getLiveStatus, setLiveStatus } from '../src/lib/live';

// The radio (Icecast at radio.huismax.com) makes the DJ channel live on its own: src/lib/radio.ts + src/lib/live.ts.

/** Icecast 2.5's status-json.xsl while BUTT streams to /live.mp3 (the shape radio.huismax.com returns). */
const onAir = (listeners: unknown = 7, extra: object[] = []) => withListeners(listeners, extra);
const withListeners = (listeners: unknown, extra: object[]) => ({
  icestats: {
    admin: 'icemaster@example.com',
    host: 'radio.internal.example',
    location: 'somewhere private',
    server_id: 'Icecast 2.5.0',
    server_start_iso8601: '2026-09-28T21:51:56-0700',
    source: [
      ...extra,
      {
        'allow-direct-access': true,
        audio_info: 'ice-bitrate=192;ice-channels=2;ice-samplerate=48000',
        bitrate: 192,
        listener_peak: 8,
        listeners,
        listenurl: 'http://radio.internal.example:8000/live.mp3',
        server_name: 'no name',
        server_type: 'audio/mpeg',
        stream_start_iso8601: '2026-09-28T22:32:53-0700',
      },
    ],
  },
});
const offAir = { icestats: { admin: 'icemaster@example.com', host: 'radio.internal.example', server_id: 'Icecast 2.5.0' } };

test('parse: /live.mp3 on air, with its listeners and start time', () => {
  // one source is an object, several a list
  const one = { icestats: { ...onAir().icestats, source: onAir().icestats.source[0] } };
  for (const json of [one, onAir(), onAir(7, [{ listenurl: 'http://x:8000/other.mp3', listeners: 99 }])]) {
    assert.deepEqual(parseIcecast(json, '/live.mp3'), { live: true, listeners: 7, startedAt: '2026-09-29T05:32:53.000Z' });
  }
  assert.equal(parseIcecast(onAir('3'), '/live.mp3').listeners, 3);
  for (const odd of [-1, 'lots', null, undefined]) assert.equal(parseIcecast(withListeners(odd, []), '/live.mp3').listeners, 0, String(odd));
});

test('parse: anything else is off air', () => {
  const off = { live: false, listeners: 0, startedAt: null };
  assert.deepEqual(parseIcecast(offAir, '/live.mp3'), off);
  assert.deepEqual(parseIcecast({ icestats: { source: { listenurl: 'http://x:8000/other.mp3', listeners: 4 } } }, '/live.mp3'), off);
  assert.deepEqual(parseIcecast({ icestats: { source: [{ listenurl: 'not a url' }, null] } }, '/live.mp3'), off);
  assert.deepEqual(parseIcecast({ icestats: { source: { listenurl: 'http://x:8000/live.mp3.m3u' } } }, '/live.mp3'), off);
  for (const junk of [null, 'text', 42, {}, { icestats: null }]) assert.deepEqual(parseIcecast(junk, '/live.mp3'), off);
});

/** Stubs fetch: the Icecast status answers with `reply`; returns the URLs fetched. */
function icecast(reply: () => Response | Promise<Response>) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return reply();
  }) as typeof fetch;
  return urls;
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

// the worker logs why the radio counts as off air; keep that out of the test output
const realError = console.error;
const logs: string[] = [];
console.error = (...a: unknown[]) => (String(a[0]).startsWith('radio:') ? void logs.push(a.join(' ')) : realError(...a));

test('status: reads status-json.xsl next to the stream; errors and a slow radio are off air', async () => {
  const urls = icecast(() => json(onAir()));
  assert.equal((await radioStatus({} as never)).live, true);
  assert.equal(urls[0], 'https://radio.huismax.com/status-json.xsl');
  await radioStatus({ RADIO_STREAM_URL: 'https://radio.example/live.mp3', RADIO_STATUS_URL: 'https://radio.example/admin-free/status.json' } as never);
  assert.equal(urls[1], 'https://radio.example/admin-free/status.json');

  for (const reply of [() => json({ error: 'x' }, 500), () => new Response('<html>not json</html>'), () => Promise.reject(new TypeError('fetch failed'))]) {
    icecast(reply);
    assert.deepEqual(await radioStatus({} as never), { live: false, listeners: 0, startedAt: null });
  }
  // a radio that never answers: off air after the timeout, not a hung page
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(init.signal!.reason)))) as typeof fetch;
  const t0 = Date.now();
  // Node's AbortSignal.timeout doesn't keep the process alive (the Workers runtime does): hold it open meanwhile
  const hold = setTimeout(() => {}, 10_000);
  assert.equal((await radioStatus({} as never)).live, false);
  clearTimeout(hold);
  assert.ok(Date.now() - t0 < 4000);
  assert.ok(logs.some((l) => l.includes('radio: status answered 500')));
  assert.ok(logs.some((l) => l.includes('radio: status unreachable')));
});

test('/api/dj-status: exactly { live, listeners }, never Icecast\'s own details', async () => {
  icecast(() => json(onAir(12)));
  let res = await app.request('https://huismax.com/api/dj-status', {}, {} as never);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { live: true, listeners: 12 });
  assert.doesNotMatch(text, /icemaster|internal|private|8000|Icecast/);

  icecast(() => json(offAir));
  res = await app.request('https://huismax.com/api/dj-status', {}, {} as never);
  assert.deepEqual(await res.json(), { live: false, listeners: 0 });
});

test('live status: on air makes the whole site live with the radio stream; off air falls back to the hand setting', async () => {
  icecast(() => json(onAir()));
  let s = await getLiveStatus({} as never);
  assert.equal(s.isLive, true);
  assert.equal(s.label, 'LIVE');
  assert.equal(s.streamUrl, 'https://radio.huismax.com/live.mp3');
  assert.equal(s.startedAt, '2026-09-29T05:32:53.000Z');
  // what every page polls
  const presence = await (await app.request('https://huismax.com/api/presence', {}, {} as never)).json();
  assert.equal(presence.live.isLive, true);
  assert.equal(presence.live.streamUrl, 'https://radio.huismax.com/live.mp3');

  icecast(() => json(offAir));
  s = await getLiveStatus({} as never);
  assert.equal(s.isLive, false);
  assert.equal(s.startedAt, null);
  // switched on by hand (another stream) still works while the radio is off air
  s = await getLiveStatus({ LIVE: 'true', LIVE_STREAM_URL: 'https://elsewhere.example/stream.mp3' } as never);
  assert.equal(s.isLive, true);
  assert.equal(s.streamUrl, 'https://elsewhere.example/stream.mp3');

  // a dev mock decides on its own and the radio isn't asked
  const urls = icecast(() => json(onAir()));
  assert.equal((await getLiveStatus({ ALLOW_MOCK: '1' } as never, 'off')).isLive, false);
  assert.equal(urls.length, 0);
});

test('/dj: rendered live (LIVE, listen live) while on air, and without a player while off air', async () => {
  icecast(() => json(onAir()));
  let html = await (await app.request('https://huismax.com/dj', {}, {} as never)).text();
  assert.match(html, /class="dj-page" data-live-root="true" data-live="on"/);
  assert.match(html, /<button class="btn-primary console-live"[^>]*data-listen-live="true"[^>]*aria-pressed="false">/);
  assert.doesNotMatch(html, /<button class="btn-primary console-live"[^>]*hidden/);
  assert.match(html, /"isLive":true/);

  icecast(() => json(offAir));
  html = await (await app.request('https://huismax.com/dj', {}, {} as never)).text();
  assert.match(html, /data-live="off"/);
  assert.match(html, /<button class="btn-primary console-live"[^>]*hidden/, 'no listen button off air');
  assert.match(html, /data-dj-volume="true" hidden/);
  assert.match(html, /data-dj-listeners-cell="true" hidden/);
});

test('the /admin switch keeps meaning "set by hand" while the radio is on air', async () => {
  const kv = new Map<string, string>();
  const STATE = {
    get: async (k: string, t?: unknown) => (kv.has(k) ? ((t as { type?: string })?.type === 'json' || t === 'json' ? JSON.parse(kv.get(k)!) : kv.get(k)) : null),
    put: async (k: string, v: string) => void kv.set(k, v),
  };
  icecast(() => json(onAir()));
  const env = { STATE } as never;
  const set = await setLiveStatus(env, { isLive: false });
  assert.equal(set.isLive, false, 'the switch shows what was set');
  assert.equal((await getLiveStatus(env)).isLive, true, 'the site is live anyway: the radio is on air');
  assert.equal((await setLiveStatus(env, { isLive: true, sessionTitle: 'late set' })).sessionTitle, 'late set');
  const live = await getLiveStatus(env);
  assert.equal(live.sessionTitle, 'late set', 'a title set by hand names the radio session');
  assert.equal(live.streamUrl, 'https://radio.huismax.com/live.mp3');
});
