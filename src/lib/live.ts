import type { Env } from './env';
import { radioStatus, radioStreamUrl } from './radio';

export type LiveStatus = {
  isLive: boolean;
  label: 'LIVE' | '';
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
 * Live when the radio is on air (Icecast has the /live.mp3 mount: BUTT is streaming, src/lib/radio.ts) or when it
 * was switched on by hand. Hand settings resolve mock (dev only) → KV override → env vars; they still give the
 * session title, and the stream for anything that isn't the radio. Every consumer goes through `getLiveStatus`.
 * `radio: false` gives the hand setting alone (the /admin switch).
 */
export async function getLiveStatus(env: Env, mock?: string | null, opts: { radio?: boolean } = {}): Promise<LiveStatus> {
  // a dev mock (?live=1 / ?live=0) decides on its own
  const mocked = !!mock && env.ALLOW_MOCK === '1';
  const [src, radio] = await Promise.all([readSource(env, mock), opts.radio === false || mocked ? null : radioStatus(env)]);
  const onAir = !!radio?.live;
  const isLive = onAir || Boolean(src.isLive);
  return {
    isLive,
    label: isLive ? 'LIVE' : '', // never "off air" anywhere public, data included
    streamUrl: onAir ? radioStreamUrl(env) : src.streamUrl || null,
    sessionTitle: src.sessionTitle || null,
    startedAt: isLive ? (onAir ? radio!.startedAt : src.startedAt) || null : null,
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
  const defined = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
  const merged: LiveOverride = { ...prev, ...defined, updatedAt: new Date().toISOString() };
  if (next.isLive && !prev.isLive) merged.startedAt = next.startedAt ?? new Date().toISOString();
  if (next.isLive === false) merged.startedAt = undefined;
  await env.STATE.put(KV_KEY, JSON.stringify(merged));
  // what was set by hand, so the /admin switch shows its own state even while the radio is on air
  return getLiveStatus(env, null, { radio: false });
}
