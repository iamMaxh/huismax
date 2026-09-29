import type { Env } from './env';
import { create, InputError } from './cms';
import type { Limit } from './reply';

/**
 * Requests for the next live set: the form on /dj. Kept in D1 (`requests`, src/lib/cms.ts) as drafts; Max publishes
 * the ones he picks in /admin and those show on /dj. Same guards as /reply: same origin, a honeypot, one a minute and
 * a few a day per visitor (hashed IP), and a site-wide hourly cap.
 */

export const MAX_REQUEST = 200;
export const MAX_NAME = 40;
export const REQUEST_LIMIT: Limit = { key: 'request', perDay: 5, noun: 'request' };
/** Site-wide, counted in D1: many addresses can't flood the list. */
const HOURLY_CAP = 30;

const one = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function validateRequest(input: Record<string, unknown>) {
  const request = one(input.request);
  if (!request) throw new InputError('tell me what to play first');
  if (request.length > MAX_REQUEST) throw new InputError(`${MAX_REQUEST} characters max`);
  return { request, name: one(input.name).slice(0, MAX_NAME) };
}

/** False once the site has taken HOURLY_CAP requests in the last hour, from anyone. */
export async function underRequestCap(env: Env) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const row = await env.DB!.prepare('SELECT COUNT(*) AS n FROM dj_requests WHERE created_at > ?').bind(since).first<{ n: number }>();
  return (row?.n ?? 0) < HOURLY_CAP;
}

/** Stored as a draft through the CMS, so /admin lists, edits and publishes it like any other item. */
export const saveRequest = (env: Env, r: { request: string; name: string }) => create(env, 'requests', r, { published: 0 });
