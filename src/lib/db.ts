import type { Env } from './env';
import m0001 from '../../migrations/0001_cms.sql';
import m0002 from '../../migrations/0002_requests.sql';
import m0003 from '../../migrations/0003_services.sql';

/**
 * D1 schema + first content, applied by the worker itself: the site deploys from a git push, so nobody runs
 * `wrangler d1 migrations apply`. Uses the same `d1_migrations` table wrangler does, so either way works.
 * Migrations are additive and idempotent (IF NOT EXISTS); re-running one is harmless.
 */
const MIGRATIONS: [name: string, sql: string][] = [
  ['0001_cms.sql', m0001],
  ['0002_requests.sql', m0002],
  ['0003_services.sql', m0003],
];

let done = false;

/**
 * Resolves once the schema and seed are in place. Never throws: callers fall back.
 * Only a finished run is remembered: sharing one in-flight promise across requests could leave them all
 * waiting if the request that started it is cancelled. Concurrent cold-start runs are harmless (idempotent).
 */
export async function ensureDb(env: Env): Promise<void> {
  if (!env.DB || done) return;
  try {
    await migrate(env);
    done = true;
  } catch (e) {
    console.error('d1 migrate', (e as Error).message);
  }
}

const statements = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

async function migrate(env: Env) {
  const db = env.DB!;
  await db
    .prepare('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)')
    .run();
  const { results } = await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>();
  const done = new Set(results.map((r) => r.name));
  for (const [name, sql] of MIGRATIONS) {
    if (done.has(name)) continue;
    // one batch = one transaction: a migration lands whole or not at all
    await db.batch([...statements(sql).map((s) => db.prepare(s)), db.prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').bind(name)]);
  }
  await seed(env);
}

/* ——— first content ——— */

type Row = Record<string, string | number>;

// What the site showed before the CMS. Written once; after that the admin owns it (deleting an item keeps it deleted).
const SEED: Record<string, Row[]> = {
  identities: [
    { id: 'photographer', name: 'Photographer', href: '/photographer', meta: '', meta_url: '', caption: 'frames' },
    { id: 'dj', name: 'DJ', href: '/dj', meta: '', meta_url: '', caption: 'huismax dj channel' },
    { id: 'hiking', name: 'Hiking', href: '/hiking', meta: '', meta_url: '', caption: 'up and out' },
    { id: 'vibe-coder', name: 'Vibe coder', href: '/vibe-coder', meta: '', meta_url: '', caption: '> building tapical' },
  ],
  projects: [{ id: 'tapical', name: 'Tapical', url: 'https://tapical.us', status: 'building', note: '' }],
  music_items: ['Daniel Caesar', 'Kanye West', 'The Kid LAROI', 'Usher', 'Chris Brown'].map((title, i) => ({
    id: `artist-${i + 1}`,
    kind: 'artist',
    title,
    subtitle: '',
    url: '',
  })),
  now_items: [
    { id: 'now-building', label: 'building', text: 'Tapical', url: 'https://tapical.us' },
    { id: 'now-learning', label: 'learning', text: 'DJ transitions', url: '' },
  ],
};

async function seed(env: Env) {
  const db = env.DB!;
  const flag = await db.prepare("SELECT value FROM settings WHERE key = 'cms.seeded'").first<{ value: string }>();
  if (flag) return;
  const ts = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const [table, rows] of Object.entries(SEED)) {
    rows.forEach((row, i) => {
      const full: Row = { ...row, sort_order: i + 1, created_at: ts, updated_at: ts };
      const cols = Object.keys(full);
      stmts.push(db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map((c) => full[c])));
    });
  }
  stmts.push(...(await importKvMixes(env, ts)));
  stmts.push(db.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('cms.seeded', 'true', ?)").bind(ts));
  await db.batch(stmts);
}

/** DJ mixes added before the CMS lived in KV (`mixes`). Copied over once, published; the KV copy stays as a backup. */
async function importKvMixes(env: Env, ts: string): Promise<D1PreparedStatement[]> {
  if (!env.STATE) return [];
  type KvMix = { id: string; no: number; title: string; url: string; date: string };
  // a KV error throws, so the seed runs again on the next request instead of skipping the archive for good
  const raw = await env.STATE.get('mixes');
  let stored: unknown = null;
  try {
    stored = JSON.parse(raw ?? 'null');
  } catch {
    /* not JSON: nothing to import */
  }
  const mixes = Array.isArray(stored) ? (stored as KvMix[]) : [];
  const db = env.DB!;
  return mixes
    .filter((m) => m && typeof m.title === 'string')
    .map((m, i) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO dj_sessions (id, number, title, date, audio_url, sort_order, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
        )
        .bind(`kv-${m.id || i + 1}`, Number(m.no) || i + 1, m.title.slice(0, 120), /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : '', /^https?:\/\//.test(m.url) ? m.url : '', i + 1, ts, ts),
    );
}
