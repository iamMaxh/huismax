import { $$, readJSON } from './dom';

export type LiveStatus = {
  isLive: boolean;
  label: 'LIVE' | 'OFF AIR';
  streamUrl: string | null;
  sessionTitle: string | null;
  startedAt: string | null;
  updatedAt: string;
};

type Listener = (s: LiveStatus) => void;
const listeners = new Set<Listener>();
let current: LiveStatus = readJSON<LiveStatus>('live-initial') ?? {
  isLive: false, label: 'OFF AIR', streamUrl: null, sessionTitle: null, startedAt: null, updatedAt: '',
};

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
  for (const el of $$('[data-live-mark], [data-live-root]', root)) el.dataset.live = s.isLive ? 'on' : 'off';
  for (const el of $$('[data-live-label]', root)) el.textContent = s.label;
  for (const el of $$<HTMLButtonElement>('[data-listen-live]', root)) {
    el.disabled = !s.isLive;
    if (el.dataset.hideOff !== undefined) el.hidden = !s.isLive;
  }
  for (const el of $$('[data-live-session]', root)) {
    if (s.isLive) el.textContent = s.sessionTitle ?? '';
    else if (el.dataset.offText) el.textContent = el.dataset.offText;
  }
}

function set(next: LiveStatus) {
  const changed = next.isLive !== current.isLive || next.sessionTitle !== current.sessionTitle || next.streamUrl !== current.streamUrl;
  current = next;
  if (!changed) return;
  paintLive();
  listeners.forEach((fn) => fn(current));
}

async function poll() {
  try {
    const q = new URLSearchParams(location.search).get('live');
    const res = await fetch(`/api/live-status${q ? `?live=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' });
    if (res.ok) set(await res.json());
  } catch {
    /* offline — keep last known */
  }
}

export function startLivePolling(intervalMs = 30_000) {
  let id = setInterval(poll, intervalMs);
  document.addEventListener('visibilitychange', () => {
    clearInterval(id);
    if (document.visibilityState === 'visible') {
      poll();
      id = setInterval(poll, intervalMs);
    }
  });
}
