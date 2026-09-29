import { $$, readJSON } from './dom';

export type LiveStatus = {
  isLive: boolean;
  /** ignored: the public site only ever says LIVE (see paintLive) */
  label: string;
  streamUrl: string | null;
  sessionTitle: string | null;
  startedAt: string | null;
  updatedAt: string;
};
export type Presence = { status: string; listening: { title: string; artist: string } | null };

type Listener = (s: LiveStatus) => void;
const listeners = new Set<Listener>();
let current: LiveStatus = readJSON<LiveStatus>('live-initial') ?? {
  isLive: false, label: '', streamUrl: null, sessionTitle: null, startedAt: null, updatedAt: '',
};
let presence: Presence | null = null;

export const live = {
  get: () => current,
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(current);
    return () => listeners.delete(fn);
  },
};

/** Applies status to every generic live element on the page (marks, listen buttons, session lines). */
export function paintLive(root: ParentNode = document, s = current) {
  for (const el of $$('[data-live-mark], [data-live-root], [data-presence]', root)) el.dataset.live = s.isLive ? 'on' : 'off';
  // never "off air": off, the mark is empty (and hidden by CSS)
  for (const el of $$('[data-live-label]', root)) el.textContent = s.isLive ? 'LIVE' : '';
  for (const el of $$<HTMLButtonElement>('[data-listen-live]', root)) {
    el.disabled = !s.isLive;
    if (el.dataset.hideOff !== undefined) el.hidden = !s.isLive;
  }
  for (const el of $$('[data-live-session]', root)) {
    if (s.isLive) el.textContent = s.sessionTitle ?? '';
    else if (el.dataset.offText) el.textContent = el.dataset.offText;
  }
  if (presence) paintPresence(root, presence);
}

/** Personal status + listening line on the homepage. Text only swaps when it actually changed. */
function paintPresence(root: ParentNode, p: Presence) {
  const swap = (el: HTMLElement, text: string) => {
    if (el.textContent === text) return;
    el.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
    el.textContent = text;
  };
  for (const el of $$('[data-presence-status]', root)) swap(el, p.status);
  for (const el of $$('[data-presence-listen]', root)) {
    el.hidden = !p.listening;
    if (p.listening) swap(el, `♪ ${p.listening.title}${p.listening.artist ? ` — ${p.listening.artist}` : ''}`);
  }
  if (p.listening) {
    for (const el of $$('[data-presence-track]', root)) swap(el, p.listening.title);
    for (const el of $$('[data-presence-artist]', root)) swap(el, p.listening.artist);
  }
}

function set(next: LiveStatus, p: Presence) {
  const changed = next.isLive !== current.isLive || next.sessionTitle !== current.sessionTitle || next.streamUrl !== current.streamUrl;
  current = next;
  presence = p;
  paintLive();
  if (changed) listeners.forEach((fn) => fn(current));
}

/** Fetches the status now (the DJ page does when the radio's own status disagrees with the last one). */
export async function poll() {
  try {
    const q = new URLSearchParams(location.search).get('live');
    const res = await fetch(`/api/presence${q ? `?live=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { live: l, status, listening } = await res.json();
    set(l, { status, listening });
  } catch {
    /* offline — keep last known */
  }
}

/** Near-realtime: every 15s while visible, and immediately when the tab comes back. */
export function startLivePolling(intervalMs = 15_000) {
  let id = setInterval(poll, intervalMs);
  document.addEventListener('visibilitychange', () => {
    clearInterval(id);
    if (document.visibilityState === 'visible') {
      poll();
      id = setInterval(poll, intervalMs);
    }
  });
}
