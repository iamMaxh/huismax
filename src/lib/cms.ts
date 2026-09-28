import type { Env } from './env';

/**
 * The CMS: every editable list on the site is a "collection" (one D1 table), plus a small set of settings.
 * Table and column names only ever come from the definitions below, never from a request.
 */

type FieldType =
  | 'text' // one line
  | 'long' // multi-line
  | 'url' // absolute http(s) link, may be empty unless required
  | 'link' // site path (/dj) or absolute http(s) link
  | 'date' // YYYY-MM-DD, may be empty
  | 'int'
  | 'real'
  | 'enum';

export type Field = {
  name: string;
  type: FieldType;
  label: string;
  max?: number;
  required?: boolean;
  options?: readonly string[];
  min?: number;
  hint?: string;
};

export type CollectionDef = {
  table: string;
  /** column that hides an item from the public site */
  flag: 'visible' | 'published';
  /** default for new items: drafts for photos and sessions, live for small lists */
  flagDefault: 0 | 1;
  fields: Field[];
  /** public/admin order; 'sort' = manual (drag to reorder) */
  order: 'sort' | 'number';
  /** enum columns a list can be narrowed by (?album=hiking) */
  filters?: string[];
};

const t = (name: string, label: string, max = 120, extra: Partial<Field> = {}): Field => ({ name, type: 'text', label, max, ...extra });

export const COLLECTIONS = {
  identities: {
    table: 'identities',
    flag: 'visible',
    flagDefault: 1,
    order: 'sort',
    fields: [
      t('name', 'name', 40, { required: true }),
      { name: 'href', type: 'link', label: 'goes to', max: 300, required: true, hint: '/photographer or https://…' },
      t('meta', 'small text on the right', 40),
      { name: 'meta_url', type: 'url', label: 'small text links to', max: 300 },
      t('caption', 'typed on hover', 60),
    ],
  },
  projects: {
    table: 'projects',
    flag: 'visible',
    flagDefault: 1,
    order: 'sort',
    fields: [
      t('name', 'name', 60, { required: true }),
      { name: 'url', type: 'url', label: 'link', max: 300 },
      { name: 'status', type: 'enum', label: 'status', options: ['building', 'live', 'paused', 'soon'] },
      t('note', 'note', 200),
    ],
  },
  music: {
    table: 'music_items',
    flag: 'published',
    flagDefault: 1,
    order: 'sort',
    filters: ['kind'],
    fields: [
      { name: 'kind', type: 'enum', label: 'section', options: ['artist', 'rotation', 'featured'], required: true },
      t('title', 'title', 120, { required: true }),
      t('subtitle', 'artist / detail', 120),
      { name: 'url', type: 'url', label: 'link', max: 300 },
    ],
  },
  now: {
    table: 'now_items',
    flag: 'visible',
    flagDefault: 1,
    order: 'sort',
    fields: [t('label', 'label', 30, { hint: 'optional, e.g. building' }), t('text', 'text', 200, { required: true }), { name: 'url', type: 'url', label: 'link', max: 300 }],
  },
  photos: {
    table: 'photos',
    flag: 'published',
    flagDefault: 0,
    order: 'sort',
    fields: [
      { name: 'album', type: 'enum', label: 'album', options: ['photography', 'hiking'], required: true },
      t('title', 'title', 120),
      t('caption', 'caption', 400, { type: 'long' }),
      t('location', 'location', 80),
      { name: 'taken_at', type: 'date', label: 'date' },
    ],
    filters: ['album'],
  },
  dj: {
    table: 'dj_sessions',
    flag: 'published',
    flagDefault: 0,
    order: 'number',
    fields: [
      { name: 'number', type: 'int', label: 'no.', min: 1, hint: 'empty = next number' },
      t('title', 'title', 120, { required: true }),
      { name: 'date', type: 'date', label: 'date' },
      t('duration', 'duration', 12, { hint: '1:02:30' }),
      { name: 'audio_url', type: 'url', label: 'audio link', max: 500, hint: 'direct .mp3 / .m4a' },
      t('description', 'description', 1000, { type: 'long' }),
      t('tracklist', 'tracklist', 4000, { type: 'long', hint: 'one track per line' }),
    ],
  },
  links: {
    table: 'links',
    flag: 'visible',
    flagDefault: 1,
    order: 'sort',
    fields: [t('label', 'label', 40, { required: true }), { name: 'url', type: 'url', label: 'url', max: 300, required: true }],
  },
} satisfies Record<string, CollectionDef>;

export type CollectionName = keyof typeof COLLECTIONS;
export const isCollection = (n: string): n is CollectionName => Object.hasOwn(COLLECTIONS, n);

export type Item = Record<string, string | number> & { id: string; sort_order: number; created_at: string; updated_at: string };

export class InputError extends Error {}

const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** http(s) only. Anything else (javascript:, data:, mailto:…) is rejected. */
const isHttp = (v: string) => {
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
  } catch {
    return false;
  }
};
export const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;
const isSitePath = (v: string) => /^\/(?!\/)[\w\-./#?=&%]*$/.test(v);
/** A day that exists: 2026-02-31 and 2026-13-01 match the shape but not the calendar. */
const realDate = (v: string) => {
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

function clean(f: Field, raw: unknown): string | number {
  if (f.type === 'int' || f.type === 'real') {
    if (raw === '' || raw === null || raw === undefined) {
      if (f.required) throw new InputError(`${f.label} is required`);
      return 0;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) throw new InputError(`${f.label} must be a number`);
    if (f.min !== undefined && n < f.min) throw new InputError(`${f.label} must be at least ${f.min}`);
    if (Math.abs(n) > 1e9) throw new InputError(`${f.label} is too large`);
    return f.type === 'real' ? Math.round(n * 100) / 100 : n;
  }
  let v = typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw);
  v = f.type === 'long' ? v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : v.replace(/\s+/g, ' ').trim();
  if (f.max && v.length > f.max) throw new InputError(`${f.label}: ${f.max} characters max`);
  if (!v) {
    if (f.required) throw new InputError(`${f.label} is required`);
    return '';
  }
  if (f.type === 'url' && !isHttp(v)) throw new InputError(`${f.label} must start with https://`);
  if (f.type === 'link' && !isHttp(v) && !isSitePath(v)) throw new InputError(`${f.label} must be a /path or an https:// link`);
  if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !realDate(v))) throw new InputError(`${f.label} must be a real date (YYYY-MM-DD)`);
  if (f.type === 'enum' && !f.options!.includes(v)) throw new InputError(`${f.label} must be one of ${f.options!.join(', ')}`);
  return v;
}

/** Validates the editable fields present in `input` (all of them when `full`). Unknown keys are ignored. */
export function validate(def: CollectionDef, input: Record<string, unknown>, full: boolean) {
  const out: Record<string, string | number> = {};
  for (const f of def.fields) {
    if (!full && !(f.name in input)) continue;
    out[f.name] = clean(f, input[f.name]);
  }
  if (def.flag in input) out[def.flag] = input[def.flag] ? 1 : 0;
  return out;
}

const orderBy = (def: CollectionDef) => (def.order === 'number' ? 'number DESC, created_at DESC' : 'sort_order ASC, created_at ASC');

export async function list(env: Env, name: CollectionName, opts: { onlyPublic?: boolean; filter?: Record<string, string> } = {}): Promise<Item[]> {
  const def: CollectionDef = COLLECTIONS[name];
  const where: string[] = [];
  const binds: string[] = [];
  if (opts.onlyPublic) where.push(`${def.flag} = 1`);
  for (const [col, val] of Object.entries(opts.filter ?? {})) {
    if (!def.filters?.includes(col)) continue; // column names only from the definition
    where.push(`${col} = ?`);
    binds.push(val);
  }
  const sql = `SELECT * FROM ${def.table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy(def)}`;
  const { results } = await env.DB!.prepare(sql).bind(...binds).all<Item>();
  return results;
}

export async function get(env: Env, name: CollectionName, id: string): Promise<Item | null> {
  const def: CollectionDef = COLLECTIONS[name];
  return env.DB!.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(id).first<Item>();
}

/** Sessions are known by their number (/dj archive, admin rows), so two can't share one. */
async function uniqueNumber(env: Env, values: Record<string, string | number>, id: string) {
  if (!values.number) return;
  const dup = await env.DB!.prepare('SELECT title FROM dj_sessions WHERE number = ? AND id != ?').bind(values.number, id).first<{ title: string }>();
  if (dup) throw new InputError(`no. ${values.number} is already used by “${dup.title}”`);
}

/** Creates an item; `extra` carries server-owned columns (e.g. photo keys) that never come from the form. */
export async function create(env: Env, name: CollectionName, input: Record<string, unknown>, extra: Record<string, string | number> = {}) {
  const def: CollectionDef = COLLECTIONS[name];
  const values = { ...validate(def, input, true), ...extra };
  if (!(def.flag in values)) values[def.flag] = def.flagDefault;
  const db = env.DB!;
  if (name === 'dj') await uniqueNumber(env, values, '');
  if (name === 'dj' && !values.number) {
    const row = await db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM dj_sessions').first<{ n: number }>();
    values.number = row?.n ?? 1;
  }
  // new items go to the end of a manually ordered list
  const last = await db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${def.table}`).first<{ m: number }>();
  const ts = now();
  const row: Record<string, string | number> = { id: newId(), ...values, sort_order: (last?.m ?? 0) + 1, created_at: ts, updated_at: ts };
  const cols = Object.keys(row);
  await db.prepare(`INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map((c) => row[c])).run();
  return (await get(env, name, row.id as string))!;
}

export async function update(env: Env, name: CollectionName, id: string, input: Record<string, unknown>, extra: Record<string, string | number> = {}) {
  const def: CollectionDef = COLLECTIONS[name];
  const values: Record<string, string | number> = { ...validate(def, input, false), ...extra };
  const db = env.DB!;
  if (name === 'dj' && 'number' in values) {
    if (values.number) await uniqueNumber(env, values, id);
    else {
      // "empty = next number", as when adding (this session itself not counted)
      const row = await db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM dj_sessions WHERE id != ?').bind(id).first<{ n: number }>();
      values.number = row?.n ?? 1;
    }
  }
  if (name === 'music' && 'kind' in values) {
    // moved to another section: to the end of it, like a new item
    const cur = await get(env, name, id);
    if (cur && cur.kind !== values.kind) {
      const row = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM music_items').first<{ n: number }>();
      values.sort_order = row?.n ?? 1;
    }
  }
  const cols = Object.keys(values);
  if (!cols.length) return get(env, name, id);
  const res = await db.prepare(`UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...cols.map((c) => values[c]), now(), id)
    .run();
  if (!res.meta.changes) return null;
  return get(env, name, id);
}

export async function remove(env: Env, name: CollectionName, id: string) {
  const def: CollectionDef = COLLECTIONS[name];
  const res = await env.DB!.prepare(`DELETE FROM ${def.table} WHERE id = ?`).bind(id).run();
  return res.meta.changes > 0;
}

/** Saves a manual order: `ids` first to last. Ids that don't exist are ignored. */
export async function reorder(env: Env, name: CollectionName, ids: unknown) {
  const def: CollectionDef = COLLECTIONS[name];
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((x) => typeof x === 'string' && x.length <= 40)) throw new InputError('bad order');
  const db = env.DB!;
  const ts = now();
  await db.batch((ids as string[]).map((id, i) => db.prepare(`UPDATE ${def.table} SET sort_order = ?, updated_at = ? WHERE id = ?`).bind(i + 1, ts, id)));
}

/* ——— settings ——— */

export const PAGE_KEYS = ['photographer', 'dj', 'hiking', 'vibe-coder', 'music', 'now', 'reply'] as const;
export const NAV_KEYS = ['music', 'dj', 'now', 'reply'] as const;
export type PageKeyCms = (typeof PAGE_KEYS)[number];

export type Settings = {
  headline: string;
  tagline: string;
  description: string;
  footer: string;
  spotifyProfile: string;
  /** header nav + menu */
  nav: Record<(typeof NAV_KEYS)[number], boolean>;
  /** public pages; a hidden page is a 404 for visitors */
  pages: Record<PageKeyCms, boolean>;
  /** one line under each page title, also the page's meta description */
  intros: Record<PageKeyCms, string>;
  /** PRIVATE (never rendered): where /reply messages are emailed, and the Resend sender */
  replyTo: string;
  replyFrom: string;
};

/** Settings that must never reach a public page or client JSON. */
export const PRIVATE_SETTINGS = ['replyTo', 'replyFrom'] as const;

export const SETTINGS_DEFAULTS: Settings = {
  headline: 'WHO IS MAX?',
  tagline: '',
  description: 'WHO IS MAX?',
  footer: 'huismax © 2026',
  spotifyProfile: 'https://open.spotify.com/user/31tzngiyvyxa4yh6ntw4zewh5h7e?si=95b388b5c75a4352',
  nav: { music: true, dj: true, now: true, reply: true },
  pages: { photographer: true, dj: true, hiking: true, 'vibe-coder': true, music: true, now: true, reply: true },
  intros: { photographer: '', dj: '', hiking: '', 'vibe-coder': '', music: '', now: '', reply: '' },
  replyTo: '',
  replyFrom: '', // empty: EMAIL_FROM, else Resend's test sender (see reply.ts)
};

const TEXT_LIMITS: Partial<Record<keyof Settings, number>> = { headline: 40, tagline: 160, description: 200, footer: 80 };

/** Validates a partial settings object. Unknown keys are ignored. */
export function validateSettings(input: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const k of ['headline', 'tagline', 'description', 'footer'] as const) {
    if (!(k in input)) continue;
    const v = typeof input[k] === 'string' ? (input[k] as string).replace(/\s+/g, ' ').trim() : '';
    if (v.length > TEXT_LIMITS[k]!) throw new InputError(`${k}: ${TEXT_LIMITS[k]} characters max`);
    if (k === 'headline' && !v) throw new InputError('headline is required');
    out[k] = v;
  }
  if ('replyTo' in input) {
    const v = typeof input.replyTo === 'string' ? input.replyTo.trim() : '';
    if (v && !EMAIL.test(v)) throw new InputError('reply email is not an email address');
    out.replyTo = v;
  }
  if ('replyFrom' in input) {
    const v = typeof input.replyFrom === 'string' ? input.replyFrom.replace(/\s+/g, ' ').trim() : '';
    // "name <address>" or a bare address
    const addr = v.match(/<([^>]+)>$/)?.[1] ?? v;
    if (v && (!EMAIL.test(addr) || v.length > 120)) throw new InputError('sender must look like: huismax <reply@huismax.com>');
    out.replyFrom = v;
  }
  if ('spotifyProfile' in input) {
    const v = typeof input.spotifyProfile === 'string' ? input.spotifyProfile.trim() : '';
    if (v && !isHttp(v)) throw new InputError('spotify profile must start with https://');
    if (v.length > 300) throw new InputError('spotify profile: 300 characters max');
    out.spotifyProfile = v;
  }
  const flags = <K extends string>(key: 'nav' | 'pages', keys: readonly K[]) => {
    if (!(key in input)) return;
    const src = input[key];
    if (!src || typeof src !== 'object') throw new InputError(`bad ${key}`);
    // only the keys sent; saveSettings merges them over what is stored
    const cur: Record<string, boolean> = {};
    for (const k of keys) if (k in (src as object)) cur[k] = !!(src as Record<string, unknown>)[k];
    (out as Record<string, unknown>)[key] = cur;
  };
  flags('nav', NAV_KEYS);
  flags('pages', PAGE_KEYS);
  if ('intros' in input) {
    const src = input.intros as Record<string, unknown>;
    if (!src || typeof src !== 'object') throw new InputError('bad intros');
    const cur: Partial<Settings['intros']> = {};
    for (const k of PAGE_KEYS) {
      if (!(k in src)) continue;
      const v = typeof src[k] === 'string' ? (src[k] as string).replace(/\s+/g, ' ').trim() : '';
      if (v.length > 240) throw new InputError(`${k} intro: 240 characters max`);
      cur[k] = v;
    }
    out.intros = cur as Settings['intros'];
  }
  return out;
}

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB!.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const s: Settings = structuredClone(SETTINGS_DEFAULTS);
  for (const r of results) {
    if (!(r.key in s)) continue;
    try {
      const v = JSON.parse(r.value);
      const k = r.key as keyof Settings;
      // merge flag/intro maps so keys added later get their default
      (s as Record<string, unknown>)[k] = typeof s[k] === 'object' ? { ...(s[k] as object), ...v } : v;
    } catch {
      /* keep default */
    }
  }
  return s;
}

const UPSERT = 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, value = ';

/**
 * Saves the given settings and returns the full result. Maps (nav, pages, intros) are merged inside D1 with
 * json_patch, so two switches flipped a moment apart can't overwrite each other.
 */
export async function saveSettings(env: Env, input: Record<string, unknown>): Promise<Settings> {
  const next = validateSettings(input);
  const db = env.DB!;
  const ts = now();
  const stmts = Object.entries(next).map(([k, v]) =>
    db
      .prepare(
        v && typeof v === 'object'
          ? `${UPSERT}CASE WHEN json_valid(settings.value) THEN json_patch(settings.value, excluded.value) ELSE excluded.value END`
          : `${UPSERT}excluded.value`,
      )
      .bind(k, JSON.stringify(v), ts),
  );
  if (stmts.length) await db.batch(stmts);
  return getSettings(env);
}
