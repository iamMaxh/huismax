/** Numbers as /homelab says them: binary units (as the servers count), short uptimes, "8 s ago". */

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
const scale = (n: number) => Math.min(UNITS.length - 1, n > 0 ? Math.floor(Math.log(n) / Math.log(1024)) : 0);
const fixed = (v: number, i: number) => (i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ''));

export const bytes = (n: number) => {
  const i = scale(n);
  return `${fixed(n / 1024 ** i, i)} ${UNITS[i]}`;
};
export const rate = (n: number) => `${bytes(n)}/s`;
/** "37.1 / 64 GiB": both in the total's unit */
export const ofTotal = (used: number, total: number) => {
  const i = scale(total);
  return `${fixed(used / 1024 ** i, i)} / ${fixed(total / 1024 ** i, i)} ${UNITS[i]}`;
};
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);
export const share = (u: { used: number; total: number } | null) => (u && u.total ? (u.used / u.total) * 100 : null);

export function uptime(sec: number | null) {
  if (sec === null) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
}

export function date(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase()}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
