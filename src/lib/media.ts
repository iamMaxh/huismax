import type { Env } from './env';

/**
 * Uploaded images in R2. Keys are generated here (never from the uploaded file name); the type is sniffed from
 * the file's first bytes, not trusted from the browser. The admin resizes in the browser before upload, so
 * files are already web-sized; these limits only stop mistakes and abuse.
 */

export const LIMITS = { image: 15 * 1024 * 1024, thumb: 3 * 1024 * 1024 };

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
} as const;
type Ext = keyof typeof TYPES;

export class UploadError extends Error {}

/** Detects the image type from magic bytes. Anything else (svg, html, heic, pdf…) is rejected. */
export function sniff(b: Uint8Array): Ext | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12))) return 'avif';
  return null;
}

const rand = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

/** Reads and checks one uploaded file. */
export async function readImage(file: unknown, max: number, label: string) {
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') throw new UploadError(`${label}: no file`);
  const blob = file as Blob;
  if (blob.size === 0) throw new UploadError(`${label}: empty file`);
  if (blob.size > max) throw new UploadError(`${label}: ${Math.round(max / 1024 / 1024)} MB max`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ext = sniff(bytes);
  if (!ext) throw new UploadError(`${label}: only JPEG, PNG, WebP or AVIF images`);
  return { bytes, ext, type: TYPES[ext] };
}

/** Stores an image under `<prefix>/<id>-<random>[-t].<ext>` and returns the key. */
export async function putImage(env: Env, prefix: 'photos/photography' | 'photos/hiking' | 'covers', id: string, img: { bytes: Uint8Array; ext: Ext; type: string }, suffix = '') {
  const key = `${prefix}/${id.toLowerCase().replace(/[^a-z0-9]/g, '') || 'x'}-${rand()}${suffix}.${img.ext}`;
  await env.MEDIA!.put(key, img.bytes, { httpMetadata: { contentType: img.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return key;
}

export async function deleteKeys(env: Env, keys: (string | number | undefined)[]) {
  const list = keys.filter((k): k is string => typeof k === 'string' && k.length > 0);
  if (env.MEDIA && list.length) await env.MEDIA.delete(list);
}

/** Only keys this module could have written. */
export const validKey = (key: string) => /^(photos\/(photography|hiking)|covers)\/[a-z0-9]+-[a-z0-9]+(-t)?\.(jpg|png|webp|avif)$/.test(key);

/** Width/height as reported by the admin (after its resize); only used for layout. */
export const dim = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : 0;
};

/**
 * Serves an image. Published media is public and cached forever (keys never change: replacing an image
 * writes a new key). Unpublished media is only served to the admin, uncached.
 */
export async function serve(env: Env, req: Request, key: string, isPublic: boolean) {
  const obj = await env.MEDIA!.get(key, { onlyIf: req.headers, range: req.headers });
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  headers.set('Accept-Ranges', 'bytes');
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  const range = obj.range as { offset?: number; length?: number } | undefined;
  if (req.headers.has('Range') && range && range.length !== undefined) {
    const start = range.offset ?? 0;
    headers.set('Content-Range', `bytes ${start}-${start + range.length - 1}/${obj.size}`);
    headers.set('Content-Length', String(range.length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
}
