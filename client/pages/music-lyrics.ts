import { $, reducedMotion, type Scope } from '../lib/dom';
import { fmtStamp, lyrics, type Line, type LyricsState, type Status } from '../lib/lyrics';

const NOTES: Record<Status, string> = {
  off: '',
  loading: 'looking',
  synced: 'synced',
  plain: 'not synced',
  instrumental: 'instrumental',
  none: 'none found',
  error: 'unavailable right now',
};
const OPEN = 'lyrics-open';

/**
 * /music: the lyrics under the song, as a log. Every line has its time, the one being sung carries the cursor and
 * stays second from the top of a four-line window; "all lines" opens the whole song (remembered on this device),
 * where scrolling yourself pauses the following for a few seconds. Unsynced lyrics are plain text, nothing moves.
 */
export function musicLyrics(np: HTMLElement, scope: Scope) {
  const box = $('[data-lyrics]', np);
  if (!box) return;
  const note = $('[data-lyrics-note]', box)!;
  const src = $('[data-lyrics-src]', box)!;
  const toggle = $<HTMLButtonElement>('[data-lyrics-toggle]', box)!;
  const view = $('[data-lyrics-view]', box)!;
  const list = $('[data-lyrics-lines]', box)!;
  let rows: HTMLLIElement[] = [];
  let shown: Line[] | null = null;
  let now = -1;
  /** until then, the reader's own scrolling wins over following the song */
  let hold = 0;
  let open = false;
  try {
    open = localStorage.getItem(OPEN) === '1';
  } catch {
    /* private mode: closed */
  }

  const follow = (instant = false) => {
    if (view.hidden || (open && Date.now() < hold)) return;
    const cur = rows[Math.max(0, now)];
    if (!cur) return;
    const prev = now > 0 ? rows[now - 1] : null;
    // closed: the line before stays in sight above it; open: about a third of the way down
    const top = open ? cur.offsetTop - view.clientHeight * 0.32 : cur.offsetTop - (prev ? prev.offsetHeight + 6 : 0);
    view.scrollTo({ top: Math.max(0, top), behavior: instant || reducedMotion() ? 'auto' : 'smooth' });
  };

  const setOpen = (on: boolean) => {
    open = on;
    box.classList.toggle('is-open', on);
    toggle.setAttribute('aria-expanded', String(on));
    toggle.textContent = on ? 'fewer lines' : 'all lines';
    hold = 0;
    follow(true);
  };

  const render = (s: LyricsState) => {
    box.hidden = s.status === 'off';
    box.dataset.state = s.status;
    box.toggleAttribute('data-paused', s.paused);
    const words = s.status === 'synced' || s.status === 'plain';
    // on air the lines follow the stream, a few seconds behind the progress bar above: say so
    const synced = s.status === 'synced' && s.onAir && !s.paused ? 'synced to the live stream' : NOTES[s.status];
    note.textContent = synced + (words && s.paused ? ' · paused' : '');
    view.hidden = toggle.hidden = src.hidden = !words;
    if (s.lines === shown) return;
    shown = s.lines;
    rows = s.lines.map((l) => {
      const li = document.createElement('li');
      li.className = l.text ? 'lyr' : l.t < 0 ? 'lyr is-gap' : 'lyr is-break';
      if (l.t >= 0) li.append(Object.assign(document.createElement('span'), { className: 'lyr-t', textContent: fmtStamp(l.t) }));
      li.append(Object.assign(document.createElement('span'), { className: 'lyr-x', textContent: l.text || (l.t < 0 ? '' : '♪') }));
      return li;
    });
    list.replaceChildren(...rows);
    now = -1;
    hold = 0;
    view.scrollTop = 0;
  };

  const highlight = (i: number) => {
    if (i === now && rows[i]?.classList.contains('is-now')) return;
    rows[now]?.classList.remove('is-now');
    rows[now]?.removeAttribute('aria-current');
    rows.forEach((r, k) => r.classList.toggle('is-past', k < i));
    rows[i]?.classList.add('is-now');
    rows[i]?.setAttribute('aria-current', 'true');
    now = i;
    follow();
  };

  setOpen(open);
  scope.on(toggle, 'click', () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN, open ? '1' : '0');
    } catch {
      /* not remembered */
    }
  });
  // reading ahead (or back) in the open view: leave it there for a moment
  const grab = () => open && (hold = Date.now() + 5000);
  for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown']) scope.on(view, type, grab, { passive: true });
  scope.on(window, 'resize', () => follow(true));
  scope.add(lyrics.subscribe(render));
  scope.add(lyrics.onLine(highlight));
}
