import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';
import { assess, demoServers, readHistory, readServer, readServers, STALE_AFTER } from '../src/lib/homelab';

// /homelab's data: src/lib/homelab.ts behind /api/homelab (Monitoring API, or demo data while none is set).

const NOW = Date.parse('2026-10-05T12:00:00Z');
const raw = (over: Record<string, unknown> = {}) => ({
  id: 'atlas',
  name: 'atlas',
  role: 'hypervisor',
  lastSeen: new Date(NOW - 5000).toISOString(),
  uptimeSeconds: 86400 * 3,
  cpu: { usagePercent: 23.5, load: [0.5, 0.4, 0.3], temperatureC: 48 },
  memory: { usedBytes: 8e9, totalBytes: 16e9 },
  storage: [{ mount: '/', label: 'system', fs: 'ext4', usedBytes: 100, totalBytes: 400 }],
  network: { rxBytesPerSec: 1000, txBytesPerSec: 200 },
  interfaces: [{ name: 'eth0', rxBytesPerSec: 1000, txBytesPerSec: 200, speedMbps: 1000, up: true, ip: '192.168.1.20', mac: 'aa:bb:cc:dd:ee:ff' }],
  system: { hostname: 'atlas', os: 'Debian 12', kernel: '6.1.0', cpuModel: 'x', cores: 8, threads: 16 },
  containers: [{ name: '/nextcloud', image: 'nextcloud:29', state: 'running', status: 'Up 3 days', health: 'healthy', cpuPercent: 1.5, memoryBytes: 1e8 }],
  ...over,
});

test('reading the API: known fields only, numbers clamped, addresses masked, junk dropped', () => {
  const s = readServer(raw({ cpu: { usagePercent: 180, load: [1, 2] }, role: 'gateway at 192.168.1.1', secret: 'nope' }))!;
  assert.equal(s.cpu.usage, 100, 'clamped to 100%');
  assert.equal(s.cpu.load, null, 'load needs all three');
  assert.equal(s.role, 'gateway at •••', 'no addresses on a public page');
  assert.ok(!JSON.stringify(s).includes('192.168'));
  assert.ok(!JSON.stringify(s).includes('aa:bb:cc'));
  assert.ok(!('secret' in s));
  assert.equal(s.containers[0].name, 'nextcloud', 'docker’s leading slash dropped');
  assert.equal(s.storage[0].used, 100);
  // ids are url-safe or the server is skipped
  assert.equal(readServer(raw({ id: '../etc' })), null);
  assert.equal(readServer('junk'), null);
  assert.deepEqual(readServers({ servers: [raw(), raw(), raw({ id: 'vault' }), null, 5] }).map((x) => x.id), ['atlas', 'vault'], 'duplicates and junk dropped');
  assert.deepEqual(readServers('not json at all'), []);
  // used never above total; a disk without a size isn't a disk
  const odd = readServer(raw({ memory: { used: 20, total: 10 }, storage: [{ mount: '/x', usedBytes: 5 }] }))!;
  assert.deepEqual(odd.memory, { used: 10, total: 10 });
  assert.deepEqual(odd.storage, []);
});

test('history: any time format, sorted, nulls kept as gaps', () => {
  const p = readHistory({ points: [{ t: '2026-10-05T11:01:00Z', cpu: 5 }, { t: 1759662000, cpu: 'x', memory: 120 }, { t: 'never' }, {}] });
  assert.equal(p.length, 2);
  assert.ok(p[0].t < p[1].t);
  assert.equal(p[0].cpu, null);
  assert.equal(p[0].memory, 100);
});

test('health: down when silent, degraded when hot, full or unhealthy', () => {
  const at = (over: Record<string, unknown>) => assess(readServer(raw(over))!, NOW);
  assert.deepEqual(at({}), { health: 'up', issues: [] });
  assert.equal(at({ lastSeen: new Date(NOW - STALE_AFTER - 60_000).toISOString() }).health, 'down');
  assert.match(at({ lastSeen: new Date(NOW - 10 * 60_000).toISOString() }).issues[0], /no report for 10 min/);
  assert.equal(at({ status: 'down' }).health, 'down');
  assert.deepEqual(at({ storage: [{ mount: '/srv', label: 'data', usedBytes: 95, totalBytes: 100 }] }), { health: 'degraded', issues: ['data 95% full'] });
  assert.deepEqual(at({ containers: [{ name: 'db', state: 'running', health: 'unhealthy' }] }).issues, ['db unhealthy']);
  assert.equal(at({ containers: [{ name: 'job', state: 'exited' }] }).health, 'up', 'a stopped container is not a problem by itself');
});

/* ——— the endpoints ——— */

const env = (over: Record<string, unknown> = {}) => over as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;
const get = (path: string, e = env()) => app.request(`https://huismax.com${path}`, {}, e, ctx);

test('no MONITORING_API_URL: demo data, marked as such, through the same reading', async () => {
  const res = await get('/api/homelab');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const o = await res.json();
  assert.equal(o.source, 'demo');
  assert.equal(o.stale, false);
  assert.deepEqual(o.servers.map((s: { id: string }) => s.id), ['atlas', 'vault', 'edge']);
  assert.equal(o.health, 'degraded', 'the demo has a full disk and an unhealthy container, to show what that looks like');
  assert.ok(o.servers[0].trend.cpu.length > 10, 'cards get a sparkline');
  const h = await (await get('/api/homelab/edge/history?range=24h')).json();
  assert.equal(h.range, '24h');
  assert.ok(h.points.length > 90);
  assert.equal((await get('/api/homelab/nope/history')).status, 404);
  assert.equal((await get('/api/homelab/edge/history?range=1y')).status, 400);
  assert.equal(demoServers(NOW).servers.length, 3);
});

test('the Monitoring API: asked with the token, read, and the last good answer when it stops answering', async () => {
  const cache = new Map<string, { body: string; until: number }>();
  (globalThis as { caches?: unknown }).caches = {
    default: {
      async match(r: Request) {
        const e = cache.get(r.url);
        return e && e.until > Date.now() ? new Response(e.body) : undefined;
      },
      async put(r: Request, res: Response) {
        const age = Number(res.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 0);
        cache.set(r.url, { body: await res.text(), until: Date.now() + age * 1000 });
      },
    },
  };
  const asked: string[] = [];
  let up = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push(`${url} ${new Headers(init?.headers).get('authorization')}`);
    if (!up) throw new TypeError('fetch failed');
    if (url.endsWith('/v1/servers')) return new Response(JSON.stringify({ servers: [raw({ lastSeen: new Date().toISOString() })] }));
    return new Response(JSON.stringify({ points: [{ t: Date.now() - 60_000, cpu: 20 }, { t: Date.now(), cpu: 30 }] }));
  }) as typeof fetch;
  const e = env({ MONITORING_API_URL: 'https://monitor.example/api/', MONITORING_API_TOKEN: 'tok' });

  let o = await (await get('/api/homelab', e)).json();
  assert.equal(o.source, 'api');
  assert.equal(o.servers[0].id, 'atlas');
  assert.ok(asked.some((a) => a === 'https://monitor.example/api/v1/servers Bearer tok'), asked.join('\n'));
  assert.ok(!JSON.stringify(o).includes('monitor.example'), 'the API’s address never reaches the page');

  // the API goes quiet: the last good answer, marked stale
  cache.forEach((v, k) => !k.endsWith('%23last') && cache.delete(k));
  up = false;
  o = await (await get('/api/homelab', e)).json();
  assert.equal(o.stale, true);
  assert.equal(o.servers[0].id, 'atlas');
  // and with nothing kept at all: an honest 503
  cache.clear();
  const res = await get('/api/homelab', e);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'monitoring is not answering' });

  // http only for local dev; an unknown server's history is never asked for
  assert.equal((await get('/api/homelab', env({ MONITORING_API_URL: 'http://monitor.example' }))).status, 503);
  up = true;
  asked.length = 0;
  assert.equal((await get('/api/homelab/somewhere-else/history', e)).status, 404);
  assert.ok(!asked.some((a) => a.includes('somewhere-else')));
  delete (globalThis as { caches?: unknown }).caches;
});
