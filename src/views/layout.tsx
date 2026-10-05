import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import { assets } from '../generated/assets';
import type { LiveStatus } from '../lib/live';
import type { Site } from '../lib/content';
import { AudioBar } from './components/audiobar';
import { LiveMark } from './components/live';
import { menuLinks, paletteLinks, SiteContext } from './components/site';

export type PageKey = 'home' | 'photographer' | 'dj' | 'hiking' | 'vibe-coder' | 'music' | 'now' | 'reply' | 'homelab' | 'not-found';

type Props = {
  page: PageKey;
  title?: string;
  description?: string;
  live: LiveStatus;
  site: Site;
  children: Child;
};

// Runs before paint so the stored theme never flashes.
// Also marks the page as scripted, so the homepage headline can wait for its typewriter instead of flashing.
const themeBoot = `document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

const json = (v: unknown) => raw(JSON.stringify(v).replace(/</g, '\\u003c'));

export const Layout = ({ page, title, description, live, site, children }: Props) => {
  const s = site.settings;
  const fullTitle = title ? `${title} — huismax` : 'huismax';
  const desc = description || s.description || s.headline;
  const nav = menuLinks(s);
  // Only what the menu + palette need; settings themselves (some are private) never reach the page.
  const clientNav = { menu: nav.map(({ href, label }) => ({ href, label })), pages: paletteLinks(s).map(({ href, label }) => ({ href, label })) };
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{fullTitle}</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={desc} />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap" />
        <link rel="stylesheet" href={assets.css} />
        <script>{raw(themeBoot)}</script>
        <script type="module" src={assets.js} />
      </head>
      <body data-page={page}>
        <a class="skip" href="#main">skip to content</a>
        <header class="site-header">
          <a class="wordmark" href="/" aria-label="huismax, home">
            huismax<span class="wordmark-cursor" aria-hidden="true">_</span>
          </a>
          <nav class="site-nav" aria-label="primary">
            {nav.map((n) => (
              <a href={n.href} data-nav={n.page} aria-current={n.page === page ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <div class="header-tools">
            {s.pages.dj && (
              <a class="header-live" href="/dj" aria-label="huismax dj channel status">
                <LiveMark live={live} />
              </a>
            )}
            <button class="menu-btn chat-btn" type="button" data-chat-open aria-haspopup="dialog" aria-expanded="false">
              <span class="chat-btn-long">live </span>chat
            </button>
            <button class="menu-btn" type="button" data-menu-open aria-haspopup="dialog">
              menu
            </button>
          </div>
        </header>

        <main id="main" tabindex={-1} data-page={page}>
          <SiteContext.Provider value={site}>{children}</SiteContext.Provider>
        </main>

        <footer class="site-footer">
          {s.footer && <span class="footer-text">{s.footer}</span>}
          {site.links.length > 0 && (
            <ul class="footer-links" aria-label="elsewhere">
              {site.links.map((l) => (
                <li>
                  <a href={String(l.url)} target="_blank" rel="noopener noreferrer">
                    {String(l.label)} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </footer>

        <AudioBar live={live} dj={s.pages.dj} />
        <div class="sr-only" aria-live="polite" data-route-announcer />
        <script type="application/json" id="site-nav">{json(clientNav)}</script>
        {/* the label only ever says LIVE: "off air" is never shown on the public site */}
        <script type="application/json" id="live-initial">{json({ ...live, label: live.isLive ? 'LIVE' : '' })}</script>
      </body>
    </html>
  );
};
