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

test('the API with the /v1 contract: used as it is, the existing endpoints not asked', async () => {
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    asked.push(url.pathname + url.search);
    if (url.pathname === '/v1/servers') return new Response(JSON.stringify({ servers: [raw({ lastSeen: new Date().toISOString() })] }));
    if (url.pathname === '/v1/servers/atlas/history') return new Response(JSON.stringify({ points: [{ t: Date.now(), cpu: 12 }] }));
    return new Response('{"detail":"Not Found"}', { status: 404 });
  }) as typeof fetch;
  const e = env({ MONITORING_API_URL: 'https://api.huismax.example' });
  const o = await (await get('/api/homelab', e)).json();
  assert.equal(o.servers[0].id, 'atlas');
  const h = await (await get('/api/homelab/atlas/history?range=24h', e)).json();
  assert.equal(h.points[0].cpu, 12);
  assert.deepEqual([...new Set(asked.map((a) => a.split('?')[0]))], ['/v1/servers', '/v1/servers/atlas/history']);
});

test('api.huismax.com: five endpoints put together, LAN addresses dropped, the last good answer when it stops answering', async () => {
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
  const at = new Date().toISOString();
  const answers: Record<string, unknown> = {
    '/servers': { servers: [{ id: 'monitoring', instance: 'node-exporter:9100', status: 'online', cpu_percent: 1.2, memory_percent: 28, memory_total_bytes: 3563745280, uptime_seconds: 12127 }, { id: 'docker-server', instance: '192.168.50.68', status: 'online', cpu_percent: 1.7, memory_percent: 17, memory_total_bytes: 24586317824, uptime_seconds: 23302 }], updated_at: at },
    '/storage': { filesystems: [{ server: 'docker-server', device: '/dev/sdb1', mountpoint: '/mnt/maxstudio', filesystem: 'exfat', total_bytes: 1e12, used_bytes: 4.6e11 }, { server: 'docker-server', mountpoint: '/boot/efi', filesystem: 'vfat', total_bytes: 1e9, used_bytes: 1e7 }, { server: 'monitoring', mountpoint: '/', filesystem: 'ext4', total_bytes: 3e10, used_bytes: 1.2e10 }] },
    '/network': { network: [{ server: 'docker-server', rx_bytes_per_second: 47, tx_bytes_per_second: 852 }] },
    '/containers': { containers: [{ name: 'nextcloud-nextcloud-1', status: 'running', cpu_percent: 0.2, memory_bytes: 2.6e9, last_seen: 1791184407 }, { name: 'lan-dns', status: 'exited', cpu_percent: 0, memory_bytes: 0 }] },
    '/system-info': { systems: [{ id: 'docker-server', name: 'Docker Server', hostname: 'huismax', role: 'Primary Docker Application Server', virtualization: 'KVM', hypervisor: 'Proxmox VE', os: { name: 'Ubuntu', version: '26.04.1 LTS', kernel: '7.0.0-38-generic', architecture: 'x86_64' }, cpu: { model: 'Intel Core i5-13600T', vcpus: 8, cores: 8 }, memory: { total_gib: 22, swap_gib: 8 }, network: { primary_interface: 'ens18', ipv4: '192.168.50.68' }, docker: { engine: '29.1.3' } }] },
  };
  const series = (v: number) => ({ series: [{ metric: { instance: '192.168.50.68' }, values: [{ timestamp: Date.now() / 1000 - 60, value: v }, { timestamp: Date.now() / 1000, value: v + 1 }] }] });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    asked.push(`${url.pathname}${url.search} ${new Headers(init?.headers).get('authorization')}`);
    if (!up) throw new TypeError('fetch failed');
    if (url.pathname.startsWith('/history/')) return new Response(JSON.stringify(series(url.pathname.endsWith('cpu') ? 5 : 20)));
    // FastAPI's answer for a route it doesn't have (the /v1 contract, until it's added)
    return url.pathname in answers ? new Response(JSON.stringify(answers[url.pathname])) : new Response('{"detail":"Not Found"}', { status: 404 });
  }) as typeof fetch;
  const e = env({ MONITORING_API_URL: 'https://api.huismax.example/', MONITORING_API_TOKEN: 'tok' });

  let o = await (await get('/api/homelab', e)).json();
  assert.equal(o.source, 'api');
  assert.deepEqual(o.servers.map((s: { id: string }) => s.id), ['monitoring', 'docker-server']);
  const docker = o.servers[1];
  assert.equal(docker.name, 'Docker Server');
  assert.equal(docker.system.os, 'Ubuntu 26.04.1 LTS');
  assert.equal(docker.system.virtualization, 'KVM · Proxmox VE');
  assert.equal(docker.system.docker, '29.1.3');
  assert.deepEqual(docker.containers.map((c: { name: string; state: string }) => `${c.name} ${c.state}`), ['nextcloud-nextcloud-1 running', 'lan-dns exited'], 'containers go to the server running Docker');
  assert.deepEqual(o.servers[0].containers, []);
  assert.deepEqual(docker.storage.map((d: { mount: string }) => d.mount), ['/mnt/maxstudio'], '/boot partitions left out');
  assert.equal(Math.round(docker.memory.used / 1e6), Math.round((24586317824 * 0.17) / 1e6));
  assert.deepEqual(docker.interfaces.map((i: { name: string }) => i.name), ['ens18']);
  assert.equal(docker.trend.cpu.length, 2, 'the sparkline from /history');
  assert.equal(o.servers[0].name, 'monitoring', 'no system-info: its id');
  const text = JSON.stringify(o);
  for (const leak of ['192.168', 'node-exporter:9100', 'api.huismax.example', 'tok']) assert.ok(!text.includes(leak), leak);
  assert.ok(asked.includes('/servers Bearer tok'), asked.join('\n'));
  assert.ok(asked.some((a) => a.startsWith('/history/network_rx?server=docker-server&hours=1 ')), asked.join('\n'));

  const h = await (await get('/api/homelab/docker-server/history?range=7d', e)).json();
  assert.deepEqual(h.points[0], { t: h.points[0].t, cpu: 5, memory: 20, rx: 20, tx: 20 }, 'four metrics side by side');
  assert.ok(asked.some((a) => a.startsWith('/history/cpu?server=docker-server&hours=168 ')));


  // the API goes quiet: the last good answer, marked stale
  cache.forEach((v, k) => !k.endsWith('%23last') && cache.delete(k));
  up = false;
  o = await (await get('/api/homelab', e)).json();
  assert.equal(o.stale, true);
  assert.equal(o.servers[0].id, 'monitoring');
  // and with nothing kept at all: an honest 503
  cache.clear();
  const res = await get('/api/homelab', e);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'monitoring is not answering' });

  // http only for local dev; an unknown server's history is never asked for
  assert.equal((await get('/api/homelab', env({ MONITORING_API_URL: 'http://api.huismax.example' }))).status, 503);
  up = true;
  asked.length = 0;
  assert.equal((await get('/api/homelab/somewhere-else/history', e)).status, 404);
  assert.ok(!asked.some((a) => a.includes('somewhere-else')));
  delete (globalThis as { caches?: unknown }).caches;
});
