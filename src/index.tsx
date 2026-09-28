import { Hono, type Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { Env } from './lib/env';
import { setCookie, deleteCookie } from 'hono/cookie';
import { getLiveStatus, setLiveStatus, type LiveStatus } from './lib/live';
import { getPresence, setPresence } from './lib/presence';
import { addMix, getMixes, removeMix } from './lib/mixes';
import { checkPassword, COOKIE, isAdmin, sameOrigin, sessionValue } from './lib/auth';
import { Admin, AdminLogin } from './views/admin';
import { authorizeUrl, configured, connectedAs, disconnect, handleCallback, nowPlaying, recent, setupHints } from './lib/spotify';
import { Layout, type PageKey } from './views/layout';
import { Home } from './views/pages/home';
import { Photographer } from './views/pages/photographer';
import { DJ } from './views/pages/dj';
import { Trail } from './views/pages/trail';
import { Coder } from './views/pages/coder';
import { Music } from './views/pages/music';
import { Now } from './views/pages/now';
import { Lab } from './views/pages/lab';
import { NotFound } from './views/pages/notfound';

type App = { Bindings: Env };
type C = Context<App>;

const app = new Hono<App>();

// One canonical host (also keeps the Spotify redirect URI single).
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// Dev only: ?live=1 / ?live=0 on any page (requires ALLOW_MOCK=1).
const mockParam = (c: C) => {
  const q = c.req.query('mock') ?? c.req.query('live');
  return q === 'live' || q === '1' ? 'live' : q === 'off' || q === '0' ? 'off' : null;
};

async function page(c: C, key: PageKey, title: string | undefined, body: (live: LiveStatus) => Child, status: 200 | 404 = 200) {
  const live = await getLiveStatus(c.env, mockParam(c));
  return c.html(
    <Layout page={key} title={title} live={live}>
      {body(live)}
    </Layout>,
    status,
  );
}

/* ——— pages ——— */

app.get('/', async (c) => {
  const [presence, spotifyUser] = await Promise.all([getPresence(c.env), configured(c.env) ? connectedAs(c.env) : null]);
  return page(c, 'home', undefined, (live) => <Home live={live} presence={presence} spotifyConnected={!!spotifyUser} />);
});
app.get('/photographer', (c) => page(c, 'photographer', 'Photographer', () => <Photographer />));
app.get('/dj', async (c) => {
  const mixes = await getMixes(c.env);
  return page(c, 'dj', 'DJ', (live) => <DJ live={live} mixes={mixes} />);
});
app.get('/trail-runner', (c) => page(c, 'trail-runner', 'Trail runner', () => <Trail />));
app.get('/vibe-coder', (c) => page(c, 'vibe-coder', 'Vibe coder', () => <Coder />));
app.get('/music', (c) => page(c, 'music', 'Music', () => <Music />));
app.get('/now', async (c) => {
  const presence = await getPresence(c.env);
  return page(c, 'now', 'Now', () => <Now presence={presence} />);
});
app.get('/lab', (c) => page(c, 'lab', 'Lab', (live) => <Lab live={live} />));
app.get('/404', (c) => page(c, 'not-found', '404', () => <NotFound path="/404" />, 404));

// Trailing slashes → canonical path.
app.get('/:p{.+/$}', (c) => c.redirect(c.req.path.replace(/\/+$/, '') || '/', 301));

/* ——— live + presence (public) ——— */

app.get('/api/live-status', async (c) => {
  const status = await getLiveStatus(c.env, mockParam(c));
  return c.json(status, 200, { 'Cache-Control': 'no-store' });
});

/** Everything the public pages poll: live status + personal status + listening. */
app.get('/api/presence', async (c) => {
  const [live, presence] = await Promise.all([getLiveStatus(c.env, mockParam(c)), getPresence(c.env)]);
  return c.json({ live, ...presence }, 200, { 'Cache-Control': 'no-store' });
});

/* ——— admin ——— */

app.use('/admin/*', async (c, next) => {
  await next();
  c.header('X-Robots-Tag', 'noindex');
  c.header('Cache-Control', 'no-store');
});

app.get('/admin', async (c) => {
  c.header('X-Robots-Tag', 'noindex');
  c.header('Cache-Control', 'no-store');
  if (!c.env.ADMIN_TOKEN) return c.html(<AdminLogin error="ADMIN_TOKEN secret is not set." />, 503);
  if (!(await isAdmin(c))) return c.html(<AdminLogin />);
  const [live, presence] = await Promise.all([getLiveStatus(c.env), getPresence(c.env)]);
  const spotify = { configured: configured(c.env), setup: setupHints(c.env), user: await connectedAs(c.env), notice: c.req.query('spotify') ?? null, redirectUri: redirectUri(c) };
  const mixes = await getMixes(c.env);
  return c.html(<Admin live={live} presence={presence} kv={!!c.env.STATE} spotify={spotify} mixes={mixes} />);
});

app.post('/admin/login', async (c) => {
  if (!sameOrigin(c)) return c.text('bad origin', 403);
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const rateKey = `admin:fail:${ip}`;
  const fails = Number((await c.env.STATE?.get(rateKey)) ?? 0);
  if (fails >= 5) return c.html(<AdminLogin error="too many tries. wait a few minutes." />, 429);

  const form = await c.req.parseBody();
  if (!checkPassword(c.env, String(form.password ?? ''))) {
    await c.env.STATE?.put(rateKey, String(fails + 1), { expirationTtl: 300 });
    return c.html(<AdminLogin error="wrong password." />, 401);
  }
  setCookie(c, COOKIE, await sessionValue(c.env), {
    path: '/', httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect('/admin', 303);
});

app.post('/admin/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.redirect('/admin', 303);
});

/** Admin writes. Cookie (from /admin) or `Authorization: Bearer <ADMIN_TOKEN>` (scripts, shortcuts). */
const guard = async (c: C) => {
  if (!(await isAdmin(c)) || !sameOrigin(c)) return c.json({ error: 'unauthorized' }, 401);
  if (!c.env.STATE) return c.json({ error: 'STATE KV namespace not bound' }, 501);
  return null;
};
const body = (c: C) => c.req.json<Record<string, unknown>>().catch(() => null);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);

/**
 *   curl -X POST https://<site>/api/live-status -H "Authorization: Bearer $TOKEN" \
 *        -d '{"isLive":true,"sessionTitle":"late set","streamUrl":"https://…"}'
 */
app.post('/api/live-status', async (c) => {
  const denied = await guard(c);
  if (denied) return denied;
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  const url = str(b.streamUrl, 300);
  if (url && !/^https:\/\//.test(url)) return c.json({ error: 'stream url must start with https://' }, 400);
  const status = await setLiveStatus(c.env, {
    isLive: typeof b.isLive === 'boolean' ? b.isLive : undefined,
    sessionTitle: str(b.sessionTitle, 120),
    streamUrl: url,
  });
  return c.json(status);
});

/** { status?: string, listening?: { title, artist } | null } */
app.post('/api/admin/presence', async (c) => {
  const denied = await guard(c);
  if (denied) return denied;
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  return c.json(await setPresence(c.env, b));
});

/** DJ archive: { title, url, date? } → adds the next number. */
app.post('/api/admin/mixes', async (c) => {
  const denied = await guard(c);
  if (denied) return denied;
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  try {
    return c.json(await addMix(c.env, b));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.delete('/api/admin/mixes/:id', async (c) => {
  const denied = await guard(c);
  if (denied) return denied;
  return c.json(await removeMix(c.env, c.req.param('id')));
});

/* ——— spotify ——— */

// PUBLIC_ORIGIN pins the origin in local dev, where wrangler rewrites the request URL to the route host.
const redirectUri = (c: C) => `${c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin}/api/spotify/callback`;

/** Edge-cached JSON so every visitor's poll doesn't turn into a Spotify API call. */
async function edgeCached<T extends { state: string }>(c: C, ttl: number, load: () => Promise<T>) {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(c.req.path, c.req.url).toString());
  // The edge copy lives `ttl` seconds; browsers never keep one, so a poll always sees the edge's current answer.
  const toBrowser = (body: BodyInit | null) =>
    new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const hit = await cache.match(key);
  if (hit) return toBrowser(hit.body);
  const data = await load();
  const body = JSON.stringify(data);
  // Only cache real data: a setup state (unconfigured / disconnected) or an error must clear as soon as it's fixed.
  if (CACHEABLE.has(data.state)) {
    const stored = new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` } });
    c.executionCtx.waitUntil(cache.put(key, stored));
  }
  return toBrowser(body);
}

const CACHEABLE = new Set(['playing', 'paused', 'recent', 'idle', 'ok']);

/** Drop the cached Spotify responses, so connecting or disconnecting shows up at once. */
async function purgeSpotify(c: C) {
  const cache = (caches as unknown as { default: Cache }).default;
  const origin = new URL(c.req.url).origin;
  await Promise.all(['/api/spotify/now', '/api/spotify/recent'].map((p) => cache.delete(new Request(origin + p))));
}

app.get('/api/spotify/now', (c) => edgeCached(c, 10, () => nowPlaying(c.env)));
app.get('/api/spotify/recent', (c) => edgeCached(c, 60, () => recent(c.env)));

// Linking is admin-only, so nobody else can attach their account to the site.
app.get('/api/spotify/login', async (c) => {
  if (!(await isAdmin(c))) return c.redirect('/admin', 302);
  if (!configured(c.env)) return c.redirect('/admin?spotify=unconfigured', 302);
  return c.redirect(await authorizeUrl(c.env, redirectUri(c)), 302);
});

app.get('/api/spotify/callback', async (c) => {
  const { code, state, error } = c.req.query();
  if (error || !code || !state) return c.redirect(`/admin?spotify=${encodeURIComponent(error || 'cancelled')}`, 302);
  try {
    await handleCallback(c.env, code, state, redirectUri(c));
    await purgeSpotify(c);
    return c.redirect('/admin?spotify=connected', 302);
  } catch (e) {
    console.error('spotify callback', (e as Error).message);
    return c.redirect('/admin?spotify=failed', 302);
  }
});

app.post('/api/spotify/disconnect', async (c) => {
  const denied = await guard(c);
  if (denied) return denied;
  await disconnect(c.env);
  await purgeSpotify(c);
  return c.json({ ok: true });
});

/* ——— guestbook (lab) ——— */

type Entry = { name: string; message: string; at: string };
const GB_KEY = 'guestbook';

app.get('/api/guestbook', async (c) => {
  if (!c.env.STATE) return c.json({ enabled: false, entries: [] });
  const entries = (await c.env.STATE.get<Entry[]>(GB_KEY, 'json')) ?? [];
  return c.json({ enabled: true, entries });
});

app.post('/api/guestbook', async (c) => {
  if (!c.env.STATE) return c.json({ error: 'guestbook offline' }, 501);
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const rateKey = `gb:rate:${ip}`;
  if (await c.env.STATE.get(rateKey)) return c.json({ error: 'one line per minute' }, 429);

  const body = await c.req.json<Partial<Entry>>().catch(() => ({}) as Partial<Entry>);
  const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const entry: Entry = { name: clean(body.name, 32), message: clean(body.message, 140), at: new Date().toISOString() };
  if (!entry.name || !entry.message) return c.json({ error: 'name and message required' }, 400);

  const entries = (await c.env.STATE.get<Entry[]>(GB_KEY, 'json')) ?? [];
  entries.unshift(entry);
  await Promise.all([
    c.env.STATE.put(GB_KEY, JSON.stringify(entries.slice(0, 50))),
    c.env.STATE.put(rateKey, '1', { expirationTtl: 60 }),
  ]);
  return c.json({ ok: true, entries: entries.slice(0, 50) });
});

/* ——— fallbacks ——— */

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  return page(c, 'not-found', '404', () => <NotFound path={c.req.path} />, 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.text('something broke.', 500);
});

export default app;
