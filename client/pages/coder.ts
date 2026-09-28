import { $, $$, readJSON, reducedMotion } from '../lib/dom';
import type { PageInit } from '../main';

type Project = { name: string; preview: string[] };

export const initCoder: PageInit = (main, scope) => {
  const projects = readJSON<Project[]>('project-data', main) ?? [];
  const list = $('[data-projects]', main);
  if (!list) return; // no public projects
  const preview = $('[data-project-preview]', main)!;
  const ppName = $('[data-pp-name]', preview)!;
  const ppBody = $('[data-pp-body]', preview)!;
  const rows = () => $$<HTMLElement>('[data-project]', list).filter((r) => !r.closest('li')!.hidden);
  const fine = matchMedia('(pointer: fine)').matches;
  let typing = 0;
  let shown = -1;

  // Types the preview lines out, like a command being run.
  const show = (i: number) => {
    if (i === shown) return;
    shown = i;
    const p = projects[i];
    ppName.textContent = p.name.toLowerCase().replace(/\s+/g, '-');
    clearInterval(typing);
    const text = p.preview.join('\n');
    if (reducedMotion()) ppBody.textContent = text;
    else {
      let n = 0;
      ppBody.textContent = '';
      typing = window.setInterval(() => {
        n += 3;
        ppBody.textContent = text.slice(0, n);
        if (n >= text.length) clearInterval(typing);
      }, 16);
    }
    preview.classList.add('on');
    list.dataset.hovering = '';
  };
  const hide = () => {
    shown = -1;
    preview.classList.remove('on');
    delete list.dataset.hovering;
  };
  scope.add(() => clearInterval(typing));

  scope.on(list, 'pointerover', (e: PointerEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-project]');
    if (row) show(Number(row.dataset.project));
  });
  scope.on(list, 'pointerleave', hide);
  scope.on(window, 'pointermove', (e: PointerEvent) => {
    if (!fine || !preview.classList.contains('on')) return;
    preview.style.translate = `${Math.min(e.clientX + 28, innerWidth - preview.offsetWidth - 16)}px ${e.clientY + 20}px`;
  });

  // Keyboard: focus shows the preview beside the row; ↑/↓ moves.
  scope.on(list, 'focusin', (e: FocusEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-project]');
    if (!row) return;
    show(Number(row.dataset.project));
    const r = row.getBoundingClientRect();
    preview.style.translate = `${Math.max(16, innerWidth - preview.offsetWidth - 32)}px ${r.top + 8}px`;
  });
  scope.on(list, 'focusout', (e: FocusEvent) => !list.contains(e.relatedTarget as Node) && hide());
  scope.on(list, 'keydown', (e: KeyboardEvent) => {
    const rs = rows();
    const i = rs.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    rs[(i + (e.key === 'ArrowDown' ? 1 : -1) + rs.length) % rs.length].focus();
  });
  // ↓ from anywhere on the page enters the list
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && document.activeElement === main) {
      e.preventDefault();
      rows()[0]?.focus();
    }
  });
};
