import { $, clock, cssVar, fitCanvas, reducedMotion, Scope } from './dom';
import { live } from './live';
import { player, type PlayerState } from './player';
import { readSpectrum } from './viz';
import { spotify } from './spotify';
import { paintListening } from './listening';
import { paletteLinks } from './nav';

/** Every "listen live" button: starts the stream, then pauses and resumes it (at the live edge) instead of restarting. */
export const playLive = () => {
  const s = live.get();
  const ps = player.state();
  const mine = ps.source?.kind === 'live' && ps.status !== 'error';
  if (mine && (ps.status === 'playing' || ps.status === 'loading')) return player.toggle();
  // the session ended while paused: nothing to resume
  if (!s.isLive) return mine ? player.stop() : undefined;
  if (mine) return player.toggle();
  player.play({ kind: 'live', id: 'live', title: s.sessionTitle ?? 'huismax dj channel', url: s.streamUrl });
};

/** Binds the persistent bottom bar to player + live state. */
export function startAudioBar(navigate: (href: string) => void) {
  const bar = $('[data-audiobar]');
  if (!bar) return;
  const title = $('[data-player-title]', bar)!;
  const btn = $<HTMLButtonElement>('[data-player-toggle]', bar)!;
  const btnLabel = $('[data-player-btn-label]', bar)!;
  const progress = $('[data-player-progress]', bar)!;
  const fill = $('[data-player-fill]', bar)!;
  const time = $('[data-player-time]', bar)!;
  const canvas = $<HTMLCanvasElement>('[data-player-viz]', bar)!;

  const paint = (ps: PlayerState = player.state()) => {
    const ls = live.get();
    const hasSource = !!ps.source;
    bar.dataset.state = hasSource ? ps.status : ls.isLive ? 'live' : 'idle';
    title.textContent = ps.message ?? ps.source?.title ?? (ls.isLive ? ls.sessionTitle ?? '' : '');
    btnLabel.textContent = ps.status === 'playing' ? 'pause' : ps.status === 'loading' ? 'loading' : hasSource && ps.status === 'paused' ? 'resume' : 'listen';
    btn.setAttribute('aria-pressed', String(ps.status === 'playing'));
    btn.hidden = !hasSource && !ls.isLive;
    const isMix = ps.source?.kind === 'mix' && ps.duration > 0;
    progress.hidden = !isMix;
    if (isMix) {
      fill.style.transform = `scaleX(${ps.time / ps.duration})`;
      time.textContent = `${clock(ps.time)} / ${clock(ps.duration)}`;
    }
  };

  player.subscribe(paint);
  spotify.subscribe((n) => paintListening(bar, n));
  live.subscribe(() => paint());

  btn.addEventListener('click', () => {
    const ps = player.state();
    if (ps.source && ps.source.kind !== 'live' && ps.status !== 'error') return player.toggle();
    // "listen" (nothing playing yet), not pause or resume
    const starting = !ps.source || ps.status === 'error';
    playLive();
    // from the homepage the live set plays over the music page, where what's on shows with its album art
    // (elsewhere, /dj included, it plays where you are; never to a hidden page)
    if (starting && live.get().isLive && location.pathname === '/' && paletteLinks().some((p) => p.href === '/music')) navigate('/music');
  });
  progress.addEventListener('click', (e) => {
    const r = progress.querySelector('.bar')!.getBoundingClientRect();
    player.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  });
  // Space toggles playback when nothing interactive has focus.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, button, a, [tabindex], dialog')) return;
    const ps = player.state();
    if (!ps.source) return;
    e.preventDefault();
    if (ps.source.kind === 'live') playLive();
    else player.toggle();
  });

  // Mini visualizer.
  const scope = new Scope();
  const { ctx, size } = fitCanvas(canvas, scope);
  const data = new Uint8Array(24);
  let color = cssVar('--fg');
  addEventListener('themechange', () => (color = cssVar('--fg')));
  const draw = (t: number) => {
    ctx.clearRect(0, 0, size.w, size.h);
    const ps = player.state();
    const energy = ps.status === 'playing' ? 1 : live.get().isLive ? 0.35 : 0.06;
    readSpectrum(data, t, energy);
    ctx.globalAlpha = 0.9;
    const n = data.length, bw = size.w / n;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const h = Math.max(1, (data[i] / 255) * size.h);
      ctx.fillRect(i * bw, (size.h - h) / 2, Math.max(1, bw - 2), h);
    }
  };
  if (reducedMotion()) draw(0);
  else scope.loop((t) => draw(t));
}
