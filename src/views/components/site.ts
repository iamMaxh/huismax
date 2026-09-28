import { createContext, useContext } from 'hono/jsx';
import type { PageKeyCms, Settings } from '../../lib/cms';
import type { Site } from '../../lib/content';

/** Public path of every page the admin can hide. */
const PATHS: Record<PageKeyCms, string> = {
  photographer: '/photographer',
  hiking: '/hiking',
  dj: '/dj',
  'vibe-coder': '/vibe-coder',
  music: '/music',
  now: '/now',
  reply: '/reply',
};

/** False when `href` is one of our pages and the admin has hidden it (it would be a 404 for visitors). */
export function isOpen(s: Settings, href: string) {
  const path = href.split(/[?#]/)[0];
  const key = (Object.keys(PATHS) as PageKeyCms[]).find((k) => PATHS[k] === path);
  return !key || s.pages[key] !== false;
}

export type NavLink = { href: string; label: string; page: string };

/** Header nav + menu overlay: home plus the pages switched on in settings.nav (never a hidden page). */
export function menuLinks(s: Settings): NavLink[] {
  const optional: NavLink[] = [
    { href: '/music', label: 'music', page: 'music' },
    { href: '/dj', label: 'dj', page: 'dj' },
    { href: '/now', label: 'now', page: 'now' },
    { href: '/reply', label: 'reply', page: 'reply' },
  ];
  return [{ href: '/', label: 'home', page: 'home' }, ...optional.filter((l) => s.nav[l.page as keyof Settings['nav']] && isOpen(s, l.href))];
}

/** Everywhere the ⌘K palette and "random" can go: the menu, plus the identity pages that are public. */
export function paletteLinks(s: Settings): NavLink[] {
  const identities: NavLink[] = [
    { href: '/photographer', label: 'photographer', page: 'photographer' },
    { href: '/hiking', label: 'hiking', page: 'hiking' },
    { href: '/vibe-coder', label: 'vibe coder', page: 'vibe-coder' },
  ];
  const menu = menuLinks(s);
  return [menu[0], ...identities.filter((l) => isOpen(s, l.href)), ...menu.slice(1)];
}

/** The layout provides the site settings to page views that need them without a prop (e.g. the 404). */
export const SiteContext = createContext<Site | null>(null);
export const useSite = () => useContext(SiteContext);

export const external = (href: string) => /^https?:\/\//.test(href);
/** Attributes for a link that leaves the site. */
export const extAttrs = (href: string) => (external(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {});
