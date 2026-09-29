import type { Env } from './env';
import { ipBucket } from './reply';

/**
 * Live chat: POST /api/chat (client/lib/assistant-api.ts). The question goes on to the chat bridge on Max's own
 * server (bridge/, reached through a Cloudflare Tunnel at CHAT_BRIDGE_URL), which asks OpenClaw; its event stream
 * comes straight back. This side holds only CHAT_BRIDGE_SECRET: the OpenClaw token never leaves that server.
 * Rate limits live in the bridge (in memory, exact, and no KV writes), keyed by the hashed visitor id sent here.
 */

const MAX_MESSAGE = 2000;
const HISTORY_LIMIT = 8;
const MAX_BODY = 256 * 1024;
/** The bridge answers or gives up within 80 s (its first-word timeout); this only covers a hung tunnel. */
const BRIDGE_WAIT = 85_000;

/** What a visitor can be told. The chat turns the status into its own sentence; none of the bridge's text passes. */
const ERRORS: Record<number, string> = {
  400: 'bad request', 413: 'too large', 415: 'expected json', 429: 'too many requests',
  502: 'unavailable', 503: 'unavailable', 504: 'timeout',
};

const STREAM_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff' };

const fail = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: ERRORS[status] }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * CHAT_BRIDGE_URL, when it's one this backend may call: https (the tunnel). Plain http only to this machine, and
 * only while the site itself is local (`self`: PUBLIC_ORIGIN under wrangler dev), so production never calls a
 * loopback or LAN address.
 */
export function bridgeUrl(env: Env, self: URL): string | null {
  try {
    const u = new URL(env.CHAT_BRIDGE_URL ?? '');
    if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL.has(u.hostname) && LOCAL.has(self.hostname))) return u.href;
  } catch {
    /* not a URL */
  }
  return null;
}

/** The visitor as the bridge counts them: a hash of their address (per /64 for IPv6), never the address. */
export async function visitorId(ip: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chat:${ipBucket(ip)}`));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function chat(env: Env, req: Request): Promise<Response> {
  // wrangler dev rewrites the request URL to the production host; PUBLIC_ORIGIN says where the site really is
  const bridge = bridgeUrl(env, new URL(env.PUBLIC_ORIGIN || req.url));
  if (!bridge || !env.CHAT_BRIDGE_SECRET) {
    console.error('chat: CHAT_BRIDGE_URL (https) and CHAT_BRIDGE_SECRET must both be set');
    return fail(503);
  }
  if (!/^application\/json\b/i.test(req.headers.get('Content-Type') ?? '')) return fail(415);
  if (Number(req.headers.get('Content-Length')) > MAX_BODY) return fail(413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413);
  let b: Record<string, unknown> | null = null;
  try {
    b = JSON.parse(raw);
  } catch {
    /* not JSON */
  }
  const message = typeof b?.message === 'string' ? b.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE) return fail(400);
  // the bridge cleans the history properly; this only keeps what it would use
  const history = Array.isArray(b!.history) ? b!.history.slice(-HISTORY_LIMIT) : [];

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BRIDGE_WAIT);
  // a visitor who leaves (Stop, closed tab) stops the bridge, and so OpenClaw
  req.signal?.addEventListener('abort', () => ctl.abort());
  let res: Response;
  try {
    res = await fetch(bridge, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CHAT_BRIDGE_SECRET}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Chat-Visitor': await visitorId(req.headers.get('CF-Connecting-IP') ?? 'local'),
      },
      body: JSON.stringify({ message, history }),
      // a redirect (a login page in front of the tunnel, say) is a misconfiguration, not an answer
      redirect: 'manual',
      signal: ctl.signal,
    });
  } catch (e) {
    console.error('chat: bridge unreachable', (e as Error).message);
    return fail(ctl.signal.aborted && !req.signal?.aborted ? 504 : 503);
  } finally {
    clearTimeout(timer);
  }

  if (res.ok && res.body && (res.headers.get('Content-Type') ?? '').includes('text/event-stream')) {
    return new Response(res.body, { headers: STREAM_HEADERS });
  }
  res.body?.cancel().catch(() => {});
  if (res.status === 401) console.error('chat: the bridge refused CHAT_BRIDGE_SECRET');
  else if (res.status !== 429) console.error('chat: bridge answered', res.status, res.headers.get('Content-Type'));
  if (res.status === 429) return fail(429, { 'Retry-After': '30' });
  if (res.status === 400 || res.status === 504) return fail(res.status);
  return fail(res.ok ? 502 : 503);
}
