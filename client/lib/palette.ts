import { $ } from './dom';
import { live } from './live';
import { player } from './player';
import { toggleTheme } from './theme';

type Item = { id: string; label: string; hint: string; group: 'go' | 'do'; run: () => void };

const pages: [string, string][] = [
  ['/', 'home'], ['/photographer', 'photographer'], ['/dj', 'dj'], ['/trail-runner', 'trail runner'],
  ['/vibe-coder', 'vibe coder'], ['/music', 'music'], ['/now', 'now'], ['/lab', 'lab'],
];

/** ⌘K command menu: jump anywhere, plus a few site actions. */
export function startPalette(navigate: (href: string) => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'palette';
  dialog.setAttribute('aria-label', 'command menu');
  dialog.innerHTML = `
    <div class="palette-box">
      <input class="palette-input" type="text" placeholder="go to…" aria-label="search commands"
        role="combobox" aria-expanded="true" aria-controls="palette-list" autocomplete="off" spellcheck="false">
      <ul class="palette-list" id="palette-list" role="listbox"></ul>
      <div class="palette-foot mono"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
    </div>`;
  document.body.append(dialog);
  const input = $<HTMLInputElement>('input', dialog)!;
  const list = $<HTMLUListElement>('ul', dialog)!;

  const items = (): Item[] => [
    ...pages.map(([href, label]) => ({ id: href, label, hint: href, group: 'go' as const, run: () => navigate(href) })),
    ...(live.get().isLive
      ? [{ id: 'listen', label: 'listen live', hint: '● LIVE', group: 'do' as const, run: () => player.play({ kind: 'live', id: 'live', title: live.get().sessionTitle ?? 'huismax dj channel', url: live.get().streamUrl }) }]
      : []),
    ...(player.state().source ? [{ id: 'stop', label: 'stop audio', hint: '■', group: 'do' as const, run: () => player.stop() }] : []),
    { id: 'theme', label: 'switch theme', hint: 'black / white', group: 'do', run: () => toggleTheme() },
    { id: 'random', label: 'somewhere random', hint: '?', group: 'do', run: () => navigate(pages[Math.floor(Math.random() * pages.length)][0]) },
    { id: 'copy', label: 'copy link', hint: location.host, group: 'do', run: () => navigator.clipboard?.writeText(location.href) },
  ];

  let shown: Item[] = [];
  let active = 0;

  // Subsequence match, scored so earlier + contiguous hits rank higher.
  const score = (q: string, s: string) => {
    if (!q) return 1;
    let i = 0, sc = 0, last = -2;
    for (let j = 0; j < s.length && i < q.length; j++) {
      if (s[j] === q[i]) {
        sc += last === j - 1 ? 3 : 1;
        if (j === 0) sc += 2;
        last = j;
        i++;
      }
    }
    return i === q.length ? sc : 0;
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = items()
      .map((it) => ({ it, s: Math.max(score(q, it.label), score(q, it.hint.toLowerCase())) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .map((x) => x.it);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    let group = '';
    shown.forEach((it, i) => {
      if (!q && it.group !== group) {
        group = it.group;
        const h = document.createElement('li');
        h.className = 'palette-group mono';
        h.setAttribute('role', 'presentation');
        h.textContent = group;
        list.append(h);
      }
      const li = document.createElement('li');
      li.id = `pal-${i}`;
      li.className = 'palette-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.innerHTML = `<span></span><span class="mono dim"></span>`;
      li.children[0].textContent = it.label;
      li.children[1].textContent = it.hint;
      li.addEventListener('pointermove', () => i !== active && select(i));
      li.addEventListener('click', () => run(i));
      list.append(li);
    });
    if (!shown.length) list.innerHTML = '<li class="palette-empty mono dim">nothing here.</li>';
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${active}` : '');
  };

  const select = (i: number) => {
    active = (i + shown.length) % shown.length;
    list.querySelectorAll('[role=option]').forEach((el, j) => el.setAttribute('aria-selected', String(j === active)));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
    list.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
  };

  const run = (i: number) => {
    const it = shown[i];
    if (!it) return;
    close();
    it.run();
  };

  const open = () => {
    if (dialog.open) return;
    input.value = '';
    active = 0;
    render();
    dialog.showModal();
    input.focus();
  };
  const close = () => dialog.open && dialog.close();

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), select(active + 1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), select(active - 1));
    else if (e.key === 'Enter') (e.preventDefault(), run(active));
  });
  dialog.addEventListener('click', (e) => e.target === dialog && close());

  document.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      dialog.open ? close() : open();
    } else if (e.key === '/' && !typing && !dialog.open) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('[data-palette-open]')) open();
  });

  return { open, close };
}
