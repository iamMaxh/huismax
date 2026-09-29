import { $, readJSON } from './dom';
import { format, type Block, type Inline, type LinkPolicy } from './chat-format';
import { ERROR_TEXT, streamAssistantMessage, type HistoryItem, type Outcome } from './assistant-api';

/**
 * Live chat with Max's AI Assistant. A panel outside <main>, so a conversation survives page changes
 * (the router only swaps <main>). Networking lives in assistant-api.ts; this file is only the interface.
 *
 * Model output is untrusted: it's rendered as text nodes (never innerHTML), with light Markdown
 * (paragraphs, lists) and links only to Max's own site and profiles (see `linkPolicy`).
 */

const GREETING = "Hi, I'm Max's AI assistant. What would you like to know about him?";
const SUGGESTIONS = ['Who is Max?', 'What is he building?', 'How can I reach him?'];
const KEY = 'huismax:chat:v1';
const MAX_LEN = 2000;
const KEEP = 60;

type Entry = {
  role: 'user' | 'assistant';
  text: string;
  /** what went wrong (shown under the message) */
  error?: string;
  /** stopped by the visitor */
  stopped?: boolean;
  /** a question whose answer failed before any text: shown, but not sent as history */
  failed?: boolean;
};

/** sessionStorage only: the chat survives a reload in this tab, and is gone when the tab closes. */
const store = {
  load(): Entry[] {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
      if (Array.isArray(v)) return v.filter((e) => e && (e.role === 'user' || e.role === 'assistant') && typeof e.text === 'string').slice(-KEEP);
    } catch {
      /* private mode or junk */
    }
    return [];
  },
  save(log: Entry[]) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(log.slice(-KEEP)));
    } catch {
      /* still works, just not across a reload */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

/** What goes to the API as history: real exchanges only (no greeting, no failed questions, no empty answers). */
export function historyOf(log: Entry[]): HistoryItem[] {
  return log.filter((e) => !e.failed && e.text.trim()).map((e) => ({ role: e.role, content: e.text }));
}

/** Links an answer may contain: pages of this site, and hosts Max links to himself (footer, profile). */
function linkPolicy(): LinkPolicy {
  const pages = new Set((readJSON<{ pages: { href: string }[] }>('site-nav')?.pages ?? []).map((p) => p.href));
  const hosts = new Set(['huismax.com', 'tapical.us', 'open.spotify.com']);
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.footer-links a, a.presence-profile, a.identity-ext')) {
    try {
      hosts.add(new URL(a.href).hostname.replace(/^www\./, ''));
    } catch {
      /* not a URL */
    }
  }
  return (href) => {
    if (href.startsWith('/')) return pages.has(href.replace(/\/+$/, '') || '/');
    try {
      const u = new URL(href);
      return u.protocol === 'https:' && !u.username && !u.password && hosts.has(u.hostname.replace(/^www\./, ''));
    } catch {
      return false;
    }
  };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function render(target: HTMLElement, blocks: Block[]) {
  target.replaceChildren();
  const inl = (parent: HTMLElement, parts: Inline[]) => {
    for (const p of parts) {
      if (p.t === 'text') parent.append(p.v);
      else {
        const a = el('a', 'chat-link', p.v);
        a.href = p.href;
        if (/^https?:\/\//.test(p.href)) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        parent.append(a);
      }
    }
  };
  for (const b of blocks) {
    if (b.t === 'p') {
      const p = el('p');
      inl(p, b.inline);
      target.append(p);
    } else {
      const ul = el('ul');
      for (const item of b.items) {
        const li = el('li');
        inl(li, item);
        ul.append(li);
      }
      target.append(ul);
    }
  }
}

export function startChat() {
  let log = store.load();
  let controller: AbortController | null = null;
  let startedAt = 0;
  const links = linkPolicy();

  const dialog = el('dialog', 'chat');
  dialog.setAttribute('aria-labelledby', 'chat-title');
  dialog.innerHTML = `
    <div class="chat-top">
      <div class="chat-head">
        <h2 class="chat-title" id="chat-title">Max's AI Assistant</h2>
        <span class="chat-sub mono">an ai, not max himself</span>
      </div>
      <div class="chat-tools">
        <button type="button" class="menu-btn" data-chat-new>new chat</button>
        <button type="button" class="menu-btn" data-chat-close aria-label="close chat">close</button>
      </div>
    </div>
    <div class="chat-scroll">
      <ol class="chat-log" role="log" aria-live="polite" aria-label="conversation"></ol>
      <div class="chat-suggest" role="group" aria-label="suggested questions"></div>
    </div>
    <form class="chat-form" novalidate>
      <label class="sr-only" for="chat-input">message to Max's AI Assistant</label>
      <textarea id="chat-input" rows="1" maxlength="${MAX_LEN}" placeholder="ask about max" autocomplete="off" enterkeyhint="send"></textarea>
      <button type="submit" class="chat-send" data-chat-send>send <span aria-hidden="true">→</span></button>
      <button type="button" class="chat-stop" data-chat-stop hidden>stop <span aria-hidden="true">■</span></button>
    </form>
    <p class="chat-note mono">answers can be wrong. this chat is kept in this tab only.</p>`;
  document.body.append(dialog);

  const logEl = $('.chat-log', dialog)!;
  const scroller = $('.chat-scroll', dialog)!;
  const suggest = $('.chat-suggest', dialog)!;
  const form = $<HTMLFormElement>('.chat-form', dialog)!;
  const input = $<HTMLTextAreaElement>('#chat-input', dialog)!;
  const send = $<HTMLButtonElement>('[data-chat-send]', dialog)!;
  const stop = $<HTMLButtonElement>('[data-chat-stop]', dialog)!;
  const newBtn = $<HTMLButtonElement>('[data-chat-new]', dialog)!;

  // Follow the answer as it streams, unless the reader scrolled up to read something.
  let follow = true;
  scroller.addEventListener('scroll', () => {
    follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
  }, { passive: true });
  const toBottom = (force = false) => {
    if (force) follow = true;
    if (follow) scroller.scrollTop = scroller.scrollHeight;
  };

  function row(entry: Entry) {
    const li = el('li', 'chat-msg');
    li.dataset.role = entry.role;
    const who = el('span', 'chat-who mono', entry.role === 'user' ? 'you' : "max's ai assistant");
    const body = el('div', 'chat-text');
    const note = el('p', 'chat-state mono');
    li.append(who, body, note);
    logEl.append(li);
    const paint = (e: Entry, state: 'thinking' | 'streaming' | 'final' = 'final') => {
      li.dataset.state = state;
      if (state === 'thinking') {
        body.replaceChildren(el('span', 'chat-thinking', 'thinking'));
      } else if (e.role === 'user' || state === 'streaming') {
        body.textContent = e.text;
      } else {
        render(body, format(e.text, links));
      }
      const msg = e.error ?? (e.stopped ? 'stopped.' : '');
      note.textContent = msg;
      note.hidden = !msg;
      li.classList.toggle('chat-failed', !!e.error && !e.text);
    };
    paint(entry);
    return { paint, li };
  }

  function paintAll() {
    logEl.replaceChildren();
    row({ role: 'assistant', text: GREETING });
    for (const e of log) row(e);
    suggest.replaceChildren();
    if (!log.length) {
      for (const q of SUGGESTIONS) {
        const b = el('button', 'btn-line', q);
        b.type = 'button';
        b.addEventListener('click', () => ask(q));
        suggest.append(b);
      }
    }
    newBtn.hidden = !log.length;
    toBottom(true);
  }

  const fit = () => {
    input.style.height = 'auto';
    // scrollHeight leaves out the border: add it, or a one-line field shows a scrollbar
    input.style.height = `${Math.min(input.scrollHeight + input.offsetHeight - input.clientHeight, 168)}px`;
  };
  const generating = (on: boolean) => {
    // read focus before hiding: a hidden button drops it at once. A suggestion that was just removed counts as Send.
    const at = document.activeElement;
    const move = on ? at === send || !dialog.contains(at) : at === stop;
    send.hidden = on;
    stop.hidden = !on;
    dialog.toggleAttribute('data-busy', on);
    // screen readers: no announcement per token, one when the answer settles
    logEl.setAttribute('aria-busy', String(on));
    // focus follows the button that replaced the one in use (Send, not the field, on touch: no surprise keyboard)
    if (move) (on ? stop : matchMedia('(pointer: fine)').matches ? input : send).focus({ preventScroll: true });
  };

  async function ask(raw: string) {
    const question = raw.trim().slice(0, MAX_LEN);
    if (!question || controller) return; // one request at a time
    const history = historyOf(log);
    input.value = '';
    fit();
    suggest.replaceChildren();
    newBtn.hidden = false;

    const user: Entry = { role: 'user', text: question };
    const answer: Entry = { role: 'assistant', text: '' };
    log.push(user);
    row(user);
    const view = row(answer);
    view.paint(answer, 'thinking');
    toBottom(true);

    const convo = log;
    const ctl = (controller = new AbortController());
    startedAt = performance.now();
    generating(true);
    let outcome: Outcome;
    try {
      outcome = await streamAssistantMessage(
        question,
        history,
        {
          onToken: (t) => {
            answer.text += t;
            view.paint(answer, 'streaming');
            toBottom();
          },
        },
        ctl.signal,
      );
    } catch {
      outcome = { status: 'error', kind: 'server' };
    }
    controller = null;
    generating(false);
    // "new chat" cleared this conversation while it streamed: don't write the old answer back
    if (log !== convo) return;

    if (outcome.status === 'stopped') answer.stopped = true;
    if (outcome.status === 'error') answer.error = ERROR_TEXT[outcome.kind];
    if (!answer.text) user.failed = true; // nothing came back: don't send it as context next time
    if (answer.text || answer.error) log.push(answer);
    else view.li.remove();
    view.paint(answer);
    store.save(log);
    toBottom();
    // back to the input, unless the visitor has moved focus somewhere else on the page
    const at = document.activeElement;
    if (matchMedia('(pointer: fine)').matches && dialog.open && (!at || at === document.body || dialog.contains(at))) input.focus();
  }

  let opener: HTMLElement | null = null;
  // aria-expanded on every opener, including ones a page change just brought in
  const sync = (root: ParentNode = document) => {
    for (const b of root.querySelectorAll<HTMLElement>('[data-chat-open]')) b.setAttribute('aria-expanded', String(dialog.open));
  };
  const open = () => {
    if (dialog.open) return;
    // full screen on a phone (chat.css, max-width 560px): modal, so the page behind is inert and back closes it
    if (matchMedia('(max-width: 560px)').matches) dialog.showModal();
    else dialog.show();
    document.documentElement.classList.add('chat-open');
    sync();
    // the log is kept as it is (an answer may still be streaming into it); just show the latest
    toBottom(true);
    if (matchMedia('(pointer: fine)').matches) input.focus();
    else $<HTMLElement>('[data-chat-close]', dialog)!.focus({ preventScroll: true });
  };
  const close = () => dialog.open && dialog.close();
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('chat-open');
    sync();
    (opener?.isConnected ? opener : document.querySelector<HTMLElement>('.site-header [data-chat-open]'))?.focus({ preventScroll: true });
  });

  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-chat-open]');
    if (!b) return;
    e.preventDefault();
    opener = b;
    dialog.open ? close() : open();
  });
  dialog.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-chat-close]')) return close();
    // the second click of a double-click on Send lands on Stop: ignore it
    if (t.closest('[data-chat-stop]')) return performance.now() - startedAt < 400 ? undefined : controller?.abort();
    if (t.closest('[data-chat-new]')) {
      controller?.abort();
      log = [];
      store.clear();
      paintAll();
      input.focus();
      return;
    }
    // a page link on a phone: show the page (the chat is kept; the router doesn't touch it)
    const a = t.closest<HTMLAnchorElement>('a.chat-link');
    if (a && !a.target && matchMedia('(max-width: 720px)').matches) close();
  });
  dialog.addEventListener('keydown', (e) => {
    // Esc that cancels an IME (pinyin) candidate is the IME's, not ours
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    // Esc while an answer streams stops it first; the next Esc closes
    if (controller) controller.abort();
    else close();
  });

  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter is a new line; the Enter that confirms an IME (pinyin) candidate does nothing
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  paintAll();
  return { open, close, sync };
}
