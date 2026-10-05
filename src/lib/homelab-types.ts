/**
 * The homelab data as the public pages see it (GET /api/homelab, /api/homelab/:id/history). Shared by the worker
 * (src/lib/homelab.ts builds it from the Monitoring API or the demo data) and the browser (client/pages/homelab.ts).
 * Types only: nothing here may import the worker or the DOM.
 *
 * Bytes are bytes, rates are bytes per second, percentages are 0–100, times are ISO strings (history: epoch ms).
 * Never in here: addresses (IP, MAC), ports, credentials. The worker drops them, whatever the API sends.
 */

export type Health = 'up' | 'degraded' | 'down';
export type Usage = { used: number; total: number };
export type Disk = Usage & { mount: string; label: string; fs: string };
export type Rate = { rx: number; tx: number };

export type ContainerState = 'running' | 'paused' | 'restarting' | 'created' | 'exited' | 'dead' | 'unknown';
export type Container = {
  name: string;
  image: string;
  state: ContainerState;
  /** Docker's own words, e.g. "Up 3 days" */
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | null;
  cpu: number | null;
  memory: number | null;
  memoryLimit: number | null;
  restarts: number | null;
  startedAt: string | null;
};

export type SystemInfo = {
  hostname: string;
  os: string;
  kernel: string;
  arch: string;
  cpuModel: string;
  cores: number | null;
  threads: number | null;
  virtualization: string;
  bootTime: string | null;
  docker: string;
};

export type Iface = Rate & { name: string; speedMbps: number | null; up: boolean | null };

export type Server = {
  id: string;
  name: string;
  role: string;
  health: Health;
  /** why it isn't simply "up", in a few words each */
  issues: string[];
  lastSeen: string | null;
  uptime: number | null;
  cpu: { usage: number | null; load: [number, number, number] | null; temperature: number | null };
  memory: Usage | null;
  swap: Usage | null;
  storage: Disk[];
  network: Rate | null;
  interfaces: Iface[];
  containers: Container[];
  system: SystemInfo;
  /** the last hour, a few dozen points: the cards' sparklines */
  trend: { cpu: number[]; memory: number[] };
};

/**
 * `source`: 'api' (MONITORING_API_URL) or 'demo' (none set yet). `fetchedAt`: when the worker got it.
 * `stale`: the API isn't answering, this is the last good answer (from `fetchedAt`).
 */
export type Meta = { source: 'api' | 'demo'; fetchedAt: string; stale: boolean };
export type Overview = Meta & { health: Health; servers: Server[] };

export const RANGES = ['1h', '24h', '7d'] as const;
export type Range = (typeof RANGES)[number];
export type Point = { t: number; cpu: number | null; memory: number | null; rx: number | null; tx: number | null };
export type History = Meta & { id: string; range: Range; points: Point[] };

/** The self-hosted sites on /homelab: reachable or not, checked by the worker. */
export type ServiceStatus = { id: string; up: boolean; ms: number | null };
