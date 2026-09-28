import { $, $$, reducedMotion } from '../lib/dom';
import type { PageInit } from '../main';

/** Album sorting with a FLIP animation so rows glide to their new place. */
export const initMusic: PageInit = (main, scope) => {
  const seg = $('[data-album-sort]', main)!;
  const list = $('[data-albums]', main)!;

  scope.on(seg, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-sort]');
    if (!b) return;
    $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const items = $$('li', list);
    const before = new Map(items.map((li) => [li, li.getBoundingClientRect().top]));
    const by = b.dataset.sort!;
    items
      .sort((a, c) =>
        by === 'year' ? Number(c.dataset.year) - Number(a.dataset.year)
        : by === 'title' ? a.dataset.title!.localeCompare(c.dataset.title!)
        : Number(a.dataset.pick) - Number(c.dataset.pick),
      )
      .forEach((li) => list.append(li));
    if (reducedMotion()) return;
    for (const li of items) {
      const dy = before.get(li)! - li.getBoundingClientRect().top;
      if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  });
};
