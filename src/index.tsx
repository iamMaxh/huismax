import { Hono, type Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { Env } from './lib/env';
import { getLiveStatus, setLiveStatus, type LiveStatus } from './lib/live';
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

app.get('/', (c) => page(c, 'home', undefined, (live) => <Home live={live} />));
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

/* ——— live status ——— */

app.get('/api/live-status', async (c) => {
  const status = await getLiveStatus(c.env, mockParam(c));
  return c.json(status, 200, { 'Cache-Control': 'no-store' });
});

/**
 * Toggle live without a redeploy (needs the STATE KV binding + LIVE_ADMIN_TOKEN secret):
 *   curl -X POST https://<site>/api/live-status -H "Authorization: Bearer $TOKEN" \
 *        -d '{"isLive":true,"sessionTitle":"late set","streamUrl":"https://…"}'
 */
app.post('/api/live-status', async (c) => {
  const token = c.env.LIVE_ADMIN_TOKEN;
  if (!token || c.req.header('Authorization') !== `Bearer ${token}`) return c.json({ error: 'unauthorized' }, 401);
  if (!c.env.STATE) return c.json({ error: 'STATE KV namespace not bound' }, 501);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid json' }, 400);
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : undefined);
  const status = await setLiveStatus(c.env, {
    isLive: typeof body.isLive === 'boolean' ? body.isLive : undefined,
    sessionTitle: str(body.sessionTitle),
    streamUrl: str(body.streamUrl),
  });
  return c.json(status);
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
