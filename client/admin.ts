import { $, $$, readJSON, Scope } from './lib/dom';
import { proximity } from './lib/proximity';

type Live = { isLive: boolean; sessionTitle: string | null; streamUrl: string | null };
type Presence = { status: string; listening: { title: string; artist: string } | null };

const scope = new Scope();
proximity(document, scope, 90);

const main = $('[data-admin]');
if (main) initAdmin(main);

function initAdmin(main: HTMLElement) {
  const init = readJSON<{ live: Live; presence: Presence }>('admin-initial')!;
  const state = { live: { ...init.live }, presence: { ...init.presence } };

  const saveState = $('[data-save-state]')!;
  const statusInput = $<HTMLInputElement>('[data-status-input]', main)!;
  const trackInput = $<HTMLInputElement>('[data-listen-title]', main)!;
  const artistInput = $<HTMLInputElement>('[data-listen-artist]', main)!;
  const liveSwitch = $<HTMLButtonElement>('[data-live-switch]', main)!;
  const liveLabel = $('[data-live-switch-label]', main)!;
  const liveTitle = $<HTMLInputElement>('[data-live-title]', main)!;
  const liveUrl = $<HTMLInputElement>('[data-live-url]', main)!;
  const livePanel = $('.live-panel', main)!;
  const chips = $$<HTMLButtonElement>('[data-preset]', main);

  /* ——— preview mirrors the homepage logic: live overrides status ——— */
  const paint = () => {
    const { live, presence } = state;
    $('[data-preview]', main)!.dataset.live = live.isLive ? 'on' : 'off';
    $('[data-preview-state]', main)!.textContent = live.isLive ? '● LIVE' : presence.status || '—';
    $('[data-preview-sub]', main)!.textContent = live.isLive
      ? 'huismax dj channel'
      : presence.listening ? `♪ ${presence.listening.title}${presence.listening.artist ? ` — ${presence.listening.artist}` : ''}` : '';
    for (const c of chips) c.setAttribute('aria-checked', String(c.dataset.preset === presence.status));
    liveSwitch.setAttribute('aria-checked', String(live.isLive));
    liveLabel.textContent = live.isLive ? '● LIVE' : '○ OFF AIR';
    livePanel.dataset.live = live.isLive ? 'on' : 'off';
  };

  /* ——— saving ——— */
  let pending = 0;
  const flag = (text: string, tone: 'dim' | 'ok' | 'err' = 'dim') => {
    saveState.textContent = text;
    saveState.className = tone === 'err' ? 'save-err' : tone === 'ok' ? '' : 'dim';
  };
  async function post(url: string, body: unknown) {
    pending++;
    flag('saving…');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return void (location.href = '/admin');
      if (!res.ok) throw new Error(data.error ?? `error ${res.status}`);
      flag(--pending ? 'saving…' : 'saved', 'ok');
      return data;
    } catch (e) {
      pending--;
      flag((e as Error).message, 'err');
    }
  }

  const timers = new Map<string, number>();
  const later = (key: string, fn: () => void, ms = 650) => {
    clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(() => (timers.delete(key), fn()), ms));
  };
  const flushAll = () => {
    for (const [key, id] of timers) {
      clearTimeout(id);
      timers.delete(key);
      savers[key as keyof typeof savers]();
    }
  };

  const savers = {
    status: () => post('/api/admin/presence', { status: state.presence.status }),
    listening: () => post('/api/admin/presence', { listening: state.presence.listening }),
    live: () => post('/api/live-status', { isLive: state.live.isLive, sessionTitle: liveTitle.value, streamUrl: liveUrl.value }),
  };

  /* ——— status ——— */
  scope.on(main, 'click', (e: MouseEvent) => {
    const chip = (e.target as Element).closest<HTMLButtonElement>('[data-preset]');
    if (!chip) return;
    state.presence.status = statusInput.value = chip.dataset.preset!;
    paint();
    later('status', savers.status, 0);
  });
  scope.on(statusInput, 'input', () => {
    state.presence.status = statusInput.value.trim();
    paint();
    later('status', savers.status);
  });
  scope.on($('[data-status-clear]', main)!, 'click', () => {
    state.presence.status = statusInput.value = '';
    paint();
    later('status', savers.status, 0);
    statusInput.focus();
  });
  // arrow keys move between presets like a radio group
  scope.on($('[data-presets]', main)!, 'keydown', (e: KeyboardEvent) => {
    const i = chips.indexOf(document.activeElement as HTMLButtonElement);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (i < 0 || !d) return;
    e.preventDefault();
    chips[(i + d + chips.length) % chips.length].focus();
  });

  /* ——— listening ——— */
  const onListen = () => {
    const title = trackInput.value.trim();
    state.presence.listening = title ? { title, artist: artistInput.value.trim() } : null;
    paint();
    later('listening', savers.listening);
  };
  scope.on(trackInput, 'input', onListen);
  scope.on(artistInput, 'input', onListen);
  scope.on($('[data-listen-clear]', main)!, 'click', () => {
    trackInput.value = artistInput.value = '';
    onListen();
    later('listening', savers.listening, 0);
  });

  /* ——— live ——— */
  scope.on(liveSwitch, 'click', () => {
    state.live.isLive = !state.live.isLive;
    paint();
    later('live', savers.live, 0);
  });
  for (const input of [liveTitle, liveUrl]) scope.on(input, 'input', () => later('live', savers.live, 900));

  /* ——— keyboard ——— */
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      flushAll();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).matches('.field')) {
      flushAll();
    }
  });
  addEventListener('beforeunload', (e) => {
    if (timers.size || pending) e.preventDefault();
  });

  paint();
}
