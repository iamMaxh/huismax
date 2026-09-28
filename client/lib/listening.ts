import { $$ } from './dom';
import { ago, fmtTime, spotify, type Now } from './spotify';

const stateText = (n: Now) =>
  n.state === 'playing' ? 'now playing' : n.state === 'paused' ? 'paused' : n.track?.playedAt ? `last played · ${ago(n.track.playedAt)}` : 'last played';

function setArt(img: HTMLImageElement, src: string | null) {
  if (!src) return void (img.hidden = true);
  if (img.getAttribute('src') === src) return;
  img.hidden = true;
  img.onload = () => (img.hidden = false);
  img.onerror = () => (img.hidden = true);
  img.src = src;
}

/** Paints every Spotify "listening" slot in `root`. Missing data leaves slots hidden or as "—". */
export function paintListening(root: ParentNode, n: Now) {
  const t = n.track;
  for (const a of $$<HTMLAnchorElement>('[data-listening]', root)) {
    // First poll still on its way: a slot the server reserved stays as a placeholder, the rest stay hidden.
    if (n.state === 'loading') continue;
    a.hidden = !t;
    a.dataset.state = n.state;
    if (!t) continue;
    t.url ? (a.href = t.url) : a.removeAttribute('href');
    a.setAttribute('aria-label', `${stateText(n)}: ${t.name} by ${t.artists}`);
    const track = a.querySelector('[data-listening-track]') ?? a.querySelector('[data-listening-name]');
    const text = track?.hasAttribute('data-listening-track') ? `♪ ${t.name} — ${t.artists}` : t.name;
    if (track && track.textContent !== text) {
      track.textContent = text;
      track.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
    }
    a.querySelector('[data-listening-state]')!.textContent = stateText(n);
    const progress = a.querySelector<HTMLElement>('[data-listening-progress]');
    if (progress) {
      progress.hidden = !((n.state === 'playing' || n.state === 'paused') && t.durationMs > 0);
      progress.querySelector('[data-listening-dur]')!.textContent = fmtTime(t.durationMs);
    }
  }
  for (const el of $$('[data-listening-fallback]', root)) {
    el.hidden = !!t;
    el.textContent = n.state === 'loading' ? '…' : 'quiet right now';
  }
  for (const img of $$<HTMLImageElement>('[data-listening-art]', root)) setArt(img, (img.dataset.listeningArt === 'large' ? t?.artwork : t?.thumb) ?? t?.thumb ?? null);
  for (const el of $$('[data-listening-name]', root)) el.textContent = t?.name ?? '—';
  for (const el of $$('[data-listening-artist]', root)) el.textContent = t?.artists ?? (n.state === 'loading' ? '' : 'spotify is quiet');
  for (const el of $$('[data-listening-label]', root)) el.textContent = t ? stateText(n) : 'listening';
}

/** Moves the progress bars in `root` along between polls (the time is extrapolated locally). */
export function tickListening(root: ParentNode) {
  const t = spotify.get().track;
  if (!t?.durationMs) return;
  const p = spotify.progress();
  for (const el of $$('[data-listening-progress]', root)) {
    if (el.hidden) continue;
    (el.querySelector('[data-listening-fill]') as HTMLElement).style.transform = `scaleX(${Math.min(1, p / t.durationMs)})`;
    el.querySelector('[data-listening-cur]')!.textContent = fmtTime(p);
  }
}
