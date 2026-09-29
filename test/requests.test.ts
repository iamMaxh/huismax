import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import app from '../src/index';

// Requests for the next live set: the form on /dj (src/lib/requests.ts), moderated in /admin.

/** D1 over node:sqlite: just what the worker uses (prepare/bind/first/all/run, batch as one transaction). */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  type Stmt = ReturnType<typeof stmt>;
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as never[])) as object | undefined) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])), success: true }),
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
    exec: () => db.prepare(sql).run(...(args as never[])),
  });
  return {
    db,
    prepare: (sql: string) => stmt(sql),
    batch: async (list: Stmt[]) => {
      db.exec('BEGIN');
      try {
        for (const s of list) s.exec();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return [];
    },
  };
}

/** KV without expiry: tests clear the "one a minute" keys themselves. */
function fakeKV() {
  const kv = new Map<string, string>();
  return {
    kv,
    get: async (k: string, t?: unknown) => (kv.has(k) ? ((t as { type?: string })?.type === 'json' || t === 'json' ? JSON.parse(kv.get(k)!) : kv.get(k)) : null),
    put: async (k: string, v: string) => void kv.set(k, v),
    delete: async (k: string) => void kv.delete(k),
  };
}

// the radio is off air throughout (the pages ask it for the live state)
globalThis.fetch = (async () => new Response(JSON.stringify({ icestats: {} }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;

const D1 = fakeD1();
const KV = fakeKV();
const env = { DB: D1, STATE: KV, ADMIN_TOKEN: 'test-admin-token' } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

const send = (body: unknown, opts: { ip?: string; origin?: string } = {}) =>
  app.request(
    'https://huismax.com/api/dj/requests',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: opts.origin ?? 'https://huismax.com', 'CF-Connecting-IP': opts.ip ?? '203.0.113.7' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
    ctx,
  );
const rows = () => D1.db.prepare('SELECT request, name, published FROM dj_requests ORDER BY created_at').all() as { request: string; name: string; published: number }[];
const nextMinute = () => {
  for (const k of [...KV.kv.keys()]) if (/^\w+:recent:/.test(k)) KV.kv.delete(k);
};
const admin = (path: string, init: RequestInit = {}) =>
  app.request(`https://huismax.com${path}`, { ...init, headers: { authorization: 'Bearer test-admin-token', 'content-type': 'application/json', ...init.headers } }, env, ctx);
const djPage = async () => (await app.request('https://huismax.com/dj', {}, env, ctx)).text();

test('a request is saved as a draft: hidden from /dj until published', async () => {
  const res = await send({ request: '  Fred again..   – Delilah  ', name: 'max from   berlin' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(rows().map((r) => ({ ...r })), [{ request: 'Fred again.. – Delilah', name: 'max from berlin', published: 0 }]);
  const html = await djPage();
  assert.match(html, /What should I play next live\?/);
  assert.match(html, /<form class="reply-form requests-form" data-request-form="true"/);
  assert.doesNotMatch(html, /Delilah/, 'not shown before it is published');
  assert.match(html, /nothing picked yet/);
});

test('checks: text required and at most 200 characters; names cut to 40; other origins refused; the honeypot drops bots', async () => {
  nextMinute();
  for (const [body, error] of [
    [{ request: '   ' }, 'tell me what to play first'],
    [{}, 'tell me what to play first'],
    [{ request: 'x'.repeat(201) }, '200 characters max'],
  ] as const) {
    const res = await send(body);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, error);
  }
  assert.equal((await send('{not json')).status, 400);
  assert.equal((await send({ request: 'anything' }, { origin: 'https://evil.example' })).status, 403);

  const before = rows().length;
  const trap = await send({ request: 'buy cheap pills', website: 'https://spam.example' });
  assert.deepEqual(await trap.json(), { ok: true }, 'a bot is told it worked');
  assert.equal(rows().length, before, '…but nothing is kept');

  assert.equal((await send({ request: 'x'.repeat(200), name: 'n'.repeat(60) })).status, 200);
  assert.equal(rows().at(-1)!.name.length, 40);
});

test('rate limits: one a minute and five a day per visitor, apart from /reply; 30 an hour site-wide', async () => {
  D1.db.exec('DELETE FROM dj_requests');
  KV.kv.clear();
  const ip = '198.51.100.20';
  assert.equal((await send({ request: 'one' }, { ip })).status, 200);
  let res = await send({ request: 'two' }, { ip });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'one request a minute, please');
  assert.equal((await send({ request: 'someone else' }, { ip: '198.51.100.99' })).status, 200, 'another visitor is not held up');

  for (let i = 2; i <= 5; i++) {
    nextMinute();
    assert.equal((await send({ request: `track ${i}` }, { ip })).status, 200);
  }
  nextMinute();
  res = await send({ request: 'six' }, { ip });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "that's 5 today. try again tomorrow");

  // /reply keeps its own count and wording
  const reply = await app.request(
    'https://huismax.com/api/reply',
    { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://huismax.com', 'CF-Connecting-IP': ip }, body: JSON.stringify({ message: 'hi' }) },
    env,
    ctx,
  );
  assert.equal(reply.status, 200, 'requests do not use up /reply');
  const again = await app.request(
    'https://huismax.com/api/reply',
    { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://huismax.com', 'CF-Connecting-IP': ip }, body: JSON.stringify({ message: 'hi again' }) },
    env,
    ctx,
  );
  assert.equal((await again.json()).error, 'one message a minute, please');

  // many addresses can't flood the list
  const now = new Date().toISOString();
  const add = D1.db.prepare("INSERT INTO dj_requests (id, request, name, created_at, updated_at) VALUES (?, 'flood', '', ?, ?)");
  for (let i = rows().length; i < 30; i++) add.run(`flood-${i}`, now, now);
  res = await send({ request: 'one more' }, { ip: '192.0.2.1' });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'too many requests right now. try again later');
});

test('/admin lists every request; publishing one puts it on /dj, newest first', async () => {
  D1.db.exec('DELETE FROM dj_requests');
  KV.kv.clear();
  assert.equal((await send({ request: 'Burial – Archangel', name: 'jo' }, { ip: '192.0.2.10' })).status, 200);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await send({ request: 'something <b>loud</b>' }, { ip: '192.0.2.11' })).status, 200);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await send({ request: 'keep this one hidden' }, { ip: '192.0.2.12' })).status, 200);

  // the public can't read the drafts
  assert.equal((await app.request('https://huismax.com/api/admin/c/requests', {}, env, ctx)).status, 401);
  const list = (await (await admin('/api/admin/c/requests')).json()) as { id: string; request: string; published: number }[];
  assert.deepEqual(list.map((r) => [r.request, r.published]), [
    ['keep this one hidden', 0],
    ['something <b>loud</b>', 0],
    ['Burial – Archangel', 0],
  ], 'newest first, all drafts');

  for (const r of list.slice(1)) {
    const res = await admin(`/api/admin/c/requests/${r.id}`, { method: 'PATCH', body: JSON.stringify({ published: 1 }) });
    assert.equal(res.status, 200);
  }
  const html = await djPage();
  const picked = html.slice(html.indexOf('class="requests-list"'), html.indexOf('</ol>', html.indexOf('class="requests-list"')));
  assert.match(picked, /something &lt;b&gt;loud&lt;\/b&gt;.*Burial – Archangel<\/span><span class="mono dim">from jo<\/span>/s, 'newest first, escaped, with the name');
  assert.doesNotMatch(html, /keep this one hidden/);
  assert.match(html, /on the list <span class="dim">2<\/span>/);
});

test('hiding /dj in /admin closes the form; without D1 the page has no form', async () => {
  KV.kv.clear();
  assert.equal((await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ pages: { dj: false } }) })).status, 200);
  assert.equal((await send({ request: 'anything' }, { ip: '192.0.2.50' })).status, 404);
  assert.equal((await admin('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ pages: { dj: true } }) })).status, 200);
  assert.equal((await send({ request: 'anything' }, { ip: '192.0.2.50' })).status, 200);

  const offline = await app.request('https://huismax.com/dj', {}, { STATE: KV } as never, ctx);
  assert.equal(offline.status, 200);
  assert.doesNotMatch(await offline.text(), /data-request-form/);
  const post = await app.request(
    'https://huismax.com/api/dj/requests',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: 'x' }) },
    { STATE: KV } as never,
    ctx,
  );
  assert.equal(post.status, 503);
});
