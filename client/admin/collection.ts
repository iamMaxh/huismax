import { h } from './h';
import { api, type CollectionName, type Def, type Item } from './api';
import { controls, type Controls } from './form';
import { label, paint, track, unwatch, watch, type Label } from './state';
import { reorderWithin, sortable } from './sortable';
import { orderSaver } from './order';

/**
 * One editor for every list on the site, driven by the collection's field definitions.
 * Rows show the main text; a row opens into an inline form. The visible/published switch saves at once;
 * the form saves on submit. Order: drag (pointer) or ↑ ↓, saved as one PUT shortly after the last move.
 */

export type Extra = { el: Node; update(it: Item): void };

export type CollOpts = {
  name: CollectionName;
  def: Def;
  items: Item[];
  noun: string;
  title: (it: Item) => string;
  sub?: (it: Item) => string;
  /** fields left out of the form */
  omit?: string[];
  /** a narrowed view (music by kind): only matching rows show, new items get the value */
  view?: { field: string; value: string };
  /** small image in the row */
  thumb?: (it: Item) => string;
  /** more editing inside an existing item's form (the DJ cover) */
  extra?: (it: Item, coll: Collection) => Extra;
  onChange?: () => void;
  /** the view had to switch (a new item landed in another one) */
  onView?: (value: string) => void;
  empty?: string;
};

type Row = {
  li: HTMLLIElement;
  item: Item;
  titleEl: HTMLElement;
  subEl: HTMLElement;
  toggle: HTMLButtonElement;
  flag: HTMLInputElement;
  state: Label;
  thumb: HTMLImageElement | null;
  up: HTMLButtonElement | null;
  down: HTMLButtonElement | null;
  form: { el: HTMLFormElement; ctl: Controls; state: Label; extra: Extra | null } | null;
};

const byNumber = (a: Item, b: Item) => Number(b.number) - Number(a.number) || String(b.created_at).localeCompare(String(a.created_at));

export class Collection {
  items: Item[] = [];
  private rows = new Map<string, Row>();
  private list: HTMLOListElement;
  private emptyEl: HTMLElement;
  private headState: Label;
  private adder: { el: HTMLFormElement; ctl: Controls } | null = null;
  private order: ReturnType<typeof orderSaver>;
  private readonly url: string;
  private readonly sorted: boolean;

  constructor(
    private root: HTMLElement,
    private o: CollOpts,
  ) {
    this.url = `/api/admin/c/${o.name}`;
    this.sorted = o.def.order === 'sort';
    this.headState = label(root.querySelector<HTMLElement>('[data-coll-state]')!);
    this.list = h('ol', { class: 'rows' });
    this.emptyEl = h('p', { class: 'coll-empty mono dim' }, o.empty ?? 'nothing here yet.');
    root.append(this.list, this.emptyEl);
    root.querySelector('[data-add]')?.addEventListener('click', () => this.openAdd());
    if (this.sorted) sortable(this.list, { item: '.row', handle: '.row-handle', onDrop: (ids) => this.applyOrder(ids) });
    this.order = orderSaver(`${this.url}/order`, this.headState, async () => this.setItems(await api<Item[]>('GET', this.url)));
    this.setItems(o.items);
  }

  private get fields() {
    return this.o.def.fields.filter((f) => !this.o.omit?.includes(f.name));
  }
  private matches(it: Item) {
    const v = this.o.view;
    return !v || String(it[v.field]) === v.value;
  }
  visible() {
    return this.items.filter((it) => this.matches(it));
  }

  /** Reconciles rows with a fresh list (first render, or after reloading from the server). */
  setItems(items: Item[]) {
    this.items = this.sorted ? [...items] : [...items].sort(byNumber);
    const keep = new Set(items.map((it) => it.id));
    for (const [id, row] of this.rows) if (!keep.has(id)) this.drop(row);
    for (const it of this.items) {
      const row = this.rows.get(it.id);
      if (row) this.paintRow(row, it);
      else this.rows.set(it.id, this.makeRow(it));
    }
    this.sync();
  }

  /** Takes the server's copy of one item. Open forms keep what is being typed. */
  replace(it: Item) {
    const i = this.items.findIndex((x) => x.id === it.id);
    if (i < 0) return;
    this.items[i] = it;
    if (!this.sorted) this.items.sort(byNumber);
    const row = this.rows.get(it.id)!;
    this.paintRow(row, it);
    row.form?.extra?.update(it);
    this.sync();
  }

  setView(value: string) {
    if (!this.o.view) return;
    this.order.flush();
    this.o.view.value = value;
    const kind = this.adder?.el.querySelector<HTMLSelectElement>(`[name="${this.o.view.field}"]`);
    if (kind) kind.value = value;
    this.sync();
  }

  /* ——— rows ——— */

  private makeRow(it: Item): Row {
    const flagName = this.o.def.flag;
    const titleEl = h('span', { class: 'row-title' });
    const subEl = h('span', { class: 'row-sub mono dim' });
    const toggle = h('button', { type: 'button', class: 'row-text', 'aria-expanded': 'false' }, titleEl, subEl);
    const flag = h('input', { type: 'checkbox' });
    const stateEl = h('span', { class: 'row-state mono', 'aria-live': 'polite' });
    const thumb = this.o.thumb ? h('img', { class: 'row-thumb', alt: '', loading: 'lazy', decoding: 'async' }) : null;
    const up = this.sorted ? h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'move up', title: 'move up' }, '↑') : null;
    const down = this.sorted ? h('button', { type: 'button', class: 'a-btn a-btn-icon', 'aria-label': 'move down', title: 'move down' }, '↓') : null;
    const edit = h('button', { type: 'button', class: 'a-btn row-edit' }, 'edit');
    const li = h(
      'li',
      { class: 'row', 'data-id': it.id },
      h(
        'div',
        { class: 'row-main' },
        this.sorted ? h('span', { class: 'row-handle', 'aria-hidden': 'true', title: 'drag to reorder' }, h('i'), h('i'), h('i')) : null,
        thumb,
        toggle,
        h('div', { class: 'row-ctl' }, stateEl, h('label', { class: 'tog tog-sm' }, flag, h('span', { class: 'tog-track', 'aria-hidden': 'true' }), h('span', { class: 'tog-text mono' }, flagName)), up, down, edit),
      ),
    );
    const row: Row = { li, item: it, titleEl, subEl, toggle, flag, state: label(stateEl), thumb, up, down, form: null };

    toggle.addEventListener('click', () => this.toggleForm(row));
    edit.addEventListener('click', () => this.toggleForm(row));
    flag.addEventListener('change', () => this.saveFlag(row));
    up?.addEventListener('click', () => this.move(row, -1, up));
    down?.addEventListener('click', () => this.move(row, 1, down));
    this.paintRow(row, it);
    return row;
  }

  private paintRow(row: Row, it: Item) {
    row.item = it;
    const title = this.o.title(it) || '—';
    row.titleEl.textContent = title;
    row.subEl.textContent = this.o.sub?.(it) ?? '';
    const on = Number(it[this.o.def.flag]) === 1;
    row.flag.checked = on;
    row.flag.setAttribute('aria-label', `${this.o.def.flag}: ${title}`);
    row.li.classList.toggle('is-off', !on);
    if (row.thumb) {
      const src = this.o.thumb!(it);
      row.thumb.hidden = !src;
      if (src && row.thumb.getAttribute('src') !== src) row.thumb.src = src;
    }
  }

  /** Puts rows in item order, shows only the current view, and updates counts and ↑ ↓ ends. */
  private sync() {
    let prev: HTMLElement | null = null;
    for (const it of this.items) {
      const li = this.rows.get(it.id)!.li;
      li.hidden = !this.matches(it);
      const expected: Element | null = prev ? prev.nextElementSibling : this.list.firstElementChild;
      if (expected !== li) (prev ? prev.after(li) : this.list.prepend(li));
      prev = li;
    }
    const vis = this.visible();
    vis.forEach((it, i) => {
      const r = this.rows.get(it.id)!;
      if (r.up) r.up.disabled = i === 0;
      if (r.down) r.down.disabled = i === vis.length - 1;
    });
    this.emptyEl.hidden = vis.length > 0;
    const on = vis.filter((it) => Number(it[this.o.def.flag]) === 1).length;
    const count = this.root.querySelector('[data-count]');
    if (count) count.textContent = vis.length ? `${vis.length} · ${on} ${this.o.def.flag}` : '';
    this.o.onChange?.();
  }

  /* ——— edit ——— */

  private toggleForm(row: Row) {
    if (row.form && !row.form.el.hidden) return this.closeForm(row);
    if (!row.form) {
      const ctl = controls(this.fields, row.item);
      const stateEl = h('span', { class: 'f-state mono', 'aria-live': 'polite' });
      const extra = this.o.extra?.(row.item, this) ?? null;
      const el = h(
        'form',
        { class: 'row-form' },
        ctl.el,
        extra?.el ?? null,
        h(
          'div',
          { class: 'f-actions' },
          h('button', { type: 'submit', class: 'a-btn a-btn-solid' }, 'save'),
          h('button', { type: 'button', class: 'a-btn', onclick: () => this.cancel(row) }, 'cancel'),
          stateEl,
          h('button', { type: 'button', class: 'a-btn a-btn-quiet f-end', onclick: () => this.remove(row) }, 'delete'),
        ),
      );
      el.addEventListener('submit', (e) => {
        e.preventDefault();
        this.save(row);
      });
      el.addEventListener('input', paint);
      row.form = { el, ctl, state: label(stateEl), extra };
      row.li.append(el);
    }
    row.form.el.hidden = false;
    row.li.classList.add('is-open');
    row.toggle.setAttribute('aria-expanded', 'true');
    row.li.querySelector('.row-edit')!.textContent = 'close';
    watch(row.form.el, () => row.form!.ctl.isDirty());
    row.form.ctl.focus();
  }

  private closeForm(row: Row) {
    if (!row.form) return;
    row.form.el.hidden = true;
    row.li.classList.remove('is-open');
    row.toggle.setAttribute('aria-expanded', 'false');
    row.li.querySelector('.row-edit')!.textContent = 'edit';
    // closing keeps typed text for next time, so it still counts as unsaved until saved or cancelled
    if (row.form.ctl.isDirty()) row.state.busy('unsaved edits');
    paint();
  }

  private cancel(row: Row) {
    row.form?.ctl.reset(row.item);
    row.form?.state.clear();
    row.state.clear();
    if (row.form) unwatch(row.form.el);
    this.closeForm(row);
    row.toggle.focus();
  }

  private async save(row: Row) {
    const f = row.form!;
    const changes = f.ctl.changed();
    if (!Object.keys(changes).length) {
      this.closeForm(row);
      return;
    }
    f.state.busy();
    try {
      const it = await track(api<Item>('PATCH', `${this.url}/${row.item.id}`, changes));
      f.ctl.reset(it);
      f.state.clear();
      unwatch(f.el);
      this.replace(it);
      this.closeForm(row);
      row.state.ok();
      if (!row.li.hidden) row.toggle.focus();
    } catch (e) {
      f.state.err((e as Error).message);
    }
  }

  private async saveFlag(row: Row) {
    const name = this.o.def.flag;
    const want = row.flag.checked;
    row.state.busy();
    try {
      const it = await track(api<Item>('PATCH', `${this.url}/${row.item.id}`, { [name]: want }));
      this.replace(it);
      row.state.ok();
    } catch (e) {
      row.flag.checked = !want;
      row.state.err((e as Error).message);
    }
  }

  private async remove(row: Row) {
    const title = this.o.title(row.item) || `this ${this.o.noun}`;
    if (!confirm(`delete “${title}”? this can’t be undone.`)) return;
    row.form?.state.busy('deleting…');
    try {
      await track(api('DELETE', `${this.url}/${row.item.id}`));
      this.items = this.items.filter((x) => x.id !== row.item.id);
      this.drop(row);
      this.sync();
      this.headState.ok('deleted');
    } catch (e) {
      row.form?.state.err((e as Error).message);
      if (!row.form) row.state.err((e as Error).message);
    }
  }

  private drop(row: Row) {
    if (row.form) unwatch(row.form.el);
    row.li.remove();
    this.rows.delete(row.item.id);
  }

  /* ——— add ——— */

  private openAdd() {
    if (this.adder) return this.adder.ctl.focus();
    const init: Record<string, string> = this.o.view ? { [this.o.view.field]: this.o.view.value } : {};
    const ctl = controls(this.fields, init);
    const stateEl = h('span', { class: 'f-state mono', 'aria-live': 'polite' });
    const state = label(stateEl);
    const el = h(
      'form',
      { class: 'row-form add-form', 'aria-label': `new ${this.o.noun}` },
      h('p', { class: 'mono dim' }, `new ${this.o.noun}`),
      ctl.el,
      h(
        'div',
        { class: 'f-actions' },
        h('button', { type: 'submit', class: 'a-btn a-btn-solid' }, 'add'),
        h('button', { type: 'button', class: 'a-btn', onclick: () => close() }, 'cancel'),
        stateEl,
      ),
    );
    const close = () => {
      unwatch(el);
      el.remove();
      this.adder = null;
      (this.root.querySelector('[data-add]') as HTMLElement | null)?.focus();
    };
    el.addEventListener('input', paint);
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.busy('adding…');
      try {
        const it = await track(api<Item>('POST', this.url, ctl.read()));
        unwatch(el);
        el.remove();
        this.adder = null;
        this.items.push(it);
        if (!this.sorted) this.items.sort(byNumber);
        const row = this.makeRow(it);
        this.rows.set(it.id, row);
        // follow the new item if it landed in another view (music: the kind chosen in the form)
        if (this.o.view && !this.matches(it)) {
          this.o.view.value = String(it[this.o.view.field]);
          this.o.onView?.(this.o.view.value);
        }
        this.sync();
        row.state.ok('added');
        row.li.classList.add('is-new');
        row.toggle.focus();
      } catch (err) {
        state.err((err as Error).message);
      }
    });
    watch(el, () => ctl.isDirty());
    this.list.before(el);
    this.adder = { el, ctl };
    ctl.focus();
  }

  /* ——— order ——— */

  private move(row: Row, dir: -1 | 1, btn: HTMLButtonElement) {
    const ids = this.visible().map((it) => it.id);
    const i = ids.indexOf(row.item.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.applyOrder(ids);
    // the row moved in the DOM; keep the keyboard where it was
    (btn.disabled ? (dir < 0 ? row.down : row.up) : btn)?.focus();
  }

  private applyOrder(ids: string[]) {
    this.items = reorderWithin(this.items, ids);
    this.sync();
    this.order.schedule(ids);
  }
}
