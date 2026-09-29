import { Hono, type Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { Env } from './lib/env';
import { setCookie, deleteCookie } from 'hono/cookie';
import { getLiveStatus, setLiveStatus, type LiveStatus } from './lib/live';
import { getPresence, setPresence } from './lib/presence';
import { checkPassword, COOKIE, isAdmin, sameOrigin, sessionValue } from './lib/auth';
import { Admin, AdminLogin } from './views/admin';
import { authorizeUrl, configured, connectedAs, disconnect, handleCallback, nowPlaying, recent, setupHints } from './lib/spotify';
import { ensureDb } from './lib/db';
import * as cms from './lib/cms';
import { identities, items, photos, sessions, settings, site, type Site } from './lib/content';
import { deleteKeys, dim, LIMITS, putImage, readImage, serve, UploadError, validKey } from './lib/media';
import { allowed, emailMessage, listMessages, saveMessage, underCap, validateReply } from './lib/reply';
import { chat } from './lib/chat';
import { adminData, type AdminData } from './lib/admin-data';
import { Layout, type PageKey } from './views/layout';
import { Home } from './views/pages/home';
import { Album } from './views/pages/album';
import { DJ } from './views/pages/dj';
import { Coder } from './views/pages/coder';
import { Music } from './views/pages/music';
import { Now } from './views/pages/now';
import { Reply } from './views/pages/reply';
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

/** Pages the admin can hide; a hidden page is a 404 for visitors (the admin still sees it). */
const HIDEABLE: Partial<Record<PageKey, cms.PageKeyCms>> = {
  photographer: 'photographer', dj: 'dj', hiking: 'hiking', 'vibe-coder': 'vibe-coder', music: 'music', now: 'now', reply: 'reply',
};

async function page(c: C, key: PageKey, title: string | undefined, body: (live: LiveStatus, site: Site) => Child | Promise<Child>, status: 200 | 404 = 200): Promise<Response> {
  const [live, s] = await Promise.all([getLiveStatus(c.env, mockParam(c)), site(c.env)]);
  const cmsKey = HIDEABLE[key];
  if (cmsKey && !s.settings.pages[cmsKey] && !(await isAdmin(c))) return notFound(c);
  const description = (cmsKey && s.settings.intros[cmsKey]) || s.settings.description;
  return c.html(
    <Layout page={key} title={title} description={description} live={live} site={s}>
      {await body(live, s)}
    </Layout>,
    status,
  );
}

const intro = (s: Site, k: cms.PageKeyCms) => s.settings.intros[k];

/* ——— pages ——— */

app.get('/', async (c) => {
  const [presence, spotifyUser, rows, projects, now] = await Promise.all([
    getPresence(c.env),
    configured(c.env) ? connectedAs(c.env) : null,
    identities(c.env),
    items(c.env, 'projects'),
    items(c.env, 'now'),
  ]);
  return page(c, 'home', undefined, (live, s) => (
    <Home
      live={live}
      presence={presence}
      spotifyConnected={!!spotifyUser}
      settings={s.settings}
      identities={rows}
      projects={projects}
      now={now}
    />
  ));
});
app.get('/photographer', async (c) => {
  const list = await photos(c.env, 'photography');
  return page(c, 'photographer', 'Photographer', (_l, s) => <Album album="photography" title="Photographer" crumb="photographer" intro={intro(s, 'photographer')} photos={list} />);
});
app.get('/hiking', async (c) => {
  const list = await photos(c.env, 'hiking');
  return page(c, 'hiking', 'Hiking', (_l, s) => <Album album="hiking" title="Hiking" crumb="hiking" intro={intro(s, 'hiking')} photos={list} />);
});
app.get('/trail-runner', (c) => c.redirect('/hiking', 301));
app.get('/dj', async (c) => {
  const list = await sessions(c.env);
  return page(c, 'dj', 'DJ', (live, s) => <DJ live={live} sessions={list} intro={intro(s, 'dj')} />);
});
app.get('/vibe-coder', async (c) => {
  const list = await items(c.env, 'projects');
  return page(c, 'vibe-coder', 'Vibe coder', (_l, s) => <Coder projects={list} intro={intro(s, 'vibe-coder')} />);
});
app.get('/music', async (c) => {
  const [artists, rotation, featured] = await Promise.all([
    items(c.env, 'music', { kind: 'artist' }),
    items(c.env, 'music', { kind: 'rotation' }),
    items(c.env, 'music', { kind: 'featured' }),
  ]);
  return page(c, 'music', 'Music', (_l, s) => (
    <Music artists={artists} rotation={rotation} featured={featured} spotifyProfile={s.settings.spotifyProfile} intro={intro(s, 'music')} />
  ));
});
app.get('/now', async (c) => {
  const [presence, list] = await Promise.all([getPresence(c.env), items(c.env, 'now')]);
  return page(c, 'now', 'Now', (_l, s) => <Now presence={presence} items={list} intro={intro(s, 'now')} />);
});
app.get('/reply', (c) => page(c, 'reply', 'Reply', (_l, s) => <Reply intro={intro(s, 'reply')} ready={!!c.env.DB} />));
app.get('/lab', (c) => c.redirect('/reply', 301));
app.get('/404', (c) => notFound(c));

const notFound = (c: C): Promise<Response> => page(c, 'not-found', '404', () => <NotFound path={c.req.path} />, 404);

// Trailing slashes → canonical path.
// Leading slashes are collapsed too, so `//evil.example/` can't become a redirect to another site. Tabs and
// newlines go first: browsers drop them from a Location, so `/%09/evil.example/` would otherwise become `//evil.example`.
app.get('/:p{.+/$}', (c) => c.redirect(`/${c.req.path.replace(/[\t\n\r]/g, '').replace(/^[/\\]+|\/+$/g, '')}`, 301));

/* ——— uploaded images ——— */

app.get('/media/:key{.+}', async (c) => {
  const key = c.req.param('key');
  if (!c.env.MEDIA || !c.env.DB || !validKey(key)) return c.text('not found', 404);
  await ensureDb(c.env);
  // public only if the photo / session it belongs to is published
  const row = key.startsWith('covers/')
    ? await c.env.DB.prepare('SELECT published FROM dj_sessions WHERE cover_key = ?').bind(key).first<{ published: number }>()
    : await c.env.DB.prepare('SELECT published FROM photos WHERE image_key = ?1 OR thumb_key = ?1').bind(key).first<{ published: number }>();
  if (!row) return c.text('not found', 404);
  const isPublic = row.published === 1;
  if (!isPublic && !(await isAdmin(c))) return c.text('not found', 404);
  return serve(c.env, c.req.raw, key, isPublic);
});

/* ——— reply (public) ——— */

app.post('/api/reply', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'bad origin' }, 403);
  if (!c.env.DB) return c.json({ error: 'replies are offline right now' }, 503);
  const s = await settings(c.env);
  // hiding the page in /admin also closes the form
  if (!s.pages.reply) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  if (typeof b.website === 'string' && b.website) return c.json({ ok: true }); // honeypot: bots fill every field
  let m;
  try {
    m = validateReply(b);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const limited = await allowed(c.env, c.req.header('CF-Connecting-IP') ?? 'local');
  if (limited) return c.json({ error: limited }, 429);
  if (!(await underCap(c.env))) return c.json({ error: 'too many messages right now. try again later' }, 429);
  const saved = await saveMessage(c.env, m);
  c.executionCtx.waitUntil(emailMessage(c.env, s, saved));
  return c.json({ ok: true });
});

/* ——— live chat (public) ——— */

app.post('/api/chat', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'bad origin' }, 403);
  return chat(c.env, c.req.raw);
});

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
  await ensureDb(c.env);
  const [live, presence, user] = await Promise.all([getLiveStatus(c.env), getPresence(c.env), connectedAs(c.env)]);
  const spotify = { configured: configured(c.env), setup: setupHints(c.env), user, notice: c.req.query('spotify') ?? null, redirectUri: redirectUri(c) };
  let data: AdminData | null = null;
  let dbError: string | null = null;
  if (c.env.DB) {
    try {
      data = await adminData(c.env);
    } catch (e) {
      dbError = (e as Error).message;
    }
  }
  return c.html(<Admin live={live} presence={presence} kv={!!c.env.STATE} spotify={spotify} data={data} dbError={c.env.DB ? dbError : 'D1 database (binding DB) is not connected.'} />);
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
  // Lax, not Strict: coming back from Spotify is a navigation another site starts, and Strict would sign Max out.
  // Writes stay safe: Lax is never sent on a cross-site POST or fetch, and every write also checks sameOrigin().
  setCookie(c, COOKIE, await sessionValue(c.env), {
    path: '/', httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect('/admin', 303);
});

app.post('/admin/logout', (c) => {
  if (!sameOrigin(c)) return c.text('bad origin', 403);
  deleteCookie(c, COOKIE, { path: '/' });
  return c.redirect('/admin', 303);
});

/** Admin writes. Cookie (from /admin) or `Authorization: Bearer <ADMIN_TOKEN>` (scripts, shortcuts). */
const guard = async (c: C) => {
  if (!(await isAdmin(c)) || !sameOrigin(c)) return c.json({ error: 'unauthorized' }, 401);
  if (!c.env.STATE) return c.json({ error: 'STATE KV namespace not bound' }, 501);
  return null;
};
/** Admin CMS writes: same auth, and D1 must be there. */
const guardDb = async (c: C) => {
  if (!(await isAdmin(c)) || !sameOrigin(c)) return c.json({ error: 'unauthorized' }, 401);
  if (!c.env.DB) return c.json({ error: 'D1 database (binding DB) is not connected' }, 501);
  await ensureDb(c.env);
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

/* ——— CMS (admin) ——— */

const cmsError = (c: C, e: unknown) => {
  if (e instanceof cms.InputError || e instanceof UploadError) return c.json({ error: e.message }, 400);
  console.error('cms', (e as Error).message);
  return c.json({ error: 'could not save. try again.' }, 500);
};
const collection = (c: C) => {
  const name = c.req.param('name') ?? '';
  return cms.isCollection(name) ? name : null;
};

app.get('/api/admin/c/:name', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const name = collection(c);
  if (!name) return c.json({ error: 'unknown collection' }, 404);
  return c.json(await cms.list(c.env, name, { filter: c.req.query() }));
});

app.post('/api/admin/c/:name', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const name = collection(c);
  // photos are created by uploading one (below)
  if (!name || name === 'photos') return c.json({ error: 'unknown collection' }, 404);
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  try {
    return c.json(await cms.create(c.env, name, b), 201);
  } catch (e) {
    return cmsError(c, e);
  }
});

app.put('/api/admin/c/:name/order', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const name = collection(c);
  if (!name) return c.json({ error: 'unknown collection' }, 404);
  const b = await body(c);
  try {
    await cms.reorder(c.env, name, b?.ids);
    return c.json({ ok: true });
  } catch (e) {
    return cmsError(c, e);
  }
});

app.patch('/api/admin/c/:name/:id', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const name = collection(c);
  if (!name) return c.json({ error: 'unknown collection' }, 404);
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  try {
    const item = await cms.update(c.env, name, c.req.param('id'), b);
    return item ? c.json(item) : c.json({ error: 'not found' }, 404);
  } catch (e) {
    return cmsError(c, e);
  }
});

app.delete('/api/admin/c/:name/:id', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const name = collection(c);
  if (!name) return c.json({ error: 'unknown collection' }, 404);
  const id = c.req.param('id');
  const item = await cms.get(c.env, name, id);
  if (!item) return c.json({ error: 'not found' }, 404);
  await cms.remove(c.env, name, id);
  // the files go with the row
  c.executionCtx.waitUntil(deleteKeys(c.env, [item.image_key, item.thumb_key, item.cover_key]).catch((e) => console.error('r2 delete', e)));
  return c.json({ ok: true });
});

/** Photo upload: multipart { image, thumb, width, height, album, title?, caption?, location?, taken_at?, published? } */
app.post('/api/admin/photos', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  if (!c.env.MEDIA) return c.json({ error: 'photo storage (R2) is not connected yet' }, 501);
  try {
    const form = await c.req.parseBody();
    const fields = cms.validate(cms.COLLECTIONS.photos, form, true);
    const id = cms.newId();
    const prefix = fields.album === 'hiking' ? 'photos/hiking' : 'photos/photography';
    const image = await readImage(form.image, LIMITS.image, 'image');
    const thumb = form.thumb ? await readImage(form.thumb, LIMITS.thumb, 'thumbnail') : null;
    const written: string[] = [];
    try {
      const image_key = await putImage(c.env, prefix, id, image);
      written.push(image_key);
      const thumb_key = thumb ? await putImage(c.env, prefix, id, thumb, '-t') : '';
      written.push(thumb_key);
      const item = await cms.create(c.env, 'photos', form, { image_key, thumb_key, width: dim(form.width), height: dim(form.height), published: form.published === '1' ? 1 : 0 });
      return c.json(item, 201);
    } catch (e) {
      await deleteKeys(c.env, written); // no orphan files when any step fails
      throw e;
    }
  } catch (e) {
    return cmsError(c, e);
  }
});

/** Replace a photo's image: multipart { image, thumb, width, height }. The old files are deleted. */
app.put('/api/admin/photos/:id/image', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  if (!c.env.MEDIA) return c.json({ error: 'photo storage (R2) is not connected yet' }, 501);
  const old = await cms.get(c.env, 'photos', c.req.param('id'));
  if (!old) return c.json({ error: 'not found' }, 404);
  try {
    const form = await c.req.parseBody();
    const prefix = old.album === 'hiking' ? 'photos/hiking' : 'photos/photography';
    const image = await readImage(form.image, LIMITS.image, 'image');
    const thumb = form.thumb ? await readImage(form.thumb, LIMITS.thumb, 'thumbnail') : null;
    const written: string[] = [];
    let item;
    try {
      const image_key = await putImage(c.env, prefix, old.id, image);
      written.push(image_key);
      const thumb_key = thumb ? await putImage(c.env, prefix, old.id, thumb, '-t') : '';
      written.push(thumb_key);
      item = await cms.update(c.env, 'photos', old.id, {}, { image_key, thumb_key, width: dim(form.width), height: dim(form.height) });
    } catch (e) {
      await deleteKeys(c.env, written);
      throw e;
    }
    if (!item) {
      // deleted while uploading
      await deleteKeys(c.env, written);
      return c.json({ error: 'not found' }, 404);
    }
    c.executionCtx.waitUntil(deleteKeys(c.env, [old.image_key, old.thumb_key]).catch((e) => console.error('r2 delete', e)));
    return c.json(item);
  } catch (e) {
    return cmsError(c, e);
  }
});

/** DJ session cover: multipart { image } (PUT sets/replaces, DELETE removes). */
app.put('/api/admin/dj/:id/cover', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  if (!c.env.MEDIA) return c.json({ error: 'image storage (R2) is not connected yet' }, 501);
  const old = await cms.get(c.env, 'dj', c.req.param('id'));
  if (!old) return c.json({ error: 'not found' }, 404);
  try {
    const form = await c.req.parseBody();
    const image = await readImage(form.image, LIMITS.thumb, 'cover');
    const cover_key = await putImage(c.env, 'covers', old.id, image);
    const item = await cms.update(c.env, 'dj', old.id, {}, { cover_key }).catch(async (e) => {
      await deleteKeys(c.env, [cover_key]);
      throw e;
    });
    if (!item) {
      await deleteKeys(c.env, [cover_key]);
      return c.json({ error: 'not found' }, 404);
    }
    c.executionCtx.waitUntil(deleteKeys(c.env, [old.cover_key]).catch((e) => console.error('r2 delete', e)));
    return c.json(item);
  } catch (e) {
    return cmsError(c, e);
  }
});

app.delete('/api/admin/dj/:id/cover', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const old = await cms.get(c.env, 'dj', c.req.param('id'));
  if (!old) return c.json({ error: 'not found' }, 404);
  const item = await cms.update(c.env, 'dj', old.id, {}, { cover_key: '' });
  if (!item) return c.json({ error: 'not found' }, 404);
  c.executionCtx.waitUntil(deleteKeys(c.env, [old.cover_key]).catch((e) => console.error('r2 delete', e)));
  return c.json(item);
});

app.get('/api/admin/settings', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  return c.json(await cms.getSettings(c.env));
});

app.put('/api/admin/settings', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const b = await body(c);
  if (!b) return c.json({ error: 'invalid json' }, 400);
  try {
    return c.json(await cms.saveSettings(c.env, b));
  } catch (e) {
    return cmsError(c, e);
  }
});

app.get('/api/admin/messages', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  return c.json(await listMessages(c.env));
});

app.patch('/api/admin/messages/:id', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  const b = await body(c);
  if (!b || typeof b.read !== 'boolean') return c.json({ error: '{ read: boolean }' }, 400);
  await c.env.DB!.prepare('UPDATE messages SET read = ? WHERE id = ?').bind(b.read ? 1 : 0, c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/admin/messages/:id', async (c) => {
  const denied = await guardDb(c);
  if (denied) return denied;
  await c.env.DB!.prepare('DELETE FROM messages WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
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

/* ——— fallbacks ——— */

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  return notFound(c);
});

app.onError((err, c) => {
  console.error(err);
  return c.text('something broke.', 500);
});

export default app;
