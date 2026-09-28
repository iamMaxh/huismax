import type { Env } from './env';

export type LiveStatus = {
  isLive: boolean;
  label: 'LIVE' | 'OFF AIR';
  streamUrl: string | null;
  sessionTitle: string | null;
  startedAt: string | null;
  updatedAt: string;
};

/** Shape stored in KV under `live`. Any field left out falls back to env vars. */
export type LiveOverride = Partial<Pick<LiveStatus, 'isLive' | 'streamUrl' | 'sessionTitle' | 'startedAt'>> & {
  updatedAt?: string;
};

const KV_KEY = 'live';

/**
 * Resolution order: mock (dev only) → KV override → env vars.
 * To plug in a real stream later (Icecast / Mixcloud Live / a webhook from OBS),
 * replace or extend `readSource` — every consumer goes through `getLiveStatus`.
 */
export async function getLiveStatus(env: Env, mock?: string | null): Promise<LiveStatus> {
  const src = await readSource(env, mock);
  const isLive = Boolean(src.isLive);
  return {
    isLive,
    label: isLive ? 'LIVE' : 'OFF AIR',
    streamUrl: src.streamUrl || null,
    sessionTitle: src.sessionTitle || null,
    startedAt: isLive ? src.startedAt || null : null,
    updatedAt: src.updatedAt || new Date().toISOString(),
  };
}

async function readSource(env: Env, mock?: string | null): Promise<LiveOverride> {
  const base: LiveOverride = {
    isLive: env.LIVE === 'true',
    streamUrl: env.LIVE_STREAM_URL,
    sessionTitle: env.LIVE_SESSION_TITLE,
  };

  if (mock && env.ALLOW_MOCK === '1') {
    return mock === 'live'
      ? { ...base, isLive: true, sessionTitle: base.sessionTitle || 'late set — r&b / edits', startedAt: new Date(Date.now() - 47 * 60e3).toISOString() }
      : { ...base, isLive: false };
  }

  if (env.STATE) {
    const override = await env.STATE.get<LiveOverride>(KV_KEY, { type: 'json', cacheTtl: 30 });
    if (override) return { ...base, ...override };
  }
  return base;
}

export async function setLiveStatus(env: Env, next: LiveOverride): Promise<LiveStatus> {
  if (!env.STATE) throw new Error('STATE KV namespace is not bound');
  const prev = (await env.STATE.get<LiveOverride>(KV_KEY, 'json')) ?? {};
  const merged: LiveOverride = { ...prev, ...next, updatedAt: new Date().toISOString() };
  if (next.isLive && !prev.isLive) merged.startedAt = next.startedAt ?? new Date().toISOString();
  if (next.isLive === false) merged.startedAt = undefined;
  await env.STATE.put(KV_KEY, JSON.stringify(merged));
  return getLiveStatus(env);
}
