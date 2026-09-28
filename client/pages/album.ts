import { $, $$, readJSON } from '../lib/dom';
import type { PageInit } from '../main';

type Photo = {
  id: string; no: string; src: string; thumb: string; width: number; height: number; ratio: number;
  title: string; alt: string; caption: string; location: string; date: string;
};

/** /photographer and /hiking: grid ↔ index view and the full-screen viewer. Empty NOT frames are plain markup. */
export const initAlbum: PageInit = (main, scope) => {
  const photos = readJSON<Photo[]>('photo-data', main) ?? [];
  const dialog = $<HTMLDialogElement>('[data-lightbox]', main);
  if (!photos.length || !dialog) return;
  const grid = $('[data-photo-grid]', main)!;
  const index = $('[data-photo-index]', main)!;
  const peek = $('[data-index-peek]', main)!;
  let current = 0;

  /* ——— view ——— */
  const viewGroup = $('[data-photo-view]', main)!;
  scope.on(viewGroup, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-view]');
    if (!b) return;
    $$('button', viewGroup).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const isIndex = b.dataset.view === 'index';
    grid.hidden = isIndex;
    index.hidden = !isIndex;
  });

  const img = (p: Photo, src: string) => {
    const el = new Image();
    el.src = src;
    el.alt = p.alt;
    if (p.width && p.height) Object.assign(el, { width: p.width, height: p.height });
    el.decoding = 'async';
    return el;
  };

  /* ——— index view: thumbnail follows the cursor ——— */
  scope.on(index, 'pointerover', (e: PointerEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-preview]');
    if (!row) return;
    const p = photos[Number(row.dataset.preview)];
    peek.style.aspectRatio = String(p.ratio);
    peek.replaceChildren(img(p, p.thumb));
    peek.classList.add('on');
  });
  scope.on(index, 'pointerleave', () => peek.classList.remove('on'));
  scope.on(index, 'pointermove', (e: PointerEvent) => {
    const r = index.getBoundingClientRect();
    peek.style.translate = `${e.clientX - r.left + 24}px ${e.clientY - r.top - 60}px`;
  });

  /* ——— viewer: thumb first (already cached), the full image replaces it once loaded ——— */
  const stage = $('[data-lb-stage]', dialog)!;
  const show = (i: number) => {
    current = i;
    const p = photos[i];
    const frame = document.createElement('div');
    frame.className = 'lb-frame';
    frame.style.setProperty('--ar', String(p.ratio));
    const full = img(p, p.src);
    if (!full.complete && p.thumb !== p.src) {
      const low = img(p, p.thumb);
      low.className = 'lb-low';
      low.alt = '';
      frame.append(low);
      full.classList.add('lb-loading');
      full.addEventListener('load', () => (full.classList.remove('lb-loading'), low.remove()), { once: true });
    }
    frame.append(full);
    stage.replaceChildren(frame);
    $('[data-lb-count]', dialog)!.textContent = `${p.no} / ${String(photos.length).padStart(2, '0')}`;
    $('[data-lb-title]', dialog)!.textContent = p.title;
    const caption = $('[data-lb-caption]', dialog)!;
    caption.textContent = p.caption;
    caption.hidden = !p.caption;
    const dl = $('[data-lb-dl]', dialog)!;
    dl.replaceChildren(
      ...[['place', p.location], ['date', p.date]]
        .filter(([, v]) => v)
        .map(([k, v]) => {
          const row = document.createElement('div');
          row.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
          return row;
        }),
    );
    // preload the neighbours so arrowing through is instant
    for (const d of [1, -1]) if (photos.length > 1) new Image().src = photos[(i + d + photos.length) % photos.length].src;
    history.replaceState(history.state, '', `#${p.id}`);
  };
  const step = (d: number) => show((current + d + photos.length) % photos.length);
  const open = (i: number) => {
    show(i);
    if (!dialog.open) dialog.showModal();
  };
  const close = () => dialog.open && dialog.close();

  const single = photos.length < 2;
  $<HTMLButtonElement>('[data-lb-prev]', dialog)!.hidden = single;
  $<HTMLButtonElement>('[data-lb-next]', dialog)!.hidden = single;

  scope.on(main, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-open]');
    if (b) open(Number(b.dataset.open));
  });
  scope.on($('[data-lb-prev]', dialog)!, 'click', () => step(-1));
  scope.on($('[data-lb-next]', dialog)!, 'click', () => step(1));
  scope.on($('[data-lb-close]', dialog)!, 'click', close);
  scope.on(dialog, 'click', (e: MouseEvent) => e.target === dialog && close());
  scope.on(dialog, 'close', () => {
    history.replaceState(history.state, '', location.pathname);
    $$<HTMLElement>(`[data-open="${current}"]`, main).find((el) => el.offsetParent)?.focus();
  });
  // Escape closes the <dialog> natively; arrows step
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    if (!dialog.open) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // swipe on touch
  let x0: number | null = null;
  scope.on(stage, 'pointerdown', (e: PointerEvent) => (x0 = e.clientX));
  scope.on(stage, 'pointerup', (e: PointerEvent) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50 && !single) step(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });

  // deep link: /photographer#<id> opens that frame
  const fromHash = photos.findIndex((p) => `#${p.id}` === location.hash);
  if (fromHash >= 0) open(fromHash);
  scope.add(close);
};
