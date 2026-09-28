import { h } from './h';
import { api, upload, type Def, type Item } from './api';
import { controls } from './form';
import { label, paint, track, unwatch, watch, type Label } from './state';
import { reorderWithin, sortable } from './sortable';
import { orderSaver } from './order';
import { isImageFile, photoForm, preparePhoto } from './image';

/**
 * Photo manager for one album (/photographer or /hiking). The public page shows seven frames, NOT 1 … NOT 7;
 * published photos take them over in order. Uploads are resized here first, then sent one at a time.
 */

type Album = 'photography' | 'hiking';
const FRAMES = 7;
const PAGE: Record<Album, string> = { photography: '/photographer', hiking: '/hiking' };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif';

type Tile = { li: HTMLLIElement; img: HTMLImageElement; no: HTMLElement; title: HTMLElement; flag: HTMLInputElement; state: Label; prev: HTMLButtonElement; next: HTMLButtonElement; open: HTMLButtonElement };

const src = (key: unknown) => (key ? `/media/${String(key)}` : '');
const two = (n: number) => String(n).padStart(2, '0');
const isOn = (p: Item) => Number(p.published) === 1;

export function photoManager(root: HTMLElement, album: Album, all: Item[], def: Def, media: boolean) {
  let photos = all.filter((p) => p.album === album);
  const tiles = new Map<string, Tile>();
  const fields = def.fields.filter((f) => f.name !== 'album');
  const url = '/api/admin/c/photos';

  /* ——— preview of the public page ——— */
  const frames = h('ol', { class: 'pv-frames', 'aria-label': `${PAGE[album]} as visitors see it` });
  const framesNote = h('p', { class: 'mono dim' });
  const countEl = h('span', { class: 'coll-count mono dim' });
  const preview = h(
    'section',
    { class: 'panel', 'aria-label': 'page preview' },
    h('div', { class: 'coll-head' }, h('span', { class: 'panel-label mono' }, 'on the page'), countEl),
    frames,
    framesNote,
  );

  /* ——— upload ——— */
  const inputId = `ph-file-${album}`;
  const file = h('input', { type: 'file', id: inputId, class: 'vh', multiple: true, accept: ACCEPT, disabled: !media });
  const publish = h('input', { type: 'checkbox', checked: true });
  const queue = h('ul', { class: 'queue', 'aria-label': 'uploads' });
  const drop = h(
    'div',
    { class: `drop${media ? '' : ' is-off'}` },
    file,
    h('label', { class: 'drop-label', for: inputId }, h('span', { class: 'drop-title' }, 'drop images here'), h('span', { class: 'mono dim' }, 'or click to choose · jpeg, png, webp, heic')),
  );
  const uploader = h(
    'section',
    { class: 'panel', 'aria-label': 'upload photos' },
    h('span', { class: 'panel-label mono' }, 'upload'),
    media ? null : h('p', { class: 'admin-warn mono' }, 'photo storage (R2, binding MEDIA) is not connected, so uploads are off. existing photos still show here.'),
    drop,
    h('div', { class: 'drop-opts' }, h('label', { class: 'tog' }, publish, h('span', { class: 'tog-track', 'aria-hidden': 'true' }), h('span', { class: 'tog-text' }, 'publish on upload'))),
    h('p', { class: 'mono dim' }, 'resized in your browser first (2400px, webp). camera and location data are removed.'),
    queue,
  );
  publish.disabled = !media;

  /* ——— grid ——— */
  const grid = h('ol', { class: 'ph-grid' });
  const empty = h('p', { class: 'coll-empty mono dim' }, 'no photos yet. the page shows its empty frames.');
  const stateEl = h('span', { class: 'coll-state mono', 'aria-live': 'polite' });
  const headState = label(stateEl);
  const gridPanel = h(
    'section',
    { class: 'panel', 'aria-label': 'photos' },
    h('div', { class: 'coll-head' }, h('span', { class: 'panel-label mono' }, 'photos'), h('span', { class: 'coll-count mono dim' }, 'drag or ← → to order · click a photo to edit'), stateEl),
    grid,
    empty,
  );
  root.append(preview, uploader, gridPanel);

  const order = orderSaver(`${url}/order`, headState, async () => {
    photos = (await api<Item[]>('GET', `${url}?album=${album}`)).filter((p) => p.album === album);
    sync();
  });

  /* ——— rendering ——— */

  function makeTile(p: Item): Tile {
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    const no = h('span', { class: 'ph-no mono' });
    const title = h('span', { class: 'ph-title' });
    const flag = h('input', { type: 'checkbox' });
    const st = h('span', { class: 'row-state mono', 'aria-live': 'polite' });
    const open = h('button', { type: 'button', class: 'ph-open' }, img, h('span', { class: 'ph-edit mono', 'aria-hidden': 'true' }, 'edit'));
    const prev = h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'move earlier', title: 'move earlier' }, '←');
    const next = h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'move later', title: 'move later' }, '→');
    const li = h(
      'li',
      { class: 'ph-tile', 'data-id': p.id },
      h('div', { class: 'ph-img' }, open, no, h('span', { class: 'ph-handle row-handle', 'aria-hidden': 'true', title: 'drag to reorder' }, h('i'), h('i'), h('i'))),
      h('div', { class: 'ph-meta' }, title, st),
      h('div', { class: 'ph-ctl' }, h('label', { class: 'tog tog-sm' }, flag, h('span', { class: 'tog-track', 'aria-hidden': 'true' })), h('span', { class: 'f-end' }), prev, next),
    );
    const t: Tile = { li, img, no, title, flag, state: label(st), prev, next, open };
    open.addEventListener('click', () => edit(t.li.dataset.id!));
    flag.addEventListener('change', () => saveFlag(t));
    prev.addEventListener('click', () => move(t, -1, prev));
    next.addEventListener('click', () => move(t, 1, next));
    return t;
  }

  function paintTile(t: Tile, p: Item) {
    const s = src(p.thumb_key || p.image_key);
    if (t.img.getAttribute('src') !== s) t.img.src = s;
    const name = String(p.title || '') || 'untitled';
    t.title.textContent = name;
    t.title.classList.toggle('dim', !p.title);
    t.open.setAttribute('aria-label', `edit ${name}`);
    t.flag.checked = isOn(p);
    t.flag.setAttribute('aria-label', `published: ${name}`);
    t.li.classList.toggle('is-off', !isOn(p));
  }

  function sync() {
    const keep = new Set(photos.map((p) => p.id));
    for (const [id, t] of tiles) if (!keep.has(id)) (t.li.remove(), tiles.delete(id));
    let prev: HTMLElement | null = null;
    let frame = 0;
    photos.forEach((p, i) => {
      let t = tiles.get(p.id);
      if (!t) tiles.set(p.id, (t = makeTile(p)));
      paintTile(t, p);
      t.no.textContent = isOn(p) ? two(++frame) : 'draft';
      t.prev.disabled = i === 0;
      t.next.disabled = i === photos.length - 1;
      const expected: Element | null = prev ? prev.nextElementSibling : grid.firstElementChild;
      if (expected !== t.li) (prev ? prev.after(t.li) : grid.prepend(t.li));
      prev = t.li;
    });
    empty.hidden = photos.length > 0;

    // the public page: published photos fill NOT 1 … NOT 7 in order
    const live = photos.filter(isOn);
    frames.replaceChildren(
      ...Array.from({ length: FRAMES }, (_, i) => {
        const p = live[i];
        return h(
          'li',
          { class: `pv-slot${p ? ' is-filled' : ''}` },
          p ? h('img', { src: src(p.thumb_key || p.image_key), alt: '' }) : null,
          h('span', { class: 'mono' }, p ? two(i + 1) : `NOT ${i + 1}`),
        );
      }),
    );
    const drafts = photos.length - live.length;
    countEl.textContent = `${Math.min(live.length, FRAMES)} of ${FRAMES} frames filled${live.length > FRAMES ? ` · +${live.length - FRAMES} more` : ''}${drafts ? ` · ${drafts} draft${drafts > 1 ? 's' : ''}` : ''}`;
    framesNote.textContent = `the page shows ${FRAMES} frames, NOT 1 to NOT ${FRAMES}. published photos replace them in order; drafts stay here.`;
  }

  function replaceItem(p: Item) {
    photos = photos.map((x) => (x.id === p.id ? p : x));
    sync();
  }

  /* ——— actions ——— */

  async function saveFlag(t: Tile) {
    const id = t.li.dataset.id!;
    const want = t.flag.checked;
    t.state.busy();
    try {
      replaceItem(await track(api<Item>('PATCH', `${url}/${id}`, { published: want })));
      t.state.ok();
    } catch (e) {
      t.flag.checked = !want;
      t.state.err((e as Error).message);
    }
  }

  function move(t: Tile, dir: -1 | 1, btn: HTMLButtonElement) {
    const ids = photos.map((p) => p.id);
    const i = ids.indexOf(t.li.dataset.id!);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
    (btn.disabled ? (dir < 0 ? t.next : t.prev) : btn).focus();
  }

  function applyOrder(ids: string[]) {
    photos = reorderWithin(photos, ids);
    sync();
    order.schedule(ids);
  }
  sortable(grid, { item: '.ph-tile', handle: '.ph-handle', grid: true, onDrop: applyOrder });

  /* ——— uploads: one at a time, each with its own progress ——— */

  let active = 0;
  let chain = Promise.resolve();
  watch(queue, () => active > 0);

  function enqueue(list: FileList | File[]) {
    if (!media) return;
    const files = [...list];
    for (const f of files) {
      const fill = h('span', { class: 'a-bar-fill' });
      const bar = h('span', { class: 'a-bar is-busy', role: 'progressbar', 'aria-label': `upload ${f.name}`, 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
      const st = h('span', { class: 'q-state mono dim' }, 'waiting');
      const dismiss = h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'dismiss', hidden: true }, '×');
      const li = h('li', { class: 'q' }, h('span', { class: 'q-name' }, f.name || 'image'), st, bar, dismiss);
      dismiss.addEventListener('click', () => li.remove());
      queue.append(li);
      const set = (text: string, frac: number | null) => {
        st.textContent = text;
        bar.classList.toggle('is-busy', frac === null);
        fill.style.width = frac === null ? '' : `${Math.round(frac * 100)}%`;
        if (frac !== null) bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      };
      const fail = (msg: string) => {
        set(msg, 0);
        li.classList.add('is-err');
        dismiss.hidden = false;
      };
      if (!isImageFile(f)) {
        fail('not an image');
        continue;
      }
      active++;
      paint();
      chain = chain.then(async () => {
        try {
          set('resizing…', null);
          const prepared = await preparePhoto(f);
          set('uploading 0%', 0);
          const fields: Record<string, string> = { album };
          if (publish.checked) fields.published = '1';
          const it = await track(upload<Item>('POST', '/api/admin/photos', photoForm(prepared, fields), (x) => set(`uploading ${Math.round(x * 100)}%`, x)));
          set('done', 1);
          li.classList.add('is-done');
          setTimeout(() => li.remove(), 1600);
          photos.push(it);
          sync();
        } catch (e) {
          fail((e as Error).message);
        } finally {
          active--;
          paint();
        }
      });
    }
  }

  file.addEventListener('change', () => {
    if (file.files?.length) enqueue(file.files);
    file.value = '';
  });
  drop.addEventListener('dragover', (e) => {
    if (!media || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', (e) => {
    if (!drop.contains(e.relatedTarget as Node)) drop.classList.remove('is-over');
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (media && e.dataTransfer?.files.length) enqueue(e.dataTransfer.files);
  });

  /* ——— edit one photo ——— */

  function edit(id: string) {
    const p = photos.find((x) => x.id === id);
    if (!p) return;
    const ctl = controls(fields, p);
    const stEl = h('span', { class: 'f-state mono', 'aria-live': 'polite' });
    const st = label(stEl);
    const big = h('img', { class: 'dlg-img', src: src(p.image_key), alt: '' });
    const dims = h('p', { class: 'mono dim' });
    const paintDims = (x: Item) => (dims.textContent = `${x.width || '?'} × ${x.height || '?'} · ${isOn(x) ? 'published' : 'draft'}`);
    paintDims(p);
    const fill = h('span', { class: 'a-bar-fill' });
    const bar = h('span', { class: 'a-bar', hidden: true }, fill);
    const replaceInput = h('input', { type: 'file', id: `ph-replace-${id}`, class: 'vh', accept: ACCEPT, disabled: !media });
    const form = h(
      'form',
      { class: 'dlg-form' },
      h('div', { class: 'dlg-head' }, h('span', { class: 'panel-label mono' }, 'edit photo'), h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'close', onclick: () => close() }, '×')),
      ctl.el,
      h(
        'div',
        { class: 'f-actions' },
        h('button', { type: 'submit', class: 'a-btn a-btn-solid' }, 'save'),
        h('button', { type: 'button', class: 'a-btn', onclick: () => close() }, 'cancel'),
        stEl,
      ),
      h(
        'div',
        { class: 'f-actions dlg-more' },
        replaceInput,
        h('label', { class: `a-btn${media ? '' : ' is-disabled'}`, for: replaceInput.id }, 'replace image'),
        bar,
        h('button', { type: 'button', class: 'a-btn a-btn-quiet f-end', onclick: () => remove() }, 'delete'),
      ),
    );
    const dlg = h('dialog', { class: 'dlg', 'aria-label': 'edit photo' }, h('div', { class: 'dlg-media' }, big, dims), form);
    document.body.append(dlg);
    watch(dlg, () => ctl.isDirty());
    form.addEventListener('input', paint);

    const close = (force = false) => {
      if (!force && ctl.isDirty() && !confirm('discard your changes to this photo?')) return;
      dlg.close();
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dlg.addEventListener('close', () => {
      unwatch(dlg);
      dlg.remove();
      tiles.get(id)?.open.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = ctl.changed();
      if (!Object.keys(changes).length) return close(true);
      st.busy();
      try {
        const it = await track(api<Item>('PATCH', `${url}/${id}`, changes));
        ctl.reset(it);
        replaceItem(it);
        close(true);
        tiles.get(id)?.state.ok();
      } catch (err) {
        st.err((err as Error).message);
      }
    });

    replaceInput.addEventListener('change', async () => {
      const f = replaceInput.files?.[0];
      replaceInput.value = '';
      if (!f) return;
      bar.hidden = false;
      bar.classList.add('is-busy');
      fill.style.width = '';
      st.busy('resizing…');
      active++;
      try {
        const prepared = await preparePhoto(f);
        bar.classList.remove('is-busy');
        const it = await track(
          upload<Item>('PUT', `/api/admin/photos/${id}/image`, photoForm(prepared), (x) => {
            fill.style.width = `${Math.round(x * 100)}%`;
            st.busy(`uploading ${Math.round(x * 100)}%`);
          }),
        );
        replaceItem(it);
        big.src = src(it.image_key);
        paintDims(it);
        st.ok('image replaced');
      } catch (err) {
        st.err((err as Error).message);
      } finally {
        active--;
        bar.hidden = true;
        paint();
      }
    });

    const remove = async () => {
      if (!confirm('delete this photo? the image files are removed too. this can’t be undone.')) return;
      st.busy('deleting…');
      try {
        await track(api('DELETE', `${url}/${id}`));
        photos = photos.filter((x) => x.id !== id);
        sync();
        headState.ok('deleted');
        close(true);
      } catch (err) {
        st.err((err as Error).message);
      }
    };

    dlg.showModal();
    ctl.focus();
  }

  sync();
}
