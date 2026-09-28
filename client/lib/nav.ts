import { readJSON } from './dom';

/** Menu + palette entries, rendered by the layout from the admin's nav/page settings (never a hidden page). */
export type NavLink = { href: string; label: string };
type SiteNav = { menu: NavLink[]; pages: NavLink[] };

const data = readJSON<SiteNav>('site-nav') ?? { menu: [{ href: '/', label: 'home' }], pages: [{ href: '/', label: 'home' }] };

export const menuLinks = (): NavLink[] => data.menu;
export const paletteLinks = (): NavLink[] => data.pages;

/** A random page other than this one (menu "random", palette "somewhere random"). */
export function randomPage() {
  const others = data.pages.filter((p) => p.href !== location.pathname);
  return (others[Math.floor(Math.random() * others.length)] ?? data.pages[0]).href;
}
