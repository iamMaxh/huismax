import { $, $$, readJSON, Scope } from './lib/dom';
import { proximity } from './lib/proximity';
import { initNav } from './admin/nav';
import { initStatus, type Live, type Presence } from './admin/status';
import { Collection, type CollOpts } from './admin/collection';
import { photoManager } from './admin/photos';
import { coverEditor } from './admin/dj';
import { settingsForms } from './admin/settings';
import { inbox } from './admin/inbox';
import { paint } from './admin/state';
import { h, pad3 } from './admin/h';
import type { AdminData, CollectionName, Item, PageKey, Settings } from './admin/api';

const scope = new Scope();
proximity(document, scope, 90);

function init(main: HTMLElement) {
  const initial = readJSON<{ live: Live; presence: Presence; data: AdminData | null }>('admin-initial')!;
  initNav();
  const status = initStatus(main, initial);
  if (initial.data) cms(main, initial.data);

  document.addEventListener('keydown', (e) => {
    const target = e.target as Element;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      // ⌘↵ saves the form you're in (textareas included), or flushes the status fields
      e.preventDefault();
      const form = target.closest?.('form:not([action])') as HTMLFormElement | null;
      if (form) form.requestSubmit();
      else status.flush();
    } else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && status.owns(target) && target.matches('.a-field')) {
      // (not the Enter that picks a pinyin candidate; Safari reports that one as keyCode 229)
      status.flush();
    }
  });

  // a file dropped outside an upload area would navigate away from the admin
  addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files') || (e.target as Element).closest?.('.drop')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  });
  addEventListener('drop', (e) => {
    if (!(e.target as Element).closest?.('.drop')) e.preventDefault();
  });

  paint();
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const join = (...parts: unknown[]) => parts.filter((p) => p !== false && p !== 0).map(s).filter(Boolean).join(' · ');

const MUSIC_KINDS = [
  { kind: 'artist', label: 'artists', note: 'artists you want as part of your public music identity.' },
  { kind: 'rotation', label: 'rotation', note: 'what has been on repeat lately.' },
  { kind: 'featured', label: 'featured', note: 'albums and playlists to point people to.' },
];

function cms(main: HTMLElement, data: AdminData) {
  const coll = (name: CollectionName, opts: Omit<CollOpts, 'name' | 'def' | 'items'>) => {
    const root = $(`[data-coll="${name}"]`, main);
    return root ? new Collection(root, { name, def: data.defs[name], items: data.collections[name] ?? [], ...opts }) : null;
  };

  coll('identities', { noun: 'identity', title: (it) => s(it.name), sub: (it) => join(it.href, it.meta, it.caption && `“${s(it.caption)}”`) });
  coll('projects', { noun: 'project', title: (it) => s(it.name), sub: (it) => join(it.status, it.url, it.note) });
  coll('now', { noun: 'item', title: (it) => s(it.text), sub: (it) => join(it.label, it.url), empty: 'nothing yet. the now page shows only what you add here.' });
  coll('links', { noun: 'link', title: (it) => s(it.label), sub: (it) => s(it.url) });
  coll('services', { noun: 'site', title: (it) => s(it.name), sub: (it) => join(it.url, it.description), empty: 'no sites yet. /homelab leaves the section out.' });
  coll('dj', {
    noun: 'session',
    title: (it) => `${pad3(it.number)}  ${s(it.title)}`,
    sub: (it) => join(it.date, it.duration, !it.audio_url && 'no audio link'),
    thumb: (it) => (it.cover_key ? `/media/${s(it.cover_key)}` : ''),
    extra: coverEditor(data.media),
    empty: 'no sessions yet. the page keeps its empty state until one is published.',
  });
  coll('requests', {
    noun: 'request',
    title: (it) => s(it.request),
    sub: (it) => join(it.name && `from ${s(it.name)}`, s(it.created_at).slice(0, 10)),
    empty: 'no requests yet. they come in from the form on /dj.',
  });
  music(main, data);

  for (const el of $$('[data-photos]', main)) {
    photoManager(el, el.dataset.photos as 'photography' | 'hiking', data.collections.photos ?? [], data.defs.photos, data.media);
  }

  const box = $('[data-inbox]', main);
  if (box) inbox(box, data.messages);

  // email status follows the "where messages go" form
  const paintEmail = (st: Settings) => {
    const dest = st.replyTo || data.email.destination; // the admin address, else REPLY_TO from Cloudflare
    const ready = data.email.resendKey && !!dest;
    const readyEl = $('[data-email-ready]', main);
    const destEl = $('[data-email-dest]', main);
    if (readyEl) readyEl.textContent = ready ? '● emails go out' : '○ not sending email';
    if (destEl) destEl.textContent = dest || 'no address yet — add one below';
  };
  const paintPages = (st: Settings) => {
    for (const el of $$('[data-page-flag]', main)) el.hidden = st.pages[el.dataset.pageFlag as PageKey] !== false;
  };
  settingsForms(main, data.settings, (st) => {
    paintEmail(st);
    paintPages(st);
  });
  paintEmail(data.settings);
}

/** Music: one list, three views (artists / rotation / featured), each ordered on its own. */
function music(main: HTMLElement, data: AdminData) {
  const root = $('[data-coll="music"]', main);
  if (!root) return;
  const note = h('p', { class: 'mono dim coll-note' });
  const buttons = MUSIC_KINDS.map((k) => h('button', { type: 'button', 'aria-pressed': 'false', 'data-kind': k.kind }, k.label, h('sup', { class: 'mono' })));
  const seg = h('div', { class: 'seg-a', role: 'group', 'aria-label': 'music section' }, buttons);
  root.querySelector('.coll-head')!.after(seg, note);

  const select = (kind: string) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    note.textContent = MUSIC_KINDS.find((k) => k.kind === kind)?.note ?? '';
  };
  const counts = () => {
    if (!list) return;
    for (const b of buttons) b.querySelector('sup')!.textContent = String(list.items.filter((it: Item) => it.kind === b.dataset.kind).length || '');
  };
  let list: Collection | null = null;
  list = new Collection(root, {
    name: 'music',
    def: data.defs.music,
    items: data.collections.music ?? [],
    noun: 'music item',
    title: (it) => s(it.title),
    sub: (it) => join(it.subtitle, it.url),
    view: { field: 'kind', value: 'artist' },
    onChange: () => counts(),
    onView: select,
  });
  for (const b of buttons) {
    b.addEventListener('click', () => {
      select(b.dataset.kind!);
      list!.setView(b.dataset.kind!);
    });
  }
  select('artist');
  counts();
}

// last, so the helpers above are initialised before anything runs
const main = $('[data-admin]');
if (main) init(main);
