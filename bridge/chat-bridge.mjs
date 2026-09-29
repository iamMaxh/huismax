/**
 * Live chat bridge: runs on Max's server next to OpenClaw and is reached only through a Cloudflare Tunnel.
 *
 *   browser → huismax.com/api/chat (worker, src/lib/chat.ts) → tunnel → POST /chat here → OpenClaw on loopback
 *
 * The worker proves itself with CHAT_BRIDGE_SECRET and sends { message, history } plus a hashed visitor id.
 * The bridge asks the OpenClaw gateway (OpenAI-compatible /v1/chat/completions, streamed, always the
 * `openclaw/website` agent) with a token only it holds, and translates the answer into the chat's events:
 * ready · token { content } · done { done } · error { error }. Nothing OpenClaw says when it fails, and nothing
 * about this machine, goes back.
 *
 * Node 22+, no dependencies. Started by bridge/server.mjs; settings in bridge/chat-bridge.env.example.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

/** The bridge's one endpoint. */
export const PATH = '/chat';
/** The one agent the website may talk to. Not a setting: nothing a request says can pick another. */
export const MODEL = 'openclaw/website';

// The chat UI's own limits: a question is at most 2000 characters and it sends the last 8 messages.
const MAX_MESSAGE = 2000;
const HISTORY_LIMIT = 8;
/** An earlier answer sent back as history is cut to this. */
const MAX_HISTORY_TEXT = 4000;
const MAX_BODY = 256 * 1024;
/** Ends a runaway answer. */
const MAX_ANSWER = 16_000;
const DAY = 86_400_000;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no', // nginx: pass every event on at once
  'X-Content-Type-Options': 'nosniff',
};

/** Everything a caller can be told when something fails. Never OpenClaw's text, never a detail of this machine. */
const ERRORS = {
  400: 'bad request', 401: 'unauthorized', 404: 'not found', 405: 'method not allowed', 413: 'too large', 415: 'expected json',
  429: 'too many requests', 500: 'server error', 502: 'unavailable', 503: 'unavailable', 504: 'timeout',
};

/** For the operator's log only. */
const HINTS = {
  401: ' (check OPENCLAW_GATEWAY_TOKEN)',
  403: ' (check OPENCLAW_GATEWAY_TOKEN)',
  404: ` (is the gateway's chat completions endpoint enabled, and is there a ${MODEL} agent?)`,
};

// an address, not a prefix: 127.0.0.1.example.com is somebody else's machine
export const isLoopback = (addr = '') => addr === 'localhost' || addr === '::1' || /^(::ffff:)?127(\.\d{1,3}){3}$/.test(addr);

/** Settings from the environment. Throws when the bridge must not start. */
export function loadConfig(env = process.env) {
  const num = (name, fallback) => {
    const v = env[name];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number`);
    return n;
  };
  const token = (env.OPENCLAW_GATEWAY_TOKEN ?? '').trim();
  if (!token) throw new Error('OPENCLAW_GATEWAY_TOKEN is not set');
  const secret = (env.CHAT_BRIDGE_SECRET ?? '').trim();
  if (secret.length < 32) throw new Error('CHAT_BRIDGE_SECRET must be at least 32 characters (openssl rand -hex 32)');
  // the worker holds this one; it must not open the gateway too
  if (secret === token) throw new Error('CHAT_BRIDGE_SECRET must differ from OPENCLAW_GATEWAY_TOKEN');
  const upstream = new URL(env.OPENCLAW_URL || 'http://127.0.0.1:18789/v1/chat/completions');
  // the token goes wherever this points: only the gateway on this machine qualifies
  if (!isLoopback(upstream.hostname.replace(/^\[|\]$/g, ''))) throw new Error('OPENCLAW_URL must point to this machine (127.0.0.1, ::1 or localhost)');
  return {
    host: env.HOST || '127.0.0.1',
    port: num('PORT', 8790),
    upstream: upstream.href,
    token,
    secret,
    perMinute: num('RATE_PER_MINUTE', 6),
    perDay: num('RATE_PER_DAY', 100),
    maxConcurrent: num('MAX_CONCURRENT', 4),
    firstTokenMs: num('FIRST_TOKEN_TIMEOUT_MS', 80_000),
    idleMs: num('IDLE_TIMEOUT_MS', 40_000),
    maxMs: num('MAX_DURATION_MS', 180_000),
  };
}

/**
 * The OpenAI `messages` for one question: the visitor's recent history (user and assistant only, the last 8,
 * long ones cut), then the question. null when the body isn't a question.
 */
export function toMessages(body) {
  if (!body || typeof body !== 'object') return null;
  const question = typeof body.message === 'string' ? body.message.trim() : '';
  if (!question || question.length > MAX_MESSAGE) return null;
  const past = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_TEXT) }));
  return [...past, { role: 'user', content: question }];
}

/** In-memory limits: questions per visitor per minute and per day, one answer per visitor at a time, a site-wide cap. */
export function limiter({ perMinute, perDay, maxConcurrent }, now = Date.now) {
  const visitors = new Map();
  let active = 0;
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of visitors) if (!v.active && t - v.day >= DAY) visitors.delete(k);
  }, 600_000);
  sweep.unref();
  return {
    /** A release function, or null when the visitor (or the site) is over a limit. */
    take(key) {
      const t = now();
      let v = visitors.get(key);
      if (!v) visitors.set(key, (v = { minute: t, perMinute: 0, day: t, perDay: 0, active: 0 }));
      if (t - v.minute >= 60_000) (v.minute = t), (v.perMinute = 0);
      if (t - v.day >= DAY) (v.day = t), (v.perDay = 0);
      if (v.active || active >= maxConcurrent || v.perMinute >= perMinute || v.perDay >= perDay) return null;
      v.perMinute++, v.perDay++, v.active++, active++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        v.active--, active--;
      };
    },
    close: () => clearInterval(sweep),
  };
}

function send(res, status, headers = {}, body = { error: ERRORS[status] }) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

const TOO_LARGE = Symbol('too large');

/** The request body parsed as JSON: null when it isn't JSON, TOO_LARGE (and the connection dropped) past MAX_BODY. */
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) return TOO_LARGE; // leaving the loop destroys the request
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const DONE = Symbol('[DONE]');

/** The JSON chunks of an OpenAI-style event stream: `data: {…}` events until `data: [DONE]`. */
async function* openaiStream(body) {
  const decoder = new TextDecoder();
  let buf = '';
  let data = [];
  // one line of the stream; returns the event it completes (a chunk or DONE), if any
  const line = (l) => {
    if (l.startsWith('data:')) return void data.push(l.slice(5).trimStart());
    if (l || !data.length) return;
    const payload = data.join('\n');
    data = [];
    if (payload === '[DONE]') return DONE;
    try {
      return JSON.parse(payload);
    } catch {
      return; // not JSON: skipped
    }
  };
  for await (const bytes of body ?? []) {
    buf += decoder.decode(bytes, { stream: true });
    for (;;) {
      const m = /\r\n|\r|\n/.exec(buf);
      // a \r at the very end may be the first half of a \r\n
      if (!m || (m[0] === '\r' && m.index === buf.length - 1)) break;
      const ev = line(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
      if (ev === DONE) return;
      if (ev !== undefined) yield ev;
    }
  }
  // a last event without its blank line still counts
  for (const l of [buf + decoder.decode(), '']) {
    const ev = line(l);
    if (ev === DONE) return;
    if (ev !== undefined) yield ev;
  }
}

/** A gateway that answered in one piece instead of streaming. */
async function* oneAnswer(res) {
  yield await res.json();
}

const digest = (s) => createHash('sha256').update(s).digest();

export function createBridge(config, { log = (line) => console.error(line) } = {}) {
  const limits = limiter(config);
  // every log line goes through here, so neither secret can end up in the journal
  const say = (line) => log(`chat-bridge: ${String(line).split(config.token).join('[token]').split(config.secret).join('[secret]')}`);
  const secretDigest = digest(`Bearer ${config.secret}`);
  // compared as digests: same length whatever was sent, and in constant time
  const authorized = (req) => timingSafeEqual(digest(String(req.headers.authorization ?? '')), secretDigest);

  async function handle(req, res) {
    if ((req.url ?? '/').split('?')[0] !== PATH) return send(res, 404);
    if (req.method !== 'POST') return send(res, 405, { Allow: 'POST' });
    if (!authorized(req)) {
      say('refused a request without the bridge secret');
      return send(res, 401);
    }
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415);
    if (Number(req.headers['content-length']) > MAX_BODY) return send(res, 413);
    const body = await readJson(req);
    if (body === TOO_LARGE || req.socket.destroyed) return; // nobody left to answer
    const messages = toMessages(body);
    if (!messages) return send(res, 400);
    // the worker's hashed visitor id (never an address); without one, everyone shares a single limit
    const visitor = String(req.headers['x-chat-visitor'] ?? '');
    const release = limits.take(/^[0-9a-f]{16,64}$/.test(visitor) ? visitor : 'unknown');
    if (!release) return send(res, 429, { 'Retry-After': '30' });
    try {
      await answer(messages, res);
    } finally {
      release();
    }
  }

  /**
   * Streams one answer from OpenClaw back to the worker. The response (200, event stream) starts with the first words,
   * so anything that fails before them is a plain status the chat already explains: 502/503 unavailable, 504 timeout.
   * Once words have gone out, a failure ends the stream without `done` (the chat says the answer was cut off),
   * or with an `error` event when OpenClaw reports one.
   */
  async function answer(messages, res) {
    const ctl = new AbortController();
    let stopped = ''; // why the upstream request was aborted: first | idle | max | visitor
    const stop = (why) => {
      if (stopped) return;
      stopped = why;
      ctl.abort();
    };
    let timer = setTimeout(() => stop('first'), config.firstTokenMs);
    const max = setTimeout(() => stop('max'), config.maxMs);
    // Stop, a closed tab, a dropped connection: OpenClaw stops too
    res.on('close', () => !res.writableFinished && stop('visitor'));

    let sent = 0;
    const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const token = (text) => {
      if (!res.headersSent) {
        res.writeHead(200, STREAM_HEADERS);
        write('ready', {});
      }
      write('token', { content: text });
      sent += text.length;
      clearTimeout(timer);
      timer = setTimeout(() => stop('idle'), config.idleMs);
    };
    const fail = (status, why) => {
      say(why);
      if (!res.headersSent) return send(res, status);
      write('error', { error: ERRORS[status] });
      res.end();
    };

    try {
      let up;
      try {
        up = await fetch(config.upstream, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ model: MODEL, stream: true, messages }),
          signal: ctl.signal,
        });
      } catch (e) {
        if (stopped === 'visitor') return;
        if (stopped) return fail(504, 'OpenClaw did not answer in time');
        return fail(503, `OpenClaw gateway unreachable (${e.cause?.code ?? e.message})`);
      }
      if (!up.ok) {
        const detail = (await up.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        const status = up.status === 408 || up.status === 504 ? 504 : up.status === 429 || up.status === 503 ? 503 : 502;
        return fail(status, `OpenClaw answered ${up.status}${HINTS[up.status] ?? ''}: ${detail}`);
      }
      const streamed = (up.headers.get('content-type') ?? '').includes('text/event-stream');
      for await (const chunk of streamed ? openaiStream(up.body) : oneAnswer(up)) {
        if (chunk?.error) return fail(502, `OpenClaw error: ${JSON.stringify(chunk.error).slice(0, 200)}`);
        const choice = chunk?.choices?.[0];
        const text = choice?.delta?.content ?? choice?.message?.content;
        if (typeof text === 'string' && text) token(text);
        if (sent >= MAX_ANSWER) break;
      }
      if (!sent) return fail(502, 'OpenClaw sent an empty answer');
      write('done', { done: true });
      res.end();
    } catch (e) {
      if (stopped === 'visitor') return;
      if (!res.headersSent) return fail(stopped ? 504 : 502, stopped ? `OpenClaw did not answer in time (${stopped})` : `OpenClaw stream failed (${e.message})`);
      say(`answer cut off (${stopped || e.message})`);
      res.end();
    } finally {
      clearTimeout(timer);
      clearTimeout(max);
      ctl.abort(); // a finished or abandoned upstream request never lingers
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      say(`unexpected: ${e?.message}`);
      if (!res.headersSent) send(res, 500);
      else res.end();
    });
  });
  server.on('close', limits.close);
  return server;
}
