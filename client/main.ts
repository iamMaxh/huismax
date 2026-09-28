import { $, Scope } from './lib/dom';
import { proximity } from './lib/proximity';
import { spotify } from './lib/spotify';
import { paintListening } from './lib/listening';
import { paintLive, startLivePolling } from './lib/live';
import { startRouter } from './lib/router';
import { startPalette } from './lib/palette';
import { startMenu } from './lib/menu';
import { startAudioBar, playLive } from './lib/audiobar';
import { initHome } from './pages/home';
import { initPhotographer } from './pages/photographer';
import { initDJ } from './pages/dj';
import { initTrail } from './pages/trail';
import { initCoder } from './pages/coder';
import { initMusic } from './pages/music';
import { initLab } from './pages/lab';
import { initNotFound } from './pages/notfound';

export type PageInit = (main: HTMLElement, scope: Scope, nav: (href: string) => void) => void;

const pages: Record<string, PageInit> = {
  home: initHome,
  photographer: initPhotographer,
  dj: initDJ,
  'trail-runner': initTrail,
  'vibe-coder': initCoder,
  music: initMusic,
  lab: initLab,
  'not-found': initNotFound,
};

let scope = new Scope();

function mount(main: HTMLElement) {
  scope = new Scope();
  paintLive(main);
  // Staggered entrance for anything marked [data-reveal] or list rows, via CSS.
  main.classList.add('is-entering');
  requestAnimationFrame(() => requestAnimationFrame(() => main.classList.remove('is-entering')));
  proximity(main, scope);
  scope.add(spotify.subscribe((n) => paintListening(main, n)) as () => void);
  pages[main.dataset.page ?? '']?.(main, scope, router.navigate);
}

const router = startRouter({
  beforeSwap: () => scope.dispose(),
  afterSwap: mount,
});

startPalette(router.navigate);
startMenu(router.navigate);
startAudioBar();
startLivePolling();

// Any [data-listen-live] button on any page starts the live stream in the global player.
document.addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('[data-listen-live]')) playLive();
});

mount($('main')!);
