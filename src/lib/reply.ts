import type { Env } from './env';
import { EMAIL, InputError, newId, type Settings } from './cms';

/**
 * /reply: a message to Max. Always stored in D1 (read it in /admin); also emailed through Resend when
 * RESEND_API_KEY is set and a destination address is configured.
 */

export type Message = { id: string; name: string; email: string; body: string; emailed: number; read: number; created_at: string };

const one = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, n);

export function validateReply(input: Record<string, unknown>) {
  const body = (typeof input.message === 'string' ? input.message : '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) throw new InputError('write something first');
  if (body.length > 2000) throw new InputError('2000 characters max');
  const name = one(input.name, 60);
  const email = one(input.email, 200);
  if (email && !EMAIL.test(email)) throw new InputError("that email doesn't look right");
  return { name, email, body };
}

export const destination = (env: Env, s: Settings) => s.replyTo || env.REPLY_TO || '';
export const emailReady = (env: Env, s: Settings) => !!(env.RESEND_API_KEY && destination(env, s));

/** An IPv6 visitor controls a whole /64, so they are counted per /64, not per address. */
export function ipBucket(ip: string) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** Rate limit per visitor: one message a minute, 10 a day. Keyed by a hash of the IP, never the IP itself. */
export async function allowed(env: Env, ip: string) {
  if (!env.STATE) return true;
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`reply:${ipBucket(ip)}`)))]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const [recent, day] = await Promise.all([env.STATE.get(`reply:recent:${h}`), env.STATE.get(`reply:day:${h}`)]);
  if (recent || Number(day ?? 0) >= 10) return false;
  await Promise.all([
    env.STATE.put(`reply:recent:${h}`, '1', { expirationTtl: 60 }),
    env.STATE.put(`reply:day:${h}`, String(Number(day ?? 0) + 1), { expirationTtl: 86400 }),
  ]);
  return true;
}

// Site-wide caps, counted in D1 (consistent, unlike KV): the per-visitor limit can be dodged with many addresses.
const HOURLY_CAP = 20;
const DAILY_EMAILS = 50; // Resend's free tier sends 100 a day

const since = (ms: number) => new Date(Date.now() - ms).toISOString();

/** False once the site has taken HOURLY_CAP messages in the last hour, from anyone. */
export async function underCap(env: Env) {
  const row = await env.DB!.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?').bind(since(3600_000)).first<{ n: number }>();
  return (row?.n ?? 0) < HOURLY_CAP;
}

export async function saveMessage(env: Env, m: { name: string; email: string; body: string }): Promise<Message> {
  const row: Message = { id: newId(), ...m, emailed: 0, read: 0, created_at: new Date().toISOString() };
  await env.DB!.prepare('INSERT INTO messages (id, name, email, body, emailed, read, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)')
    .bind(row.id, row.name, row.email, row.body, row.created_at)
    .run();
  return row;
}

/** Sends the message through Resend. Returns whether it went out; never throws. */
export async function emailMessage(env: Env, s: Settings, m: Message): Promise<boolean> {
  if (!emailReady(env, s)) return false;
  try {
    // past the daily cap, messages are only kept in /admin
    const sent = await env.DB!.prepare('SELECT COUNT(*) AS n FROM messages WHERE emailed = 1 AND created_at > ?').bind(since(86400_000)).first<{ n: number }>();
    if ((sent?.n ?? 0) >= DAILY_EMAILS) return false;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: s.replyFrom,
        to: [destination(env, s)],
        subject: `huismax — reply${m.name ? ` from ${m.name}` : ''}`,
        text: `${m.body}\n\n— ${m.name || 'no name'}${m.email ? ` <${m.email}>` : ''}\n${m.created_at}`,
        ...(m.email ? { reply_to: m.email } : {}),
      }),
    });
    if (!res.ok) {
      console.error('resend', res.status, (await res.text()).slice(0, 300));
      return false;
    }
    await env.DB!.prepare('UPDATE messages SET emailed = 1 WHERE id = ?').bind(m.id).run();
    return true;
  } catch (e) {
    console.error('resend', (e as Error).message);
    return false;
  }
}

export async function listMessages(env: Env): Promise<Message[]> {
  const { results } = await env.DB!.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all<Message>();
  return results;
}
