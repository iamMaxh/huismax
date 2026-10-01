import { $, $$, clock, cssVar, fitCanvas, readJSON, reducedMotion } from '../lib/dom';
import { live, poll as pollLive, type LiveStatus } from '../lib/live';
import { player } from '../lib/player';
import { readSpectrum } from '../lib/viz';
import type { PageInit } from '../main';
import { initRequests } from './dj-requests';
import { consoleLyrics } from './dj-lyrics';

type Mix = { id: string; no: string; title: string; audioUrl: string };

export const initDJ: PageInit = (main, scope) => {
  initRequests(main, scope);
  consoleLyrics(main, scope);
  const mixes = readJSON<Mix[]>('mix-data', main) ?? [];
  const title = $('[data-dj-title]', main)!;
  const clockEl = $('[data-dj-clock]', main)!;
  const kicker = $('[data-dj-kicker]', main)!;
  const latestBtn = $<HTMLButtonElement>('.console-latest', main);
  // the session the console offers (newest playable one, chosen on the server), else the newest one
  const latest = mixes.find((m) => m.id === latestBtn?.dataset.playMix) ?? mixes[0];
  const canvas = $<HTMLCanvasElement>('[data-dj-viz]', main)!;
  const liveLabel = $('.console-live [data-listen-label]', main);
  const listenersCell = $('[data-dj-listeners-cell]', main)!;
  const listenersEl = $('[data-dj-listeners]', main)!;
  const volume = $('[data-dj-volume]', main)!;
  const volumeInput = $<HTMLInputElement>('[data-dj-volume-input]', volume)!;

  /* ——— the radio (/api/dj-status): listener count while on air ——— */
  let radio: { live: boolean; listeners: number } | null = null;
  let radioWas = live.get().isLive;
  const paintRadio = () => {
    const show = !!radio?.live && live.get().isLive;
    listenersCell.hidden = !show;
    if (show) listenersEl.textContent = String(radio!.listeners);
  };
  const pollRadio = async () => {
    try {
      const res = await fetch('/api/dj-status', { cache: 'no-store' });
      if (!res.ok) return;
      radio = (await res.json()) as { live: boolean; listeners: number };
    } catch {
      return; // offline: keep the last count
    }
    // the channel's LIVE (radio or set by hand) comes from the site-wide poll; when the radio just went on or off air,
    // fetch it now instead of up to 15 s later
    if (radio.live !== radioWas) pollLive();
    radioWas = radio.live;
    paintRadio();
  };
  pollRadio();
  let radioTimer = setInterval(pollRadio, 15_000);
  scope.on(document, 'visibilitychange', () => {
    clearInterval(radioTimer);
    if (document.visibilityState !== 'visible') return;
    pollRadio();
    radioTimer = setInterval(pollRadio, 15_000);
  });
  scope.add(() => clearInterval(radioTimer));

  /* ——— listen live (play / pause / resume) and volume follow the global player ——— */
  const paintControls = () => {
    const ps = player.state();
    const mine = ps.source?.kind === 'live';
    if (liveLabel) {
      liveLabel.textContent = !mine ? 'listen live' : ps.status === 'playing' ? 'pause' : ps.status === 'loading' ? 'loading' : ps.status === 'paused' ? 'resume' : 'listen live';
      liveLabel.parentElement!.setAttribute('aria-pressed', String(mine && ps.status === 'playing'));
    }
    // nothing to hear, or a browser that ignores a page's volume (iOS, unless the stream runs through Web Audio): no slider
    volume.hidden = !(live.get().isLive || ps.source) || !player.volumeWorks();
    if (document.activeElement !== volumeInput) volumeInput.value = String(Math.round(ps.volume * 100));
    volumeInput.style.setProperty('--v', volumeInput.value);
  };
  scope.on(volumeInput, 'input', () => player.setVolume(Number(volumeInput.value) / 100));

  /* ——— live state ——— */
  let startedAt: number | null = null;
  const paint = (s: LiveStatus) => {
    title.textContent = s.isLive ? s.sessionTitle ?? 'live' : latest ? latest.title : 'first transmission soon';
    kicker.textContent = s.isLive ? 'now playing' : latest ? `latest · ${latest.no}` : 'archive';
    if (latestBtn) latestBtn.hidden = s.isLive;
    startedAt = s.isLive && s.startedAt ? Date.parse(s.startedAt) : null;
    tickClock();
    paintRadio();
    paintControls();
  };
  const tickClock = () => {
    if (!startedAt) return void (clockEl.textContent = '--:--:--');
    const sec = (Date.now() - startedAt) / 1000;
    const h = Math.floor(sec / 3600);
    clockEl.textContent = (h ? '' : '0:') + clock(sec).padStart(h ? 7 : 5, '0');
  };
  scope.add(live.subscribe(paint) as () => void);
  const clockId = setInterval(tickClock, 1000);
  scope.add(() => clearInterval(clockId));

  /* ——— reflect the global player in the console ——— */
  scope.add(
    player.subscribe((ps) => {
      main.dataset.playing = String(ps.status === 'playing');
      paintControls();
      for (const b of $$<HTMLButtonElement>('[data-play-mix]', main)) {
        const mine = ps.source?.id === b.dataset.playMix;
        const playing = mine && ps.status === 'playing';
        if (b.classList.contains('mix-play')) {
          b.textContent = playing ? '❚❚' : '▶';
          // the label is what a screen reader says; buttons without audio keep their "no audio yet"
          const m = mixes.find((x) => x.id === b.dataset.playMix);
          if (m?.audioUrl) b.setAttribute('aria-label', `${playing ? 'pause' : 'play'} ${m.title}`);
        } else $('[data-latest-label]', b)!.textContent = playing ? 'pause' : mine && ps.status !== 'error' ? 'resume' : 'play';
      }
      if (ps.message && ps.source?.kind === 'live') title.textContent = ps.message;
    }) as () => void,
  );

  scope.on(main, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-play-mix]');
    if (!b) return;
    const mix = mixes.find((m) => m.id === b.dataset.playMix);
    if (!mix?.audioUrl) return;
    const ps = player.state();
    // after an error, pressing again reloads the mix instead of toggling the failed one
    if (ps.source?.id === mix.id && ps.status !== 'error') player.toggle();
    else player.play({ kind: 'mix', id: mix.id, title: `${mix.no} — ${mix.title}`, url: mix.audioUrl });
  });

  /* ——— static mini waveforms per mix, seeded by id ——— */
  for (const el of $$('[data-wave]', main)) {
    let h = 0;
    for (const ch of el.dataset.wave!) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const bars = Array.from({ length: 40 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      const env = Math.sin((i / 39) * Math.PI) * 0.6 + 0.4;
      return `<i style="--h:${(((h >>> 8) % 100) / 100 * env * 0.9 + 0.1).toFixed(2)}"></i>`;
    });
    el.innerHTML = bars.join('');
  }

  /* ——— main spectrum ——— */
  const { ctx, size } = fitCanvas(canvas, scope);
  const data = new Uint8Array(96);
  const peaks = new Float32Array(96);
  let fg = cssVar('--fg');
  let red = cssVar('--live');
  scope.on(window, 'themechange', () => ((fg = cssVar('--fg')), (red = cssVar('--live'))));

  const draw = (t: number) => {
    const s = live.get();
    const playing = player.state().status === 'playing';
    readSpectrum(data, t, playing ? 1 : 0);
    const { w, h } = size;
    ctx.clearRect(0, 0, w, h);
    const n = data.length, bw = w / n;
    // baseline
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = fg;
    ctx.fillRect(0, h / 2, w, 1);
    for (let i = 0; i < n; i++) {
      const v = data[i] / 255;
      peaks[i] = Math.max(v, peaks[i] - 0.006);
      const bh = Math.max(1, v * h * 0.45);
      const x = i * bw;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = fg;
      ctx.fillRect(x, h / 2 - bh, Math.max(1, bw - 3), bh * 2);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = s.isLive ? red : fg;
      ctx.fillRect(x, h / 2 - peaks[i] * h * 0.45 - 3, Math.max(1, bw - 3), 1);
    }
    ctx.globalAlpha = 1;
  };
  if (reducedMotion()) draw(0);
  else scope.loop(draw);
};
