import { $, $$, readJSON, withTransition } from '../lib/dom';
import type { PageInit } from '../main';

type Photo = {
  id: string; title: string; series: string; location: string; date: string;
  camera: string; lens: string; exposure: string; ratio: number; src?: string; tone: string | null;
};

export const initPhotographer: PageInit = (main, scope) => {
  const photos = readJSON<Photo[]>('photo-data', main) ?? [];
  const grid = $('[data-photo-grid]', main)!;
  const index = $('[data-photo-index]', main)!;
  const peek = $('[data-index-peek]', main)!;
  const dialog = $<HTMLDialogElement>('[data-lightbox]', main)!;
  let series = 'all';
  let visible = photos.map((_, i) => i);
  let current = 0;

  /* ——— filter + view ——— */
  const applyFilter = () => {
    visible = photos.map((p, i) => (series === 'all' || p.series === series ? i : -1)).filter((i) => i >= 0);
    let slot = 0;
    for (const fig of $$('.frame', grid)) {
      const show = series === 'all' || fig.dataset.series === series;
      fig.hidden = !show;
      if (show) fig.dataset.slot = String(slot++ % 6);
    }
    for (const li of $$('li[data-series]', index)) li.hidden = !(series === 'all' || li.dataset.series === series);
  };

  const pressed = (group: HTMLElement, btn: HTMLElement) =>
    $$('button', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

  const filterGroup = $('[data-photo-filter]', main)!;
  scope.on(filterGroup, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-series]');
    if (!b) return;
    pressed(filterGroup, b);
    series = b.dataset.series!;
    withTransition(applyFilter);
  });

  const viewGroup = $('[data-photo-view]', main)!;
  scope.on(viewGroup, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-view]');
    if (!b) return;
    pressed(viewGroup, b);
    const isIndex = b.dataset.view === 'index';
    grid.hidden = isIndex;
    index.hidden = !isIndex;
  });

  /* ——— index view: thumbnail follows the cursor ——— */
  const paintInto = (el: HTMLElement, p: Photo) => {
    el.style.aspectRatio = String(p.ratio);
    el.innerHTML = '';
    if (p.src) {
      const img = new Image();
      img.src = p.src;
      img.alt = p.title;
      el.append(img);
    } else {
      el.style.background = p.tone ?? '';
    }
  };
  scope.on(index, 'pointerover', (e: PointerEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-preview]');
    if (!row) return;
    paintInto(peek, photos[Number(row.dataset.preview)]);
    peek.classList.add('on');
  });
  scope.on(index, 'pointerleave', () => peek.classList.remove('on'));
  scope.on(index, 'pointermove', (e: PointerEvent) => {
    const r = index.getBoundingClientRect();
    peek.style.translate = `${e.clientX - r.left + 24}px ${e.clientY - r.top - 60}px`;
  });

  /* ——— lightbox ——— */
  const stage = $('[data-lb-stage]', dialog)!;
  const show = (i: number) => {
    current = i;
    const p = photos[i];
    const pos = visible.indexOf(i);
    const frame = document.createElement('div');
    frame.className = 'lb-frame ph';
    paintInto(frame, p);
    stage.replaceChildren(frame);
    $('[data-lb-count]', dialog)!.textContent = `${String(pos + 1).padStart(2, '0')} / ${String(visible.length).padStart(2, '0')}`;
    $('[data-lb-title]', dialog)!.textContent = p.title;
    const dl = $('[data-lb-dl]', dialog)!;
    dl.innerHTML = '';
    for (const [k, v] of [['no.', p.id], ['series', p.series], ['place', p.location], ['date', p.date], ['camera', p.camera], ['lens', p.lens], ['exposure', p.exposure]]) {
      const row = document.createElement('div');
      row.innerHTML = '<dt></dt><dd></dd>';
      row.children[0].textContent = k;
      row.children[1].textContent = v;
      dl.append(row);
    }
    history.replaceState(history.state, '', `#${p.id}`);
  };
  const step = (d: number) => {
    const pos = visible.indexOf(current);
    show(visible[(pos + d + visible.length) % visible.length]);
  };
  const open = (i: number) => {
    show(i);
    dialog.showModal();
  };
  const close = () => dialog.open && dialog.close();

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
  scope.on(dialog, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  // swipe on touch
  let x0: number | null = null;
  scope.on(stage, 'pointerdown', (e: PointerEvent) => (x0 = e.clientX));
  scope.on(stage, 'pointerup', (e: PointerEvent) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50) step(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });

  // deep link: /photographer#0412 opens that frame
  const fromHash = photos.findIndex((p) => `#${p.id}` === location.hash);
  if (fromHash >= 0) open(fromHash);
  scope.add(close);
};
