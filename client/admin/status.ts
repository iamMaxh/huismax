import { $, $$ } from '../lib/dom';
import { api } from './api';
import { paint as paintSave, track, watch } from './state';

/**
 * Status section: DJ channel live switch, personal status, a manual now-playing line, Spotify.
 * These save on their own (debounced while typing) through the same APIs as before the CMS.
 */

export type Live = { isLive: boolean; sessionTitle: string | null; streamUrl: string | null };
export type Presence = { status: string; listening: { title: string; artist: string } | null };

export function initStatus(main: HTMLElement, init: { live: Live; presence: Presence }) {
  const state = { live: { ...init.live }, presence: { ...init.presence } };

  const statusInput = $<HTMLInputElement>('[data-status-input]', main)!;
  const trackInput = $<HTMLInputElement>('[data-listen-title]', main)!;
  const artistInput = $<HTMLInputElement>('[data-listen-artist]', main)!;
  const liveSwitch = $<HTMLButtonElement>('[data-live-switch]', main)!;
  const liveLabel = $('[data-live-switch-label]', main)!;
  const liveTitle = $<HTMLInputElement>('[data-live-title]', main)!;
  const liveUrl = $<HTMLInputElement>('[data-live-url]', main)!;
  const livePanel = $('.live-panel', main)!;
  const chips = $$<HTMLButtonElement>('[data-preset]', main);
  let spotifyLine = '';

  /* ——— preview mirrors the homepage: live overrides status ——— */
  const paint = () => {
    const { live, presence } = state;
    const manual = presence.listening ? `♪ ${presence.listening.title}${presence.listening.artist ? ` — ${presence.listening.artist}` : ''}` : '';
    $('[data-preview]', main)!.dataset.live = live.isLive ? 'on' : 'off';
    $('[data-preview-state]', main)!.textContent = live.isLive ? '● LIVE' : presence.status || '—';
    // the homepage's breathing "doing this now" dot; LIVE has its own, and no status means no dot
    $('[data-preview-dot]', main)!.hidden = live.isLive || !presence.status;
    $('[data-preview-sub]', main)!.textContent = live.isLive ? 'huismax dj channel' : spotifyLine || manual;
    for (const c of chips) c.setAttribute('aria-checked', String(c.dataset.preset === presence.status));
    liveSwitch.setAttribute('aria-checked', String(live.isLive));
    liveLabel.textContent = live.isLive ? '● LIVE' : '○ not live';
    livePanel.dataset.live = live.isLive ? 'on' : 'off';
  };

  /* ——— saving: debounced per kind, flushed on ⌘↵ / Enter / leaving ——— */
  const post = <T,>(url: string, body: unknown) => track(api<T>('POST', url, body));
  const saved = { isLive: init.live.isLive };
  const savers = {
    // the whole presence every time, so a status save and a track save can't undo each other on the server
    presence: () => post<Presence>('/api/admin/presence', { status: state.presence.status, listening: state.presence.listening }),
    live: async () => {
      try {
        saved.isLive = (await post<Live>('/api/live-status', { isLive: state.live.isLive, sessionTitle: liveTitle.value, streamUrl: liveUrl.value })).isLive;
      } catch (e) {
        // the switch goes back to what the site shows; the header says why
        state.live.isLive = saved.isLive;
        paint();
        throw e;
      }
    },
  };
  type Key = keyof typeof savers;
  const timers = new Map<Key, number>();
  // a failed save stays "unsaved edits" (and leaving warns) until one of its kind goes through
  const failed = new Set<Key>();
  // one request at a time, each sending the latest state, so an older save can never land after a newer one
  let queue = Promise.resolve();
  const run = (key: Key) => {
    queue = queue.then(() => savers[key]().then(() => failed.delete(key), () => failed.add(key))).then(paintSave);
  };
  const later = (key: Key, ms = 650) => {
    clearTimeout(timers.get(key));
    timers.set(key, window.setTimeout(() => (timers.delete(key), run(key)), ms));
    paintSave();
  };
  const flush = () => {
    const keys = new Set([...timers.keys(), ...failed]); // failed ones get another try
    for (const id of timers.values()) clearTimeout(id);
    timers.clear();
    for (const key of keys) run(key);
  };
  watch(timers, () => timers.size > 0 || failed.size > 0);
  addEventListener('online', flush);

  // IME (pinyin): nothing counts until the word is committed. Chrome sends the last input while still composing,
  // Safari before compositionend, so both events run the handler.
  const typed = (el: HTMLInputElement, fn: () => void) => {
    const on = (e: Event) => (e as InputEvent).isComposing || fn();
    el.addEventListener('input', on);
    el.addEventListener('compositionend', on);
  };

  /* ——— status ——— */
  main.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest<HTMLButtonElement>('[data-preset]');
    if (!chip) return;
    state.presence.status = statusInput.value = chip.dataset.preset!;
    paint();
    later('presence', 0);
  });
  typed(statusInput, () => {
    state.presence.status = statusInput.value.trim();
    paint();
    later('presence');
  });
  $('[data-status-clear]', main)!.addEventListener('click', () => {
    state.presence.status = statusInput.value = '';
    paint();
    later('presence', 0);
    statusInput.focus();
  });
  // arrow keys move between presets like a radio group
  $('[data-presets]', main)!.addEventListener('keydown', (e) => {
    const i = chips.indexOf(document.activeElement as HTMLButtonElement);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (i < 0 || !d) return;
    e.preventDefault();
    chips[(i + d + chips.length) % chips.length].focus();
  });

  /* ——— manual now playing ——— */
  const onListen = () => {
    const title = trackInput.value.trim();
    state.presence.listening = title ? { title, artist: artistInput.value.trim() } : null;
    paint();
    later('presence');
  };
  typed(trackInput, onListen);
  typed(artistInput, onListen);
  $('[data-listen-clear]', main)!.addEventListener('click', () => {
    trackInput.value = artistInput.value = '';
    onListen();
    later('presence', 0);
    trackInput.focus();
  });

  /* ——— spotify: preview what the site shows ——— */
  const loadSpotify = async () => {
    try {
      const d = await fetch('/api/spotify/now', { cache: 'no-store' }).then((r) => r.json());
      const box = $('[data-spotify-now]', main)!;
      if (d.track) {
        spotifyLine = `♪ ${d.track.name} — ${d.track.artists}`;
        box.hidden = false;
        const art = $<HTMLImageElement>('[data-spotify-art]', main)!;
        if (d.track.thumb) art.src = d.track.thumb;
        art.hidden = !d.track.thumb;
        $('[data-spotify-track]', main)!.textContent = `${d.track.name} — ${d.track.artists}`;
        $('[data-spotify-meta]', main)!.textContent = d.state === 'playing' ? 'now playing' : d.state === 'paused' ? 'paused' : 'last played';
      } else {
        spotifyLine = '';
        box.hidden = true;
      }
      paint();
    } catch {
      /* leave the preview as is */
    }
  };
  loadSpotify();
  setInterval(() => document.visibilityState === 'visible' && loadSpotify(), 20_000);
  $('[data-spotify-disconnect]', main)?.addEventListener('click', async () => {
    if (!confirm('disconnect spotify?')) return;
    try {
      await track(api('POST', '/api/spotify/disconnect', {}));
      // a fresh render shows the new state; drop a stale ?spotify= notice on the way
      if (location.search) location.replace('/admin#status');
      else location.reload();
    } catch {
      /* the header shows the error */
    }
  });

  /* ——— live ——— */
  liveSwitch.addEventListener('click', () => {
    state.live.isLive = !state.live.isLive;
    paint();
    later('live', 0);
  });
  for (const input of [liveTitle, liveUrl]) typed(input, () => later('live', 900));

  paint();
  return { flush, owns: (el: Element) => !!el.closest('[data-section="status"]') };
}
