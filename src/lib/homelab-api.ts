/**
 * The Huismax Monitoring API (api.huismax.com, FastAPI over Prometheus) → the shape src/lib/homelab.ts reads.
 * Pure functions: they only rearrange what the endpoints answered. Whatever comes out still goes through readServers()
 * / readHistory(), which keep only known fields and mask addresses: `instance`, `network.ipv4` and the Prometheus
 * labels in /history are never even copied across.
 *
 *   /servers       id, status, cpu_percent, memory_percent, memory_total_bytes, uptime_seconds
 *   /storage       filesystems[]: server, mountpoint, filesystem, used_bytes, total_bytes
 *   /network       network[]: server, rx_bytes_per_second, tx_bytes_per_second
 *   /containers    containers[]: name, status, cpu_percent, memory_bytes (no server: see dockerHost)
 *   /system-info   systems[]: id, name, role, os{…}, cpu{…}, memory{…}, docker{…}, virtualization, hypervisor
 *   /history/{cpu|memory|network_rx|network_tx}?server=&hours=   series[0].values[]: timestamp (s), value
 */

type O = Record<string, unknown>;
const obj = (v: unknown): O => (v && typeof v === 'object' && !Array.isArray(v) ? (v as O) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const GiB = 1024 ** 3;

/** The API's words for a server's state, in ours (anything else: let the numbers decide). */
function status(v: unknown) {
  const w = s(v).toLowerCase();
  if (['online', 'up', 'healthy', 'ok'].includes(w)) return 'up';
  if (['degraded', 'warning'].includes(w)) return 'degraded';
  if (['offline', 'down', 'unreachable', 'error'].includes(w)) return 'down';
  return '';
}

/** /boot and /boot/efi are there on every machine and say nothing about room for data. */
const isBoot = (mount: string) => mount === '/boot' || mount.startsWith('/boot/');

/**
 * Containers carry no server. They belong to the one the API says runs Docker (system-info with a docker engine);
 * failing that the only server, one with "docker" in its id, or else the first.
 */
export function dockerHost(serverIds: string[], systems: O[]): string | null {
  const withDocker = systems.filter((x) => s(obj(x.docker).engine) && serverIds.includes(s(x.id)));
  if (withDocker.length === 1) return s(withDocker[0].id);
  return serverIds.length === 1 ? serverIds[0] : (serverIds.find((id) => /docker/i.test(id)) ?? serverIds[0] ?? null);
}

export type Parts = { servers: unknown; storage: unknown; network: unknown; containers: unknown; systems: unknown };

/** The five answers, as one `{ servers: [...] }` in the site's own shape. */
export function combine(p: Parts) {
  const sv = obj(p.servers);
  const list = arr(sv.servers).map(obj).filter((x) => s(x.id));
  const ids = list.map((x) => s(x.id));
  const at = s(sv.updated_at) || new Date().toISOString();
  const systems = arr(obj(p.systems).systems).map(obj);
  const host = dockerHost(ids, systems);
  const fs = arr(obj(p.storage).filesystems).map(obj);
  const net = arr(obj(p.network).network).map(obj);
  const containers = arr(obj(p.containers).containers).map(obj);
  return {
    generatedAt: at,
    servers: list.map((x) => {
      const id = s(x.id);
      const sys = systems.find((y) => s(y.id) === id) ?? {};
      const os = obj(sys.os), cpu = obj(sys.cpu), mem = obj(sys.memory), docker = obj(sys.docker);
      const total = n(x.memory_total_bytes) ?? (n(mem.total_gib) !== null ? n(mem.total_gib)! * GiB : null);
      const used = total !== null && n(x.memory_percent) !== null ? (total * n(x.memory_percent)!) / 100 : null;
      const traffic = net.find((y) => s(y.server) === id);
      const iface = s(obj(sys.network).primary_interface);
      const uptime = n(x.uptime_seconds);
      const virt = [s(sys.virtualization), s(sys.hypervisor)].filter(Boolean).join(' · ');
      return {
        id,
        name: s(sys.name) || id,
        role: s(sys.role),
        status: status(x.status),
        // the API's own time for this answer: a server it can't reach shows up as offline, not as old
        lastSeen: at,
        uptimeSeconds: uptime,
        cpu: { usagePercent: n(x.cpu_percent) },
        memory: used !== null ? { usedBytes: used, totalBytes: total } : null,
        storage: fs
          .filter((f) => s(f.server) === id && !isBoot(s(f.mountpoint)))
          .map((f) => ({ mount: s(f.mountpoint), label: '', fs: s(f.filesystem), usedBytes: n(f.used_bytes), totalBytes: n(f.total_bytes) })),
        network: traffic ? { rxBytesPerSec: n(traffic.rx_bytes_per_second), txBytesPerSec: n(traffic.tx_bytes_per_second) } : null,
        interfaces: traffic && iface ? [{ name: iface, rxBytesPerSec: n(traffic.rx_bytes_per_second), txBytesPerSec: n(traffic.tx_bytes_per_second) }] : [],
        system: {
          hostname: s(sys.hostname),
          os: [s(os.name), s(os.version)].filter(Boolean).join(' '),
          kernel: s(os.kernel),
          arch: s(os.architecture),
          cpuModel: s(cpu.model),
          cores: n(cpu.cores),
          threads: n(cpu.vcpus) ?? (n(cpu.cores) !== null && n(cpu.threads_per_core) !== null ? n(cpu.cores)! * n(cpu.threads_per_core)! * (n(cpu.sockets) ?? 1) : null),
          virtualization: virt,
          bootTime: uptime !== null ? new Date(Date.parse(at) - uptime * 1000).toISOString() : null,
          dockerVersion: s(docker.engine),
        },
        containers:
          id === host || containers.some((c) => s(c.server) === id)
            ? containers
                .filter((c) => (s(c.server) ? s(c.server) === id : id === host))
                .map((c) => ({ name: s(c.name), image: s(c.image), state: s(c.state) || s(c.status), status: '', health: s(c.health), cpuPercent: n(c.cpu_percent), memoryBytes: n(c.memory_bytes) }))
            : [],
      };
    }),
  };
}

export const METRICS = ['cpu', 'memory', 'network_rx', 'network_tx'] as const;
export const HOURS = { '1h': 1, '24h': 24, '7d': 168 } as const;

/** /history answers for the four metrics, side by side by timestamp, as `{ points: [{ t, cpu, memory, rx, tx }] }`. */
export function mergeHistory(answers: Record<(typeof METRICS)[number], unknown>) {
  const at = new Map<number, { t: number; cpu: number | null; memory: number | null; rx: number | null; tx: number | null }>();
  const key = { cpu: 'cpu', memory: 'memory', network_rx: 'rx', network_tx: 'tx' } as const;
  for (const m of METRICS) {
    // one server asked for: the first series is it
    const values = arr(obj(arr(obj(answers[m]).series)[0]).values).map(obj);
    for (const v of values) {
      const t = n(v.timestamp);
      if (t === null) continue;
      const ms = Math.round(t * 1000);
      const point = at.get(ms) ?? { t: ms, cpu: null, memory: null, rx: null, tx: null };
      point[key[m]] = n(v.value);
      at.set(ms, point);
    }
  }
  return { points: [...at.values()].sort((a, b) => a.t - b.t) };
}
