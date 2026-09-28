import { $, reducedMotion } from '../lib/dom';
import type { PageInit } from '../main';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ?#/_';

/** Title resolves out of noise, once. */
export const initNotFound: PageInit = (main, scope) => {
  const el = $('[data-scramble]', main);
  if (!el || reducedMotion()) return;
  const final = el.textContent ?? '';
  let frame = 0;
  const id = setInterval(() => {
    frame++;
    el.textContent = [...final]
      .map((ch, i) => (ch === ' ' || i < frame / 2 ? ch : CHARS[(Math.random() * CHARS.length) | 0]))
      .join('');
    if (frame / 2 > final.length) clearInterval(id);
  }, 40);
  scope.add(() => {
    clearInterval(id);
    el.textContent = final;
  });
};
