import type { Env } from './env';
import type { Container, ContainerState, Disk, Health, History, Iface, Overview, Point, Range, Server, ServiceStatus, SystemInfo, Usage } from './homelab-types';

/**
 * /homelab's data. The worker asks the Monitoring API (MONITORING_API_URL, contract in MONITORING_API.md) and hands
 * the pages its own cleaned-up version: only the fields in homelab-types.ts, numbers clamped, addresses masked.
 * Without MONITORING_API_URL it serves demo data of the same shape, through the same cleaning, marked `demo`.
 * The browser never sees the API's address or token. Answers are kept at the edge for a few seconds, and the last
 * good one for a week: when the API stops answering, pages get that one, marked `stale`.
 */

const TIMEOUT = 5000;
const MAX_BODY = 4_000_000;
/** no report for this long: the server counts as down */
export const STALE_AFTER = 3 * 60_000;
const LAST_GOOD = 7 * 86400;
const LOCAL = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

export class MonitoringError extends Error {}

/* ——— where the data comes from ——— */

type Source = { kind: 'api' | 'demo'; servers(): Promise<unknown>; history(id: string, range: Range): Promise<unknown> };

/** The API's base URL: https, or (local dev only) http. Null when unset: demo data. */
export function monitoringBase(env: Env, self: URL): string | null {
  const raw = env.MONITORING_API_URL?.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MonitoringError('MONITORING_API_URL is not a URL');
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOCAL.test(self.hostname))) throw new MonitoringError('MONITORING_API_URL must be https');
  return u.href.replace(/\/+$/, '');
}

function source(env: Env, self: URL): Source {
  const base = monitoringBase(env, self);
  if (!base) return { kind: 'demo', servers: async () => demoServers(Date.now()), history: async (id, range) => demoHistory(id, range, Date.now()) };
  const get = async (path: string) => {
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'huismax.com/homelab' };
    if (env.MONITORING_API_TOKEN?.trim()) headers.Authorization = `Bearer ${env.MONITORING_API_TOKEN.trim()}`;
    const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new MonitoringError(`api answered ${res.status} for ${path}`);
    const text = await res.text();
    if (text.length > MAX_BODY) throw new MonitoringError(`api answer too large for ${path}`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new MonitoringError(`api answer is not JSON for ${path}`);
    }
  };
  return {
    kind: 'api',
    servers: () => get('/v1/servers'),
    history: (id, range) => get(`/v1/servers/${encodeURIComponent(id)}/history?range=${range}`),
  };
}

/* ——— the edge cache, with the last good answer to fall back on ——— */

export type Cached<T> = { data: T; fetchedAt: string; stale: boolean };
export type Cacher = <T>(key: string, ttl: number, load: () => Promise<T>) => Promise<Cached<T>>;

export function cacher(origin: string, waitUntil: (p: Promise<unknown>) => void): Cacher {
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
  const req = (k: string) => new Request(`${origin}/__homelab/${encodeURIComponent(k)}`);
  const res = (body: string, ttl: number) => new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
  const read = async <T>(r: Response | undefined | null) => (r ? await r.json<{ data: T; fetchedAt: string }>().catch(() => null) : null);
  return async <T>(key: string, ttl: number, load: () => Promise<T>): Promise<Cached<T>> => {
    const hit = await read<T>(cache && (await cache.match(req(key))));
    if (hit) return { ...hit, stale: false };
    try {
      const fresh = { data: await load(), fetchedAt: new Date().toISOString() };
      if (cache) {
        const body = JSON.stringify(fresh);
        waitUntil(Promise.all([cache.put(req(key), res(body, ttl)), cache.put(req(`${key}#last`), res(body, LAST_GOOD))]));
      }
      return { ...fresh, stale: false };
    } catch (e) {
      const last = await read<T>(cache && (await cache.match(req(`${key}#last`))));
      if (last) return { ...last, stale: true };
      throw e;
    }
  };
}

/* ——— cleaning up what the API sends ——— */

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const pct = (v: unknown) => num(v, 0, 100);
/** Addresses never reach a public page, whatever field they arrive in. */
const MASK = /\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?/gi;
export const text = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(MASK, '•••').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const time = (v: unknown): number | null => {
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : typeof v === 'string' ? (/^\d+$/.test(v) ? Number(v) * (v.length <= 10 ? 1000 : 1) : Date.parse(v)) : NaN;
  return Number.isFinite(t) && t > 0 ? t : null;
};
const iso = (v: unknown) => {
  const t = time(v);
  return t === null ? null : new Date(t).toISOString();
};
const usage = (v: unknown): Usage | null => {
  const o = obj(v);
  const used = num(o.usedBytes ?? o.used), total = num(o.totalBytes ?? o.total);
  return used !== null && total ? { used: Math.min(used, total), total } : null;
};
export const SERVER_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const STATES: ContainerState[] = ['running', 'paused', 'restarting', 'created', 'exited', 'dead'];

const disk = (v: unknown): Disk | null => {
  const o = obj(v);
  const u = usage(o);
  const mount = text(o.mount ?? o.path, 60);
  return u && mount ? { ...u, mount, label: text(o.label ?? o.name, 40), fs: text(o.fs ?? o.type, 20) } : null;
};
const iface = (v: unknown): Iface | null => {
  const o = obj(v);
  const name = text(o.name, 30);
  if (!name) return null;
  return { name, rx: num(o.rxBytesPerSec ?? o.rx) ?? 0, tx: num(o.txBytesPerSec ?? o.tx) ?? 0, speedMbps: num(o.speedMbps), up: typeof o.up === 'boolean' ? o.up : null };
};
const container = (v: unknown): Container | null => {
  const o = obj(v);
  const name = text(o.name, 60).replace(/^\//, '');
  if (!name) return null;
  const state = text(o.state, 20).toLowerCase() as ContainerState;
  const health = text(o.health, 20).toLowerCase();
  return {
    name,
    image: text(o.image, 100),
    state: STATES.includes(state) ? state : 'unknown',
    status: text(o.status, 60),
    health: health === 'healthy' || health === 'unhealthy' || health === 'starting' ? health : null,
    cpu: num(o.cpuPercent ?? o.cpu, 0, 100_000),
    memory: num(o.memoryBytes ?? o.memory),
    memoryLimit: num(o.memoryLimitBytes ?? o.memoryLimit),
    restarts: num(o.restartCount ?? o.restarts),
    startedAt: iso(o.startedAt),
  };
};
const system = (v: unknown): SystemInfo => {
  const o = obj(v);
  return {
    hostname: text(o.hostname, 60),
    os: text(o.os, 80),
    kernel: text(o.kernel, 80),
    arch: text(o.arch, 20),
    cpuModel: text(o.cpuModel, 80),
    cores: num(o.cores, 0, 4096),
    threads: num(o.threads, 0, 8192),
    virtualization: text(o.virtualization, 40),
    bootTime: iso(o.bootTime),
    docker: text(o.dockerVersion ?? o.docker, 40),
  };
};

/** A server from the API, as far as it can be read; health comes later (it depends on how old the report is). */
export type ServerBase = Omit<Server, 'health' | 'issues' | 'trend'> & { status: Health | null };

export function readServer(v: unknown): ServerBase | null {
  const o = obj(v);
  const id = text(o.id, 40);
  if (!SERVER_ID.test(id)) return null;
  const cpu = obj(o.cpu), net = obj(o.network);
  const load = arr(cpu.load).slice(0, 3).map((x) => num(x, 0, 10_000));
  const status = text(o.status, 20).toLowerCase();
  const rx = num(net.rxBytesPerSec ?? net.rx), tx = num(net.txBytesPerSec ?? net.tx);
  return {
    id,
    name: text(o.name, 40) || id,
    role: text(o.role, 40),
    status: status === 'up' || status === 'degraded' || status === 'down' ? status : null,
    lastSeen: iso(o.lastSeen),
    uptime: num(o.uptimeSeconds ?? o.uptime),
    cpu: {
      usage: pct(cpu.usagePercent ?? cpu.usage),
      load: load.length === 3 && load.every((x) => x !== null) ? (load as [number, number, number]) : null,
      temperature: num(cpu.temperatureC ?? cpu.temperature, -50, 200),
    },
    memory: usage(o.memory),
    swap: usage(o.swap),
    storage: arr(o.storage).map(disk).filter((d): d is Disk => !!d).slice(0, 24),
    network: rx === null && tx === null ? null : { rx: rx ?? 0, tx: tx ?? 0 },
    interfaces: arr(o.interfaces).map(iface).filter((d): d is Iface => !!d).slice(0, 24),
    containers: arr(o.containers).map(container).filter((d): d is Container => !!d).slice(0, 300),
    system: system(o.system),
  };
}

export function readServers(v: unknown): ServerBase[] {
  const seen = new Set<string>();
  return arr(obj(v).servers)
    .map(readServer)
    .filter((s): s is ServerBase => !!s && !seen.has(s.id) && !!seen.add(s.id))
    .slice(0, 50);
}

export function readHistory(v: unknown): Point[] {
  return arr(obj(v).points)
    .map((p) => {
      const o = obj(p);
      const t = time(o.t ?? o.time);
      return t === null ? null : { t, cpu: pct(o.cpu), memory: pct(o.memory), rx: num(o.rx), tx: num(o.tx) };
    })
    .filter((p): p is Point => !!p)
    .sort((a, b) => a.t - b.t)
    .slice(-2000);
}

/* ——— health ——— */

const share = (u: { used: number; total: number }) => u.used / u.total;
const ago = (ms: number) => (ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : ms < 172_800_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} days`);

/** Down when it stopped reporting (or says so); degraded when something is hot, full or unhealthy. */
export function assess(s: ServerBase, now: number): { health: Health; issues: string[] } {
  const age = s.lastSeen ? now - Date.parse(s.lastSeen) : Infinity;
  if (age > STALE_AFTER) return { health: 'down', issues: [s.lastSeen ? `no report for ${ago(age)}` : 'no report yet'] };
  if (s.status === 'down') return { health: 'down', issues: ['reported down'] };
  const issues: string[] = [];
  if ((s.cpu.usage ?? 0) >= 90) issues.push(`cpu at ${Math.round(s.cpu.usage!)}%`);
  if (s.memory && share(s.memory) >= 0.9) issues.push(`memory ${Math.round(share(s.memory) * 100)}% used`);
  for (const d of s.storage) if (share(d) >= 0.9) issues.push(`${d.label || d.mount} ${Math.round(share(d) * 100)}% full`);
  for (const c of s.containers) {
    if (c.health === 'unhealthy') issues.push(`${c.name} unhealthy`);
    else if (c.state === 'restarting' || c.state === 'dead') issues.push(`${c.name} ${c.state}`);
  }
  if (s.status === 'degraded' && !issues.length) issues.push('reported degraded');
  return { health: issues.length ? 'degraded' : 'up', issues: issues.slice(0, 8) };
}

export function overall(servers: { health: Health }[]): Health {
  if (!servers.length || servers.every((s) => s.health === 'down')) return 'down';
  return servers.every((s) => s.health === 'up') ? 'up' : 'degraded';
}

/** A sparkline's worth (about 30 points) of the last hour. */
function trend(points: Point[]) {
  const pick = (k: 'cpu' | 'memory') => {
    const vals = points.map((p) => p[k]).filter((x): x is number => x !== null);
    const n = Math.min(30, vals.length);
    return Array.from({ length: n }, (_, i) => {
      const part = vals.slice(Math.floor((i * vals.length) / n), Math.floor(((i + 1) * vals.length) / n));
      return Math.round((part.reduce((a, b) => a + b, 0) / part.length) * 10) / 10;
    });
  };
  return { cpu: pick('cpu'), memory: pick('memory') };
}

/* ——— what the pages get ——— */

const HISTORY_TTL: Record<Range, number> = { '1h': 60, '24h': 300, '7d': 900 };

const snapshot = (src: Source, cached: Cacher) => cached(`${src.kind}:servers`, 15, async () => readServers(await src.servers()));
const pointsOf = (src: Source, cached: Cacher, id: string, range: Range) =>
  cached(`${src.kind}:history:${id}:${range}`, HISTORY_TTL[range], async () => readHistory(await src.history(id, range)));

/** Every server, assessed, with its last hour as a sparkline. Throws when the API fails and nothing was kept. */
export async function overview(env: Env, self: URL, cached: Cacher): Promise<Overview> {
  const src = source(env, self);
  const snap = await snapshot(src, cached);
  const now = Date.now();
  const servers = await Promise.all(
    snap.data.map(async ({ status: _status, ...s }) => {
      // a missing sparkline is no reason to fail the page
      const points = await pointsOf(src, cached, s.id, '1h').then((h) => h.data).catch(() => []);
      return { ...s, ...assess({ ...s, status: _status }, now), trend: trend(points) } satisfies Server;
    }),
  );
  return { source: src.kind, fetchedAt: snap.fetchedAt, stale: snap.stale, health: overall(servers), servers };
}

/** One server's history; null when there's no such server. */
export async function history(env: Env, self: URL, cached: Cacher, id: string, range: Range): Promise<History | null> {
  const src = source(env, self);
  // only servers the API itself lists: the endpoint never passes made-up ids on
  if (!(await snapshot(src, cached)).data.some((s) => s.id === id)) return null;
  const h = await pointsOf(src, cached, id, range);
  return { source: src.kind, fetchedAt: h.fetchedAt, stale: h.stale, id, range, points: h.data };
}

/* ——— the self-hosted sites ——— */

/** Up = the site answers at all (a login page or a redirect counts); down = no answer in 5 s, or a 5xx. */
export async function checkServices(list: { id: string; url: string }[]): Promise<ServiceStatus[]> {
  return Promise.all(
    list.map(async ({ id, url }) => {
      const t0 = Date.now();
      try {
        const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'huismax.com/homelab status check' }, signal: AbortSignal.timeout(TIMEOUT) });
        await res.body?.cancel();
        return { id, up: res.status < 500, ms: Date.now() - t0 };
      } catch {
        return { id, up: false, ms: null };
      }
    }),
  );
}

/* ——— demo data: the API's own shape, so it goes through the same reading as the real thing ——— */

const GiB = 1024 ** 3, TiB = 1024 ** 4, MiB = 1024 ** 2;
const wave = (t: number, period: number, phase = 0) => Math.sin((t / period) * Math.PI * 2 + phase);
/** steady per minute, different per seed: the jitter of a real graph */
const jitter = (seed: number, t: number) => {
  let x = Math.imul(seed * 7919 + Math.floor(t / 60_000), 2654435761);
  x ^= x >>> 15;
  return ((x >>> 0) % 1000) / 1000 - 0.5;
};

type DemoBox = {
  id: string; name: string; role: string; seed: number; cpu: [number, number]; mem: [number, number]; net: number; up: number;
  system: Record<string, unknown>; storage: { mount: string; label: string; fs: string; total: number; used: number }[];
  containers: { name: string; image: string; state?: string; health?: string; days?: number; mem: number }[];
};
const DEMO: DemoBox[] = [
  {
    id: 'atlas', name: 'atlas', role: 'hypervisor', seed: 1, cpu: [24, 12], mem: [58, 64 * GiB], net: 2.1 * MiB, up: 41 * 86400,
    system: { hostname: 'atlas', os: 'Proxmox VE 8.2', kernel: '6.8.12-4-pve', arch: 'x86_64', cpuModel: 'AMD Ryzen 9 5950X', cores: 16, threads: 32, virtualization: 'bare metal', dockerVersion: '' },
    storage: [
      { mount: '/', label: 'system', fs: 'ext4', total: 476 * GiB, used: 0.34 },
      { mount: '/mnt/tank', label: 'tank', fs: 'zfs', total: 7.3 * TiB, used: 0.62 },
    ],
    containers: [],
  },
  {
    id: 'vault', name: 'vault', role: 'storage', seed: 2, cpu: [9, 6], mem: [71, 32 * GiB], net: 6.4 * MiB, up: 12 * 86400,
    system: { hostname: 'vault', os: 'Debian 12', kernel: '6.1.0-25-amd64', arch: 'x86_64', cpuModel: 'Intel Core i5-12400', cores: 6, threads: 12, virtualization: 'kvm', dockerVersion: '27.3.1' },
    storage: [
      { mount: '/', label: 'system', fs: 'ext4', total: 64 * GiB, used: 0.41 },
      { mount: '/srv/data', label: 'data', fs: 'btrfs', total: 16 * TiB, used: 0.92 },
    ],
    containers: [
      { name: 'nextcloud', image: 'nextcloud:29-apache', days: 12, mem: 640 * MiB },
      { name: 'nextcloud-db', image: 'postgres:16', days: 12, mem: 310 * MiB },
      { name: 'redis', image: 'redis:7-alpine', days: 12, mem: 24 * MiB },
      { name: 'restic-backup', image: 'restic/restic:0.17', state: 'exited', mem: 0 },
    ],
  },
  {
    id: 'edge', name: 'edge', role: 'docker host', seed: 3, cpu: [31, 18], mem: [63, 16 * GiB], net: 1.2 * MiB, up: 5 * 86400 + 7 * 3600,
    system: { hostname: 'edge', os: 'Ubuntu 24.04 LTS', kernel: '6.8.0-45-generic', arch: 'x86_64', cpuModel: 'Intel Core i7-8700T', cores: 6, threads: 12, virtualization: 'kvm', dockerVersion: '27.3.1' },
    storage: [{ mount: '/', label: 'system', fs: 'ext4', total: 476 * GiB, used: 0.57 }],
    containers: [
      { name: 'cloudflared', image: 'cloudflare/cloudflared:2024.9.1', days: 5, mem: 38 * MiB },
      { name: 'mirotalk', image: 'mirotalk/sfu:latest', days: 5, mem: 410 * MiB },
      { name: 'erpnext', image: 'frappe/erpnext:v15', days: 5, mem: 1.4 * GiB },
      { name: 'erpnext-db', image: 'mariadb:10.6', days: 5, mem: 520 * MiB },
      { name: 'odoo', image: 'odoo:17', days: 5, mem: 780 * MiB },
      { name: 'odoo-db', image: 'postgres:15', days: 5, mem: 260 * MiB },
      { name: 'grafana', image: 'grafana/grafana:11.2.0', days: 2, mem: 120 * MiB },
      { name: 'prometheus', image: 'prom/prometheus:v2.54.1', days: 5, mem: 690 * MiB },
      { name: 'node-exporter', image: 'prom/node-exporter:v1.8.2', days: 5, mem: 18 * MiB },
      { name: 'uptime-probe', image: 'louislam/uptime-kuma:1', health: 'unhealthy', days: 1, mem: 96 * MiB },
    ],
  },
];

const demoAt = (b: DemoBox, t: number) => ({
  cpu: Math.min(100, Math.max(1, b.cpu[0] + b.cpu[1] * (0.6 * wave(t, 6 * 3_600_000, b.seed) + 0.4 * wave(t, 23 * 60_000, b.seed * 2)) + 9 * jitter(b.seed, t))),
  memory: Math.min(99, Math.max(5, b.mem[0] + 4 * wave(t, 9 * 3_600_000, b.seed) + 1.5 * jitter(b.seed + 10, t))),
  rx: Math.max(0, b.net * (1 + 0.7 * wave(t, 2 * 3_600_000, b.seed) + 0.5 * jitter(b.seed + 20, t))),
  tx: Math.max(0, b.net * 0.35 * (1 + 0.8 * wave(t, 3 * 3_600_000, b.seed + 1) + 0.6 * jitter(b.seed + 30, t))),
});

export function demoServers(now: number) {
  return {
    generatedAt: new Date(now).toISOString(),
    servers: DEMO.map((b) => {
      const v = demoAt(b, now);
      return {
        id: b.id,
        name: b.name,
        role: b.role,
        lastSeen: new Date(now - 4000).toISOString(),
        uptimeSeconds: b.up + Math.floor((now / 1000) % 86400),
        cpu: { usagePercent: v.cpu, load: [1, 5, 15].map((m, i) => Math.round((v.cpu / 100) * Number(b.system.threads) * (1 - i * 0.12) * 100) / 100), temperatureC: Math.round(38 + v.cpu * 0.35) },
        memory: { usedBytes: (v.memory / 100) * b.mem[1], totalBytes: b.mem[1] },
        swap: { usedBytes: 0.08 * 8 * GiB, totalBytes: 8 * GiB },
        storage: b.storage.map((d) => ({ mount: d.mount, label: d.label, fs: d.fs, totalBytes: d.total, usedBytes: d.total * d.used })),
        network: { rxBytesPerSec: v.rx, txBytesPerSec: v.tx },
        interfaces: [
          { name: b.id === 'atlas' ? 'vmbr0' : 'eth0', rxBytesPerSec: v.rx, txBytesPerSec: v.tx, speedMbps: b.id === 'vault' ? 10000 : 1000, up: true },
          ...(b.id === 'atlas' ? [{ name: 'enp6s0', rxBytesPerSec: v.rx * 0.98, txBytesPerSec: v.tx * 0.97, speedMbps: 2500, up: true }] : []),
        ],
        system: { ...b.system, bootTime: new Date(now - b.up * 1000).toISOString() },
        containers: b.containers.map((c, i) => {
          const running = !c.state;
          const started = now - (c.days ?? 0) * 86_400_000 - i * 3_600_000;
          return {
            name: c.name,
            image: c.image,
            state: c.state ?? 'running',
            status: running ? `Up ${c.days} day${c.days === 1 ? '' : 's'}` : 'Exited (0) 6 hours ago',
            health: c.health ?? (running ? 'healthy' : null),
            cpuPercent: running ? Math.max(0.1, Math.round((v.cpu / 12) * (0.4 + ((i * 37) % 10) / 10) * 10) / 10) : 0,
            memoryBytes: c.mem,
            memoryLimitBytes: b.mem[1],
            restartCount: c.health === 'unhealthy' ? 3 : 0,
            startedAt: new Date(started).toISOString(),
          };
        }),
      };
    }),
  };
}

const STEP: Record<Range, number> = { '1h': 60_000, '24h': 15 * 60_000, '7d': 3_600_000 };
const SPAN: Record<Range, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000 };

export function demoHistory(id: string, range: Range, now: number) {
  const b = DEMO.find((x) => x.id === id);
  if (!b) throw new MonitoringError(`no server ${id}`);
  const step = STEP[range];
  const end = Math.floor(now / step) * step;
  const points = [];
  for (let t = end - SPAN[range]; t <= end; t += step) {
    const v = demoAt(b, t);
    points.push({ t: new Date(t).toISOString(), cpu: Math.round(v.cpu * 10) / 10, memory: Math.round(v.memory * 10) / 10, rx: Math.round(v.rx), tx: Math.round(v.tx) });
  }
  return { range, points };
}
