import type { Env } from './env';

/**
 * Spotify Web API, server side only. The client secret, refresh token and access token live in
 * secrets / KV and never reach the browser; the public endpoints return plain track data.
 */

export const SCOPES = 'user-read-currently-playing user-read-recently-played user-top-read';

export type Track = {
  name: string;
  artists: string;
  album: string;
  artwork: string | null;
  /** small artwork for lists */
  thumb: string | null;
  url: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  playedAt: string | null;
};

export type NowResult =
  | { state: 'playing' | 'paused' | 'recent'; track: Track; fetchedAt: string }
  | { state: 'idle' | 'unconfigured' | 'disconnected' | 'error'; track: null; fetchedAt: string };

export type RecentResult = {
  state: 'ok' | 'unconfigured' | 'disconnected' | 'error';
  recent: Track[];
  onRepeat: Track[];
};

const K = { refresh: 'spotify:refresh', access: 'spotify:access', user: 'spotify:user', state: 'spotify:oauth:' };

const accountsBase = (env: Env) => env.SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com';
const apiBase = (env: Env) => env.SPOTIFY_API_BASE || 'https://api.spotify.com';

// Trimmed: values pasted from the Spotify dashboard often carry a stray space or newline.
const clientId = (env: Env) => env.SPOTIFY_CLIENT_ID?.trim() ?? '';
const clientSecret = (env: Env) => env.SPOTIFY_CLIENT_SECRET?.trim() ?? '';

export const configured = (env: Env) => !!(clientId(env) && clientSecret(env) && env.STATE);

const REQUIRED = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'] as const;

/**
 * Admin-only setup hints, by variable NAME (values are never read out): which required names are
 * missing, and which similarly named variables exist instead (e.g. a typo or lowercase name).
 */
export function setupHints(env: Env) {
  const vars = env as unknown as Record<string, unknown>;
  const missing = REQUIRED.filter((k) => typeof vars[k] !== 'string' || !(vars[k] as string).trim());
  const similar = Object.keys(vars).filter(
    (k) => /spotify|client.?(id|secret)/i.test(k) && !(REQUIRED as readonly string[]).includes(k) && !/^SPOTIFY_(ACCOUNTS|API)_BASE$/.test(k),
  );
  return { missing: [...missing, ...(env.STATE ? [] : ['STATE (KV binding)'])], similar };
}

export class SpotifyError extends Error {
  constructor(public kind: 'disconnected' | 'error', message: string) {
    super(message);
  }
}

/* ——— OAuth ——— */

export async function authorizeUrl(env: Env, redirectUri: string) {
  const state = crypto.randomUUID();
  await env.STATE!.put(K.state + state, '1', { expirationTtl: 600 });
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(env),
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${accountsBase(env)}/authorize?${q}`;
}

async function tokenRequest(env: Env, body: Record<string, string>) {
  const res = await fetch(`${accountsBase(env)}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${clientId(env)}:${clientSecret(env)}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    // invalid_grant = refresh token revoked / expired → needs a new login
    throw new SpotifyError(data.error === 'invalid_grant' ? 'disconnected' : 'error', `token ${res.status} ${data.error ?? ''}`);
  }
  return data as { access_token: string; expires_in: number; refresh_token?: string };
}

async function storeAccess(env: Env, token: string, expiresIn: number) {
  await env.STATE!.put(K.access, JSON.stringify({ token, exp: Date.now() + (expiresIn - 60) * 1000 }), {
    expirationTtl: Math.max(60, expiresIn - 60),
  });
}

export async function handleCallback(env: Env, code: string, state: string, redirectUri: string) {
  if (!(await env.STATE!.get(K.state + state))) throw new SpotifyError('error', 'invalid state');
  await env.STATE!.delete(K.state + state);
  const t = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new SpotifyError('error', 'no refresh token');
  await env.STATE!.put(K.refresh, t.refresh_token);
  await storeAccess(env, t.access_token, t.expires_in);
  const me = await api<{ display_name?: string; id: string }>(env, '/v1/me').catch(() => null);
  if (me) await env.STATE!.put(K.user, me.display_name || me.id);
}

export async function disconnect(env: Env) {
  await Promise.all([K.refresh, K.access, K.user].map((k) => env.STATE!.delete(k)));
}

export const connectedAs = async (env: Env) => (env.STATE && (await env.STATE.get(K.refresh)) ? (await env.STATE.get(K.user)) ?? 'connected' : null);

async function accessToken(env: Env): Promise<string> {
  const cached = await env.STATE!.get<{ token: string; exp: number }>(K.access, 'json');
  if (cached && cached.exp > Date.now()) return cached.token;
  const refresh = await env.STATE!.get(K.refresh);
  if (!refresh) throw new SpotifyError('disconnected', 'not connected');
  const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refresh });
  if (t.refresh_token && t.refresh_token !== refresh) await env.STATE!.put(K.refresh, t.refresh_token);
  await storeAccess(env, t.access_token, t.expires_in);
  return t.access_token;
}

async function api<T>(env: Env, path: string, retried = false): Promise<T | null> {
  const token = await accessToken(env);
  const res = await fetch(apiBase(env) + path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;
  if (res.status === 401 && !retried) {
    await env.STATE!.delete(K.access);
    return api<T>(env, path, true);
  }
  if (!res.ok) throw new SpotifyError('error', `api ${res.status} ${path}`);
  return (await res.json()) as T;
}

/* ——— mapping ——— */

type SpTrack = {
  name: string;
  duration_ms: number;
  external_urls?: { spotify?: string };
  artists?: { name: string }[];
  album?: { name: string; images?: { url: string; width: number }[] };
};

function toTrack(t: SpTrack, extra: Partial<Track> = {}): Track {
  const images = [...(t.album?.images ?? [])].sort((a, b) => b.width - a.width);
  return {
    name: t.name,
    artists: (t.artists ?? []).map((a) => a.name).join(', '),
    album: t.album?.name ?? '',
    artwork: images[0]?.url ?? null,
    thumb: images.find((i) => i.width <= 300)?.url ?? images[0]?.url ?? null,
    url: t.external_urls?.spotify ?? null,
    durationMs: t.duration_ms,
    progressMs: 0,
    isPlaying: false,
    playedAt: null,
    ...extra,
  };
}

/* ——— public reads ——— */

export async function nowPlaying(env: Env): Promise<NowResult> {
  const fetchedAt = new Date().toISOString();
  if (!configured(env)) return { state: 'unconfigured', track: null, fetchedAt };
  try {
    const cur = await api<{ is_playing: boolean; progress_ms: number | null; item: SpTrack | null; currently_playing_type: string }>(
      env, '/v1/me/player/currently-playing',
    );
    if (cur?.item && cur.currently_playing_type === 'track') {
      return {
        state: cur.is_playing ? 'playing' : 'paused',
        track: toTrack(cur.item, { progressMs: cur.progress_ms ?? 0, isPlaying: cur.is_playing }),
        fetchedAt,
      };
    }
    const recent = await api<{ items: { track: SpTrack; played_at: string }[] }>(env, '/v1/me/player/recently-played?limit=1');
    const last = recent?.items?.[0];
    if (last) return { state: 'recent', track: toTrack(last.track, { playedAt: last.played_at }), fetchedAt };
    return { state: 'idle', track: null, fetchedAt };
  } catch (e) {
    console.error('spotify now', (e as Error).message);
    return { state: e instanceof SpotifyError ? e.kind : 'error', track: null, fetchedAt };
  }
}

export async function recent(env: Env): Promise<RecentResult> {
  if (!configured(env)) return { state: 'unconfigured', recent: [], onRepeat: [] };
  try {
    const [r, top] = await Promise.all([
      api<{ items: { track: SpTrack; played_at: string }[] }>(env, '/v1/me/player/recently-played?limit=20'),
      api<{ items: SpTrack[] }>(env, '/v1/me/top/tracks?time_range=short_term&limit=5').catch(() => null),
    ]);
    // collapse repeats so the list reads as a history, not the same song five times
    const seen = new Set<string>();
    const list: Track[] = [];
    for (const it of r?.items ?? []) {
      const key = `${it.track.name}|${it.track.artists?.[0]?.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(toTrack(it.track, { playedAt: it.played_at }));
      if (list.length === 8) break;
    }
    return { state: 'ok', recent: list, onRepeat: (top?.items ?? []).map((t) => toTrack(t)) };
  } catch (e) {
    console.error('spotify recent', (e as Error).message);
    return { state: e instanceof SpotifyError ? e.kind : 'error', recent: [], onRepeat: [] };
  }
}
