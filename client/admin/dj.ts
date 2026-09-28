import { h, pad3 } from './h';
import { api, upload, type Item } from './api';
import { label, paint, track, watch } from './state';
import { prepareCover } from './image';
import type { Collection, Extra } from './collection';

/** The cover block inside a DJ session's form: upload (resized to 1200px) or remove. */
export function coverEditor(media: boolean) {
  let busy = 0;
  watch(coverEditor, () => busy > 0);

  return (it: Item, coll: Collection): Extra => {
    const id = it.id;
    const img = h('img', { class: 'cover-img', alt: '' });
    const none = h('span', { class: 'cover-none mono dim' }, 'no cover');
    const input = h('input', { type: 'file', id: `cover-${id}`, class: 'vh', accept: 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif', disabled: !media });
    const pick = h('label', { class: `a-btn${media ? '' : ' is-disabled'}`, for: input.id });
    const del = h('button', { type: 'button', class: 'a-btn' }, 'remove cover');
    const fill = h('span', { class: 'a-bar-fill' });
    const bar = h('span', { class: 'a-bar', hidden: true }, fill);
    const stEl = h('span', { class: 'f-state mono', 'aria-live': 'polite' });
    const st = label(stEl);
    const el = h(
      'div',
      { class: 'cover f-wide' },
      h('span', { class: 'f-label mono' }, 'cover'),
      h('div', { class: 'cover-row' }, h('div', { class: 'cover-box' }, img, none), h('div', { class: 'cover-ctl' }, input, pick, del, bar, stEl)),
      media ? null : h('span', { class: 'f-hint mono dim' }, 'image storage (R2) is not connected yet.'),
    );

    const update = (x: Item) => {
      const has = !!x.cover_key;
      img.hidden = !has;
      none.hidden = has;
      if (has && img.getAttribute('src') !== `/media/${x.cover_key}`) img.src = `/media/${x.cover_key}`;
      pick.textContent = has ? 'replace cover' : 'upload cover';
      del.hidden = !has;
    };
    update(it);

    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      busy++;
      paint();
      bar.hidden = false;
      bar.classList.add('is-busy');
      st.busy('resizing…');
      try {
        const form = await prepareCover(f);
        bar.classList.remove('is-busy');
        const x = await track(
          upload<Item>('PUT', `/api/admin/dj/${id}/cover`, form, (p) => {
            fill.style.width = `${Math.round(p * 100)}%`;
            st.busy(`uploading ${Math.round(p * 100)}%`);
          }),
        );
        coll.replace(x);
        st.ok('cover saved');
      } catch (e) {
        st.err((e as Error).message);
      } finally {
        busy--;
        bar.hidden = true;
        fill.style.width = '';
        paint();
      }
    });

    del.addEventListener('click', async () => {
      const now = coll.items.find((x) => x.id === id) ?? it;
      if (!confirm(`remove the cover from session ${pad3(now.number)}?`)) return;
      st.busy('removing…');
      try {
        coll.replace(await track(api<Item>('DELETE', `/api/admin/dj/${id}/cover`)));
        st.ok('cover removed');
      } catch (e) {
        st.err((e as Error).message);
      }
    });

    return { el, update };
  };
}
