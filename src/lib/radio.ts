import type { Env } from './env';

/**
 * The huismax dj channel's own radio: Icecast at radio.huismax.com. A source (BUTT) connected to the /live.mp3 mount
 * is what makes the channel live, so going on air is just starting the stream, and stopping it ends the session.
 * Browsers play the stream straight from Icecast; the worker only reads Icecast's public status.
 */

export type RadioStatus = { live: boolean; listeners: number; startedAt: string | null };

const OFF: RadioStatus = { live: false, listeners: 0, startedAt: null };
/** Seconds one status is shared at the edge, so every visitor's poll doesn't reach Icecast. */
const TTL = 10;
/** A slow or unreachable radio must not hold up a page. */
const TIMEOUT = 2500;

export const radioStreamUrl = (env: Env) => env.RADIO_STREAM_URL || 'https://radio.huismax.com/live.mp3';
const statusUrl = (env: Env) => env.RADIO_STATUS_URL || new URL('/status-json.xsl', radioStreamUrl(env)).href;

/** "2026-09-28T22:32:53-0700" (Icecast) → ISO 8601; null when it isn't a date. */
function iso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Icecast's status-json.xsl → whether `mount` is on air. `icestats.source` is an object for one mount, a list for
 * several, and missing when nothing streams. A source's listenurl carries Icecast's own host, so only its path counts.
 */
export function parseIcecast(json: unknown, mount: string): RadioStatus {
  const src = (json as { icestats?: { source?: unknown } } | null)?.icestats?.source;
  const sources = (Array.isArray(src) ? src : src ? [src] : []) as Record<string, unknown>[];
  for (const s of sources) {
    let path = '';
    try {
      path = new URL(String(s?.listenurl)).pathname;
    } catch {
      continue;
    }
    if (path !== mount) continue;
    const n = Number(s.listeners);
    return { live: true, listeners: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, startedAt: iso(s.stream_start_iso8601) };
  }
  return OFF;
}

async function load(env: Env): Promise<RadioStatus> {
  try {
    const res = await fetch(statusUrl(env), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) {
      console.error('radio: status answered', res.status);
      return OFF;
    }
    return parseIcecast(await res.json(), new URL(radioStreamUrl(env)).pathname);
  } catch (e) {
    console.error('radio: status unreachable', (e as Error).message);
    return OFF;
  }
}

/** Is the radio on air, and how many are listening. Never throws: anything unclear is "off air". */
export async function radioStatus(env: Env): Promise<RadioStatus> {
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
  const key = new Request(statusUrl(env));
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return (await hit.json()) as RadioStatus;
  const status = await load(env);
  await cache
    ?.put(key, new Response(JSON.stringify(status), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}` } }))
    .catch(() => {});
  return status;
}
