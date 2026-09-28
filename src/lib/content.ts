import type { Env } from './env';
import { ensureDb } from './db';
import { getSettings, list, SETTINGS_DEFAULTS, type CollectionName, type Item, type Settings } from './cms';

/**
 * Public reads. Every loader falls back to an empty/default value when D1 is missing or failing,
 * so a database problem degrades the page instead of breaking it.
 */

async function safe<T>(what: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    console.error(`content: ${what}`, (e as Error).message);
    return fallback;
  }
}

export async function settings(env: Env): Promise<Settings> {
  await ensureDb(env);
  if (!env.DB) return structuredClone(SETTINGS_DEFAULTS);
  return safe('settings', structuredClone(SETTINGS_DEFAULTS), () => getSettings(env));
}

/** Published / visible items of a collection, in display order. */
export async function items(env: Env, name: CollectionName, filter?: Record<string, string>): Promise<Item[]> {
  await ensureDb(env);
  if (!env.DB) return [];
  return safe(name, [], () => list(env, name, { onlyPublic: true, filter }));
}

/** What every page's layout needs: nav/footer settings and the external links. */
export type Site = { settings: Settings; links: Item[] };

export async function site(env: Env): Promise<Site> {
  const [s, links] = await Promise.all([settings(env), items(env, 'links')]);
  return { settings: s, links };
}

/** Fallback identities when D1 is unreachable, so the homepage never renders empty. */
export const FALLBACK_IDENTITIES: Item[] = [
  ['photographer', 'Photographer', '/photographer', 'frames'],
  ['dj', 'DJ', '/dj', 'huismax dj channel'],
  ['hiking', 'Hiking', '/hiking', 'up and out'],
  ['vibe-coder', 'Vibe coder', '/vibe-coder', '> building tapical'],
].map(([id, name, href, caption], i) => ({ id, name, href, caption, meta: '', meta_url: '', visible: 1, sort_order: i + 1, created_at: '', updated_at: '' }));

/** Photo as the public pages use it (only published ones ever get here). */
export type PublicPhoto = {
  id: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
  title: string;
  caption: string;
  location: string;
  date: string;
};

export const mediaUrl = (key: string) => (key ? `/media/${key}` : '');

export async function photos(env: Env, album: 'photography' | 'hiking'): Promise<PublicPhoto[]> {
  if (!env.MEDIA) return [];
  return (await items(env, 'photos', { album })).map((p) => ({
    id: String(p.id),
    src: mediaUrl(String(p.image_key)),
    thumb: mediaUrl(String(p.thumb_key || p.image_key)),
    width: Number(p.width) || 0,
    height: Number(p.height) || 0,
    title: String(p.title),
    caption: String(p.caption),
    location: String(p.location),
    date: String(p.taken_at),
  }));
}

/** DJ session as the public page uses it. */
export type PublicSession = {
  id: string;
  number: number;
  title: string;
  date: string;
  duration: string;
  description: string;
  tracklist: string[];
  audioUrl: string;
  cover: string;
};

export async function sessions(env: Env): Promise<PublicSession[]> {
  return (await items(env, 'dj')).map((s) => ({
    id: String(s.id),
    number: Number(s.number),
    title: String(s.title),
    date: String(s.date),
    duration: String(s.duration),
    description: String(s.description),
    tracklist: String(s.tracklist).split('\n').map((l) => l.trim()).filter(Boolean),
    audioUrl: String(s.audio_url),
    cover: env.MEDIA ? mediaUrl(String(s.cover_key)) : '',
  }));
}
