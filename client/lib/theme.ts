export type Theme = 'dark' | 'light';

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function toggleTheme() {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {}
  dispatchEvent(new CustomEvent('themechange'));
  return next;
}
