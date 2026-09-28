import type { Env } from './env';

/** DJ archive, managed from /admin. Numbered 001, 002… in the order they were added. */
export type Mix = { id: string; no: number; title: string; url: string; date: string; addedAt: string };

const KEY = 'mixes';

export async function getMixes(env: Env): Promise<Mix[]> {
  if (!env.STATE) return [];
  return (await env.STATE.get<Mix[]>(KEY, { type: 'json', cacheTtl: 30 })) ?? [];
}

const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export async function addMix(env: Env, input: Record<string, unknown>): Promise<Mix[]> {
  const title = clean(input.title, 100);
  const url = clean(input.url, 500);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) ? String(input.date) : new Date().toISOString().slice(0, 10);
  if (!title) throw new Error('title required');
  if (!/^https:\/\/\S+$/.test(url)) throw new Error('link must start with https://');
  const list = await getMixes(env);
  const no = list.reduce((m, x) => Math.max(m, x.no), 0) + 1;
  list.push({ id: crypto.randomUUID().slice(0, 8), no, title, url, date, addedAt: new Date().toISOString() });
  await env.STATE!.put(KEY, JSON.stringify(list));
  return list;
}

export async function removeMix(env: Env, id: string): Promise<Mix[]> {
  const list = (await getMixes(env)).filter((m) => m.id !== id);
  await env.STATE!.put(KEY, JSON.stringify(list));
  return list;
}
