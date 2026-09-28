import { $, $$ } from './dom';
import { toggleTheme } from './theme';
import { menuLinks, randomPage } from './nav';

const title = (label: string) => (label === 'dj' ? 'DJ' : label[0].toUpperCase() + label.slice(1));

/** The site's main menu: a plain full-screen overlay. (⌘K / "/" still opens the hidden palette.) */
export function startMenu(navigate: (href: string) => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'menu';
  dialog.setAttribute('aria-label', 'menu');
  dialog.innerHTML = `
    <div class="menu-top">
      <span class="wordmark">huismax</span>
      <button type="button" class="menu-btn" data-menu-close>close</button>
    </div>
    <nav class="menu-primary" aria-label="menu"></nav>
    <div class="menu-secondary mono">
      <button type="button" data-menu-act="theme">switch theme</button>
      <button type="button" data-menu-act="random">random</button>
      <button type="button" data-menu-act="copy">copy link</button>
    </div>`;
  const primary = $('.menu-primary', dialog)!;
  menuLinks().forEach(({ href, label }, i) => {
    const a = document.createElement('a');
    a.href = href;
    a.dataset.menuLink = '';
    a.innerHTML = '<span class="menu-idx mono"></span><span class="menu-label"></span>';
    a.children[0].textContent = String(i + 1).padStart(2, '0');
    a.children[1].textContent = title(label);
    primary.append(a);
  });
  document.body.append(dialog);

  const open = () => {
    if (dialog.open) return;
    for (const a of $$<HTMLAnchorElement>('[data-menu-link]', dialog)) {
      const here = new URL(a.href).pathname === location.pathname;
      here ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    }
    dialog.showModal();
    document.documentElement.classList.add('menu-open');
    ($<HTMLElement>('[aria-current]', dialog) ?? $<HTMLElement>('[data-menu-link]', dialog))?.focus();
  };
  const close = () => dialog.open && dialog.close();
  dialog.addEventListener('close', () => document.documentElement.classList.remove('menu-open'));

  dialog.addEventListener('click', async (e) => {
    const t = e.target as Element;
    if (t.closest('[data-menu-close]')) return close();
    const link = t.closest<HTMLAnchorElement>('[data-menu-link]');
    if (link) {
      e.preventDefault();
      close();
      return navigate(link.href);
    }
    const act = t.closest<HTMLElement>('[data-menu-act]')?.dataset.menuAct;
    if (act === 'theme') toggleTheme();
    if (act === 'random') {
      close();
      navigate(randomPage());
    }
    if (act === 'copy') {
      const btn = t.closest<HTMLElement>('[data-menu-act]')!;
      try {
        await navigator.clipboard.writeText(location.href);
        btn.textContent = 'copied';
      } catch {
        btn.textContent = 'could not copy';
      }
      setTimeout(() => (btn.textContent = 'copy link'), 1400);
    }
  });

  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('[data-menu-open]')) open();
  });
  return { open, close };
}
