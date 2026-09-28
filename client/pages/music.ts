import { $ } from '../lib/dom';
import { ago, fmtTime, spotify, type Now, type Track } from '../lib/spotify';
import type { PageInit } from '../main';

const labels: Record<Now['state'], string> = {
  playing: 'now playing',
  paused: 'paused',
  recent: 'last played',
  idle: 'last played',
  loading: 'loading',
  unconfigured: 'spotify',
  disconnected: 'spotify',
  error: 'spotify',
};
const empties: Partial<Record<Now['state'], string>> = {
  idle: 'nothing played lately.',
  unconfigured: 'not connected yet.',
  disconnected: 'not connected yet.',
  error: 'spotify is not answering. try again in a bit.',
};

export const initMusic: PageInit = (main, scope) => {
  const np = $('[data-np]', main)!;
  const art = $<HTMLImageElement>('[data-np-art]', np)!;
  const artLink = $<HTMLAnchorElement>('[data-np-art-link]', np)!;
  const link = $<HTMLAnchorElement>('[data-np-link]', np)!;
  const progress = $('[data-np-progress]', np)!;
  const fill = $('[data-np-fill]', np)!;
  const cur = $('[data-np-cur]', np)!;
  const empty = $('[data-np-empty]', np)!;

  const paint = (n: Now) => {
    np.dataset.state = n.state;
    $('[data-np-label-text]', np)!.textContent = labels[n.state];
    const t = n.track;
    empty.hidden = !!t || n.state === 'loading';
    empty.textContent = empties[n.state] ?? '';
    link.textContent = t?.name ?? '';
    for (const a of [link, artLink]) t?.url ? (a.href = t.url) : a.removeAttribute('href');
    $('[data-np-artist]', np)!.textContent = t?.artists ?? '';
    $('[data-np-album]', np)!.textContent = t ? [t.album, n.state === 'recent' ? ago(t.playedAt) : ''].filter(Boolean).join(' · ') : '';
    if (t?.artwork && art.getAttribute('src') !== t.artwork) {
      art.hidden = true;
      art.onload = () => (art.hidden = false);
      art.onerror = () => (art.hidden = true);
      art.src = t.artwork;
      art.alt = `${t.album} cover`;
    } else if (!t?.artwork) art.hidden = true;
    progress.hidden = !t || n.state === 'recent' || n.state === 'idle';
    $('[data-np-dur]', np)!.textContent = t ? fmtTime(t.durationMs) : '0:00';
    tick();
  };

  // progress bar advances locally between polls
  const tick = () => {
    const t = spotify.get().track;
    if (!t || progress.hidden) return;
    const p = spotify.progress();
    fill.style.transform = `scaleX(${t.durationMs ? p / t.durationMs : 0})`;
    cur.textContent = fmtTime(p);
  };
  const id = setInterval(tick, 500);
  scope.add(() => clearInterval(id));
  scope.add(spotify.subscribe(paint) as () => void);

  /* ——— lists ——— */
  const row = (t: Track, meta: string) => {
    const li = document.createElement('li');
    const a = document.createElement(t.url ? 'a' : 'div');
    a.className = 'track';
    if (t.url) Object.assign(a as HTMLAnchorElement, { href: t.url, target: '_blank', rel: 'noopener' });
    a.innerHTML = '<span class="track-art"></span><span class="track-name"></span><span class="track-artist dim"></span><span class="track-meta mono dim"></span>';
    if (t.thumb) {
      const img = new Image();
      img.src = t.thumb;
      img.alt = '';
      img.loading = 'lazy';
      a.children[0].append(img);
    }
    a.children[1].textContent = t.name;
    a.children[2].textContent = t.artists;
    a.children[3].textContent = meta;
    li.append(a);
    return li;
  };
  const fill_ = (list: HTMLElement, items: Track[], meta: (t: Track, i: number) => string, emptyText: string) => {
    list.replaceChildren(...(items.length ? items.map((t, i) => row(t, meta(t, i))) : [Object.assign(document.createElement('li'), { className: 'tracks-empty mono dim', textContent: emptyText })]));
  };

  const recentList = $('[data-recent]', main)!;
  const repeatList = $('[data-repeat]', main)!;
  fetch('/api/spotify/recent')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d: { state: string; recent: Track[]; onRepeat: Track[] }) => {
      const msg = d.state === 'ok' ? 'nothing yet.' : 'not available right now.';
      fill_(recentList, d.recent, (t) => ago(t.playedAt), msg);
      fill_(repeatList, d.onRepeat, (_, i) => String(i + 1).padStart(2, '0'), msg);
    })
    .catch(() => {
      fill_(recentList, [], () => '', 'not available right now.');
      fill_(repeatList, [], () => '', 'not available right now.');
    });
};
