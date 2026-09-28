import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from './env';

export const COOKIE = 'hm_admin';

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Session cookie value: derived from ADMIN_TOKEN, so rotating the secret signs everyone out. */
export const sessionValue = (env: Env) => hmac(env.ADMIN_TOKEN!, 'huismax-admin-v1');

export const checkPassword = (env: Env, pw: string) => !!env.ADMIN_TOKEN && safeEqual(pw, env.ADMIN_TOKEN);

/** Accepts the admin cookie (browser) or `Authorization: Bearer <ADMIN_TOKEN>` (scripts). */
export async function isAdmin(c: Context<{ Bindings: Env }>) {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return false;
  const bearer = c.req.header('Authorization');
  if (bearer && safeEqual(bearer, `Bearer ${token}`)) return true;
  const cookie = getCookie(c, COOKIE);
  return !!cookie && safeEqual(cookie, await sessionValue(c.env));
}

/** Cookie-authenticated writes must come from our own origin. */
export function sameOrigin(c: Context) {
  const origin = c.req.header('Origin');
  return !origin || origin === new URL(c.req.url).origin;
}
