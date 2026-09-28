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
    $('[data-preview-sub]', main)!.textContent = live.isLive ? 'huismax dj channel' : listeningLine;
    for (const c of chips) c.setAttribute('aria-checked', String(c.dataset.preset === presence.status));
    liveSwitch.setAttribute('aria-checked', String(live.isLive));
    liveLabel.textContent = live.isLive ? '● LIVE' : '○ not live';
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

  /* ——— spotify: preview what the site shows ——— */
  let listeningLine = '';
  const loadSpotify = async () => {
    try {
      const d = await fetch('/api/spotify/now', { cache: 'no-store' }).then((r) => r.json());
      const box = $('[data-spotify-now]', main)!;
      if (d.track) {
        listeningLine = `♪ ${d.track.name} — ${d.track.artists}`;
        box.hidden = false;
        const art = $<HTMLImageElement>('[data-spotify-art]', main)!;
        if (d.track.thumb) art.src = d.track.thumb;
        art.hidden = !d.track.thumb;
        $('[data-spotify-track]', main)!.textContent = `${d.track.name} — ${d.track.artists}`;
        $('[data-spotify-meta]', main)!.textContent = d.state === 'playing' ? 'now playing' : d.state === 'paused' ? 'paused' : 'last played';
      } else {
        listeningLine = '';
        box.hidden = true;
      }
      paint();
    } catch {
      /* leave preview as is */
    }
  };
  loadSpotify();
  const spotifyTimer = setInterval(loadSpotify, 20_000);
  scope.add(() => clearInterval(spotifyTimer));
  const disconnectBtn = $('[data-spotify-disconnect]', main);
  if (disconnectBtn)
    scope.on(disconnectBtn, 'click', async () => {
      if (!confirm('disconnect spotify?')) return;
      await post('/api/spotify/disconnect', {});
      location.href = '/admin';
    });

  /* ——— dj archive ——— */
  type Mix = { id: string; no: number; title: string; date: string };
  const mixList = $('[data-mix-list]', main)!;
  const renderMixes = (mixes: Mix[]) => {
    mixList.replaceChildren(
      ...[...mixes].reverse().map((m) => {
        const li = document.createElement('li');
        li.dataset.mix = m.id;
        li.innerHTML = '<span class="dim"></span><span></span><span class="dim"></span><button type="button" class="btn-line">remove</button>';
        li.children[0].textContent = String(m.no).padStart(3, '0');
        li.children[1].textContent = m.title;
        li.children[2].textContent = m.date;
        (li.children[3] as HTMLElement).dataset.mixRemove = m.id;
        return li;
      }),
    );
  };
  const mixForm = $<HTMLFormElement>('[data-mix-form]', main)!;
  scope.on(mixForm, 'submit', async (e: SubmitEvent) => {
    e.preventDefault();
    const list = await post('/api/admin/mixes', Object.fromEntries(new FormData(mixForm)));
    if (list) {
      renderMixes(list);
      mixForm.reset();
    }
  });
  scope.on(mixList, 'click', async (e: MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-mix-remove]')?.dataset.mixRemove;
    if (!id || !confirm('remove this mix from the archive?')) return;
    flag('saving…');
    const res = await fetch(`/api/admin/mixes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      renderMixes(await res.json());
      flag('saved', 'ok');
    } else flag('could not remove', 'err');
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
