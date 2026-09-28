import { $, $$ } from '../lib/dom';

/**
 * Section switching by hash (#home, #dj…). One section shows at a time; the last one is remembered.
 * The inline boot script in the page already showed the right one before this runs.
 */
const KEY = 'admin:section';

export function initNav() {
  const sections = $$('[data-section]');
  const keys = sections.map((s) => s.dataset.section!);
  const remembered = () => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  };

  const show = (key: string, focus = false) => {
    if (!keys.includes(key)) key = keys[0];
    for (const s of sections) s.classList.toggle('is-active', s.dataset.section === key);
    for (const a of $$('[data-nav]')) {
      if (a.dataset.nav === key) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    try {
      localStorage.setItem(KEY, key);
    } catch {
      /* private mode: just don't remember */
    }
    $(`[data-nav="${key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) {
      scrollTo({ top: 0 });
      $<HTMLElement>(`#h-${key}`)?.focus({ preventScroll: true });
    }
  };

  // returning from Spotify lands on status, where its notice is
  const start = location.hash.slice(1) || (/[?&]spotify=/.test(location.search) ? 'status' : remembered()) || keys[0];
  show(start);
  if (location.hash.slice(1) !== start) history.replaceState(null, '', `${location.pathname}${location.search}#${keys.includes(start) ? start : keys[0]}`);
  addEventListener('hashchange', () => show(location.hash.slice(1), true));
}
