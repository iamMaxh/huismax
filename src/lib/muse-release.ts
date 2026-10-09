/**
 * Which Muse Companion installer /muse links to. Muse Companion's own updater reads
 * download.huismax.com/latest.json; the page follows the same file, so publishing a release there updates the page.
 *
 * The page only moves to a version whose installer is really there: latest.json can be uploaded before the .exe
 * (or the upload can fail). Until then it keeps the last version known to be published.
 */

const LATEST = 'https://download.huismax.com/latest.json';
/** Last release known to be published, for when latest.json is missing, unreadable or ahead of its files. */
export const FALLBACK: MuseRelease = { version: '0.4.6', url: 'https://download.huismax.com/MuseCompanion-Setup-0.4.6.exe' };
const TIMEOUT = 3000;
const TTL = 300;

export type MuseRelease = { version: string; url: string };

/** Installers only from our download server or the project's GitHub releases. */
const ALLOWED = [/^https:\/\/download\.huismax\.com\/MuseCompanion-Setup-[\w.-]+\.exe$/, /^https:\/\/github\.com\/huismaxx\/companion\/releases\/download\/[\w.-]+\/MuseCompanion-Setup-[\w.-]+\.exe$/];

/** latest.json → its version and installer addresses, in order; null when it isn't what Muse Companion writes. */
export function parseLatest(v: unknown): { version: string; urls: string[] } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const version = typeof o.version === 'string' ? o.version.trim() : '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  const urls = (Array.isArray(o.installer_urls) ? o.installer_urls : []).filter((u): u is string => typeof u === 'string' && ALLOWED.some((r) => r.test(u)));
  return urls.length ? { version, urls } : null;
}

/** 0.4.10 > 0.4.9, as Muse Companion compares them. */
export function newer(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

async function load(): Promise<MuseRelease> {
  try {
    const res = await fetch(LATEST, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const latest = parseLatest(await res.json());
    if (!latest) throw new Error('not a Muse Companion latest.json');
    if (!newer(latest.version, FALLBACK.version) && latest.version !== FALLBACK.version) return FALLBACK;
    for (const url of latest.urls) if (await exists(url)) return { version: latest.version, url };
    console.error(`muse: latest.json says ${latest.version}, but its installer isn't there yet`);
  } catch (e) {
    console.error('muse: latest.json', (e as Error).message);
  }
  return FALLBACK;
}

/** The installer to offer. Never throws; checked at most every five minutes. */
export async function museRelease(): Promise<MuseRelease> {
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
  const key = new Request('https://huismax.com/__cache/muse-release');
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return (await hit.json()) as MuseRelease;
  const release = await load();
  await cache
    ?.put(key, new Response(JSON.stringify(release), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL}` } }))
    .catch(() => undefined);
  return release;
}
