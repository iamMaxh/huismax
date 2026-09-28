import { $, $$, reducedMotion, withTransition } from './dom';

/**
 * Tiny same-origin router: fetches the next page, swaps <main>, and keeps everything
 * outside it (header, audio bar) alive. Falls back to full loads on any failure.
 */
type Hooks = { beforeSwap: () => void; afterSwap: (main: HTMLElement) => void };

const cache = new Map<string, { at: number; html: Promise<string> }>();
const TTL = 30_000;
let controller: AbortController | null = null;

const key = (u: URL) => u.pathname + u.search;

function fetchPage(url: URL, signal?: AbortSignal) {
  const k = key(url);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.html;
  const html = fetch(url, { signal, headers: { 'X-Router': '1' } }).then((r) => {
    if (!r.ok && r.status !== 404) throw new Error(String(r.status));
    return r.text();
  });
  cache.set(k, { at: Date.now(), html });
  html.catch(() => cache.delete(k));
  return html;
}

function internal(a: HTMLAnchorElement, e?: MouseEvent) {
  if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download') || a.dataset.noRouter !== undefined) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return null;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return url;
}

export function startRouter(hooks: Hooks) {
  history.scrollRestoration = 'manual';
  history.replaceState({ ...history.state, y: scrollY }, '');

  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a');
    const url = a && internal(a, e);
    if (!url) return;
    e.preventDefault();
    navigate(url.href);
  });

  // Prefetch on intent: pointer hover or keyboard focus.
  const warm = (e: Event) => {
    const a = (e.target as Element).closest?.('a');
    const url = a && internal(a);
    if (url && key(url) !== key(new URL(location.href))) fetchPage(url).catch(() => {});
  };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('focusin', warm);

  addEventListener('popstate', (e) => navigate(location.href, { push: false, y: e.state?.y ?? 0 }));

  async function navigate(href: string, opts: { push?: boolean; y?: number } = {}) {
    const url = new URL(href, location.href);
    const push = opts.push ?? true;
    if (push && key(url) === key(new URL(location.href))) {
      scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    controller?.abort();
    controller = new AbortController();
    document.documentElement.dataset.loading = '';

    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(await fetchPage(url, controller.signal), 'text/html');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') location.href = url.href;
      return;
    } finally {
      delete document.documentElement.dataset.loading;
    }
    const next = $('main', doc);
    if (!next) return void (location.href = url.href);

    if (push) {
      history.replaceState({ ...history.state, y: scrollY }, '');
      history.pushState({ y: 0 }, '', url.href);
    }

    const swap = () => {
      hooks.beforeSwap();
      const main = $('main')!;
      main.replaceWith(next);
      document.title = doc.title;
      document.body.dataset.page = next.dataset.page ?? '';
      for (const a of $$<HTMLAnchorElement>('[data-nav]')) {
        if (a.dataset.nav === next.dataset.page) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      if (url.hash) $(url.hash)?.scrollIntoView();
      else scrollTo(0, opts.y ?? 0);
      hooks.afterSwap(next);
      next.focus({ preventScroll: true });
      const announcer = $('[data-route-announcer]');
      if (announcer) announcer.textContent = doc.title;
    };

    withTransition(swap);
  }

  return { navigate };
}
