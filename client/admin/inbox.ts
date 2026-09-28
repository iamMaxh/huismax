import { $ } from '../lib/dom';
import { h, when } from './h';
import { api, type Message } from './api';
import { label, track } from './state';

/** /reply messages, newest first. Everything from visitors is rendered as text. */
export function inbox(root: HTMLElement, initial: Message[]) {
  let messages = initial;
  const list = h('ol', { class: 'msgs' });
  const empty = h('p', { class: 'coll-empty mono dim' }, 'no messages yet.');
  root.append(list, empty);
  const count = $('[data-inbox-count]', root)!;
  const state = label($('[data-inbox-state]', root)!);
  const badges = document.querySelectorAll<HTMLElement>('[data-unread]');

  /** mailto: with both halves encoded, so an address can't smuggle extra headers (?cc=…) */
  const mailto = (m: Message) => {
    const at = m.email.lastIndexOf('@');
    const subject = encodeURIComponent('re: your message on huismax');
    return `mailto:${encodeURIComponent(m.email.slice(0, at))}@${encodeURIComponent(m.email.slice(at + 1))}?subject=${subject}`;
  };

  function item(m: Message) {
    const stEl = h('span', { class: 'row-state mono', 'aria-live': 'polite' });
    const s = label(stEl);
    const readBtn = h('button', { type: 'button', class: 'a-btn' }, m.read ? 'mark unread' : 'mark read');
    const del = h('button', { type: 'button', class: 'a-btn a-btn-quiet' }, 'delete');
    const li = h(
      'li',
      { class: `msg${m.read ? '' : ' is-unread'}`, 'data-id': m.id },
      h(
        'div',
        { class: 'msg-head' },
        h('span', { class: 'msg-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'msg-from' }, m.name || 'no name'),
        m.email ? h('span', { class: 'mono dim msg-email' }, m.email) : null,
        h('time', { class: 'mono dim msg-time', datetime: m.created_at }, when(m.created_at)),
      ),
      h('p', { class: 'msg-body' }, m.body),
      h(
        'div',
        { class: 'msg-actions' },
        h('span', { class: 'mono dim' }, m.read ? 'read' : 'unread', ' · ', m.emailed ? 'emailed' : 'not emailed'),
        stEl,
        h('span', { class: 'f-end' }),
        m.email ? h('a', { class: 'a-btn', href: mailto(m) }, 'reply by email ↗') : null,
        readBtn,
        del,
      ),
    );
    readBtn.addEventListener('click', async () => {
      s.busy();
      try {
        await track(api('PATCH', `/api/admin/messages/${m.id}`, { read: !m.read }));
        messages = messages.map((x) => (x.id === m.id ? { ...x, read: m.read ? 0 : 1 } : x));
        render();
      } catch (e) {
        s.err((e as Error).message);
      }
    });
    del.addEventListener('click', async () => {
      if (!confirm(`delete the message from ${m.name || 'no name'}? this can’t be undone.`)) return;
      s.busy('deleting…');
      try {
        await track(api('DELETE', `/api/admin/messages/${m.id}`));
        const i = messages.findIndex((x) => x.id === m.id);
        messages = messages.filter((x) => x.id !== m.id);
        render();
        // the keyboard goes to the next message (or the one before, or refresh), not back to the top of the page
        const near = messages[i] ?? messages[i - 1];
        (near ? list.querySelector<HTMLElement>(`[data-id="${CSS.escape(near.id)}"] .msg-actions button`) : $<HTMLElement>('[data-inbox-refresh]', root))?.focus();
        state.ok('deleted');
      } catch (e) {
        s.err((e as Error).message);
      }
    });
    return li;
  }

  function render() {
    const focused = (document.activeElement as HTMLElement | null)?.closest('.msg')?.getAttribute('data-id');
    list.replaceChildren(...messages.map(item));
    empty.hidden = messages.length > 0;
    const unread = messages.filter((m) => !m.read).length;
    count.textContent = messages.length ? `${messages.length} · ${unread} unread` : '';
    for (const b of badges) {
      b.textContent = String(unread);
      b.hidden = !unread;
    }
    // keep the keyboard on the message that was acted on
    if (focused) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"] .msg-actions button`)?.focus();
  }

  $('[data-inbox-refresh]', root)?.addEventListener('click', async () => {
    state.busy('loading…');
    try {
      messages = await api<Message[]>('GET', '/api/admin/messages');
      render();
      state.ok('up to date');
    } catch (e) {
      state.err((e as Error).message);
    }
  });

  render();
}
