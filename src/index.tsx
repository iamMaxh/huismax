import { Hono, type Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { Env } from './lib/env';
import { setCookie, deleteCookie } from 'hono/cookie';
import { getLiveStatus, setLiveStatus, type LiveStatus } from './lib/live';
import { getPresence, setPresence } from './lib/presence';
import { checkPassword, COOKIE, isAdmin, sameOrigin, sessionValue } from './lib/auth';
import { Admin, AdminLogin } from './views/admin';
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
  const presence = await getPresence(c.env);
  return page(c, 'home', undefined, (live) => <Home live={live} presence={presence} />);
});
app.get('/photographer', (c) => page(c, 'photographer', 'Photographer', () => <Photographer />));
app.get('/dj', (c) => page(c, 'dj', 'DJ', (live) => <DJ live={live} />));
app.get('/trail-runner', (c) => page(c, 'trail-runner', 'Trail runner', () => <Trail />));
app.get('/vibe-coder', (c) => page(c, 'vibe-coder', 'Vibe coder', () => <Coder />));
app.get('/music', (c) => page(c, 'music', 'Music', () => <Music />));
app.get('/now', (c) => page(c, 'now', 'Now', () => <Now />));
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
  return c.html(<Admin live={live} presence={presence} kv={!!c.env.STATE} />);
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
