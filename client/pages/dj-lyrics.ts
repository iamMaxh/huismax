import { $, reducedMotion, type Scope } from '../lib/dom';
import { live } from '../lib/live';
import { lyrics, type Line } from '../lib/lyrics';

/**
 * /dj while on air: the song's lyrics as subtitles over the spectrum, in time with the stream (client/lib/lyrics.ts
 * runs them LIVE_DELAY behind Spotify while live). The line being sung, and the next one under it. Only hooked up
 * while live, so an off-air visit doesn't ask for lyrics nobody hears.
 */
export function consoleLyrics(main: HTMLElement, scope: Scope) {
  const box = $('[data-console-lyrics]', main);
  if (!box) return;
  const now = $('[data-console-lyrics-now]', box)!;
  const next = $('[data-console-lyrics-next]', box)!;
  let lines: Line[] = [];

  const attach = () => {
    const offState = lyrics.subscribe((s) => {
      lines = s.status === 'synced' && s.onAir && !s.paused ? s.lines : [];
      if (!lines.length) box.hidden = true;
    });
    const offLine = lyrics.onLine((i) => {
      const l = lines[i];
      box.hidden = !l;
      if (!l) return;
      box.classList.toggle('is-break', !l.text);
      next.textContent = lines.slice(i + 1).find((x) => x.text)?.text ?? '';
      const words = l.text || '♪';
      if (now.textContent === words) return;
      now.textContent = words;
      if (!reducedMotion()) now.animate?.([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' });
    });
    return () => (offState(), offLine());
  };

  let detach: (() => void) | null = null;
  scope.add(
    live.subscribe((s) => {
      if (s.isLive && !detach) detach = attach();
      else if (!s.isLive && detach) (detach(), (detach = null), (box.hidden = true));
    }) as () => void,
  );
  scope.add(() => detach?.());
}
