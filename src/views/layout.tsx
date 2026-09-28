import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import { assets } from '../generated/assets';
import type { LiveStatus } from '../lib/live';
import { AudioBar } from './components/audiobar';
import { LiveMark } from './components/live';

export type PageKey =
  | 'home' | 'photographer' | 'dj' | 'trail-runner' | 'vibe-coder' | 'music' | 'now' | 'lab' | 'not-found';

type Props = {
  page: PageKey;
  title?: string;
  description?: string;
  live: LiveStatus;
  children: Child;
};

const nav = [
  { href: '/', label: 'home', page: 'home' },
  { href: '/music', label: 'music', page: 'music' },
  { href: '/now', label: 'now', page: 'now' },
  { href: '/lab', label: 'lab', page: 'lab' },
] as const;

// Runs before paint so the stored theme never flashes.
const themeBoot = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export const Layout = ({ page, title, description, live, children }: Props) => {
  const fullTitle = title ? `${title} — huismax` : 'huismax';
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{fullTitle}</title>
        <meta name="description" content={description ?? 'WHO IS MAX?'} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description ?? 'WHO IS MAX?'} />
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
            <a class="header-live" href="/dj" aria-label="huismax dj channel status">
              <LiveMark live={live} />
            </a>
            <button class="kbd" type="button" data-palette-open aria-label="open command menu" aria-keyshortcuts="Meta+K Control+K">
              <span class="kbd-desktop">⌘K</span>
              <span class="kbd-mobile">menu</span>
            </button>
          </div>
        </header>

        <main id="main" tabindex={-1} data-page={page}>
          {children}
        </main>

        <footer class="site-footer">
          <span>huismax © 2026</span>
          <span class="footer-hint">
            press <kbd>⌘K</kbd> to go anywhere
          </span>
        </footer>

        <AudioBar live={live} />
        <div class="sr-only" aria-live="polite" data-route-announcer />
        <script type="application/json" id="live-initial">{raw(JSON.stringify(live).replace(/</g, '\\u003c'))}</script>
      </body>
    </html>
  );
};
