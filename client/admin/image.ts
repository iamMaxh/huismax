/**
 * Browser-side resize before upload: phone photos arrive web-sized, and re-encoding through a canvas drops
 * EXIF (GPS included) on purpose. WebP where the browser can encode it, JPEG otherwise (Safari).
 */

type Decoded = { src: CanvasImageSource; w: number; h: number; done(): void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: b, w: b.width, h: b.height, done: () => b.close() };
    } catch {
      /* e.g. HEIC outside Safari; try an <img>, which also applies EXIF orientation */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('this browser can’t read that file. try a JPEG or PNG');
  }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

function draw(src: CanvasImageSource, w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

async function encode(c: HTMLCanvasElement, q: number) {
  let b = await toBlob(c, 'image/webp', q);
  // browsers that can't encode WebP silently hand back a PNG
  if (!b || b.type !== 'image/webp') b = await toBlob(c, 'image/jpeg', q);
  if (!b) throw new Error('could not encode the image');
  return b;
}

const ext = (b: Blob) => (b.type === 'image/webp' ? 'webp' : 'jpg');

/** Photo: full image (2400px long edge) + thumbnail (800px) + the full image's size. */
export async function preparePhoto(file: Blob) {
  const d = await decode(file);
  try {
    if (!d.w || !d.h) throw new Error('that image is empty');
    const full = draw(d.src, d.w, d.h, 2400);
    const image = await encode(full, 0.86);
    // the thumbnail comes from the already-resized canvas: cheaper, same result
    const thumb = await encode(draw(full, full.width, full.height, 800), 0.8);
    return { image, thumb, width: full.width, height: full.height };
  } finally {
    d.done();
  }
}

/** Photo fields for the upload APIs. */
export function photoForm(p: Awaited<ReturnType<typeof preparePhoto>>, extra: Record<string, string> = {}) {
  const f = new FormData();
  f.append('image', p.image, `image.${ext(p.image)}`);
  f.append('thumb', p.thumb, `thumb.${ext(p.thumb)}`);
  f.append('width', String(p.width));
  f.append('height', String(p.height));
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
}

/** DJ cover: 1200px long edge, quality stepped down until it fits the server's 3 MB limit. */
export async function prepareCover(file: Blob, maxBytes = 3 * 1024 * 1024 - 4096) {
  const d = await decode(file);
  try {
    const c = draw(d.src, d.w, d.h, 1200);
    for (const q of [0.86, 0.76, 0.64, 0.5]) {
      const b = await encode(c, q);
      if (b.size <= maxBytes) {
        const f = new FormData();
        f.append('image', b, `cover.${ext(b)}`);
        return f;
      }
    }
    throw new Error('cover is still over 3 MB after resizing');
  } finally {
    d.done();
  }
}

/** Files a picker or a drop may hand over; HEIC often arrives without a type. */
export const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(f.name);
