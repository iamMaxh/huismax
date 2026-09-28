import type { Env } from './env';

/** Personal state shown under the identities. Stored in KV; live status overrides it on display only. */
export type Presence = {
  status: string;
  listening: { title: string; artist: string } | null;
  updatedAt: string | null;
};

export const STATUS_PRESETS = [
  'locked in', 'deep work', 'building', 'plotting', 'lowkey busy', 'listening',
  'on the move', 'cruising', 'outside', 'touching grass', 'wandering', 'somewhere',
  'vibing', 'recharging', 'afk', 'offline-ish', 'unavailable',
] as const;

const KEY = 'presence';
const DEFAULT: Presence = {
  status: 'building',
  listening: null,
  updatedAt: null,
};

export async function getPresence(env: Env): Promise<Presence> {
  if (!env.STATE) return DEFAULT;
  const stored = await env.STATE.get<Partial<Presence>>(KEY, { type: 'json', cacheTtl: 30 });
  return { ...DEFAULT, ...stored };
}

const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export async function setPresence(env: Env, input: Record<string, unknown>): Promise<Presence> {
  if (!env.STATE) throw new Error('STATE KV namespace is not bound');
  const prev = await getPresence(env);
  const next: Presence = { ...prev, updatedAt: new Date().toISOString() };
  if ('status' in input) next.status = clean(input.status, 48);
  if ('listening' in input) {
    const l = input.listening as Record<string, unknown> | null;
    const title = clean(l?.title, 80), artist = clean(l?.artist, 80);
    next.listening = title ? { title, artist } : null;
  }
  await env.STATE.put(KEY, JSON.stringify(next));
  return next;
}
