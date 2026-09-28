import type { Child } from 'hono/jsx';
import type { LiveStatus } from '../../lib/live';
import type { Presence } from '../../lib/presence';
import type { Item, Settings } from '../../lib/cms';
import { LiveMark } from '../components/live';
import { Listening } from '../components/listening';
import { extAttrs, isOpen } from '../components/site';

type Props = {
  live: LiveStatus;
  presence: Presence;
  spotifyConnected: boolean;
  settings: Settings;
  identities: Item[];
  projects: Item[];
  now: Item[];
};

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** "WHO IS MAX?" → "WHO IS" / "MAX?": the last word gets its own line, a trailing "?" tilts on hover. */
function Headline({ text }: { text: string }) {
  const cut = text.lastIndexOf(' ');
  const lines = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];
  const last = lines.length - 1;
  return (
    <h1 class="who" data-typewriter>
      {lines.map((l, i) =>
        i === last && l.endsWith('?') ? (
          <span class="who-line">
            {l.slice(0, -1)}
            <span class="who-q">?</span>
          </span>
        ) : (
          <span class="who-line">{l}</span>
        ),
      )}
    </h1>
  );
}

/** A small link beside an identity: its own meta link, or (for the vibe coder) the first public project with a link. */
function sideLink(id: Item, project: Item | undefined) {
  const url = s(id.meta_url);
  if (url) return { text: s(id.meta) || url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''), url };
  const coder = id.id === 'vibe-coder' || id.href === '/vibe-coder';
  if (coder && project && s(project.url) && !s(id.meta)) return { text: s(project.name), url: s(project.url) };
  return null;
}

export const Home = ({ live, presence, spotifyConnected, settings, identities, projects, now }: Props) => {
  const project = projects.find((p) => s(p.url));
  // a row never leads to a page the admin has hidden
  const rows = identities.filter((id) => isOpen(settings, s(id.href)));
  const open = (href: string) => isOpen(settings, href);
  const Cell = ({ href, children }: { href: string; children?: Child }) =>
    open(href) ? (
      <a class="index-cell" data-prox href={href}>
        {children}
      </a>
    ) : (
      <div class="index-cell" data-prox>
        {children}
      </div>
    );
  const elsewhere = [
    ['/music', 'music'],
    ['/dj', 'dj'],
    ['/reply', 'reply'],
  ].filter(([href]) => open(href));

  return (
    <>
      {/* code rain behind the whole homepage (client/pages/home.ts) */}
      <canvas class="rain" data-rain aria-hidden="true" />
      <section class="home-hero" data-mood="none">
        <div class="hero-inner">
          <div class="who-wrap">
            <Headline text={settings.headline} />
            {settings.tagline && <p class="who-tagline">{settings.tagline}</p>}
          </div>
          {/* personal state + what's playing; a live DJ session overrides both and they return when it ends */}
          <div class="presence" data-presence data-live={live.isLive ? 'on' : 'off'} aria-live="polite">
            <p class="presence-line presence-off">
              <span class="doing-dot" aria-hidden="true" />
              <span data-presence-status>{presence.status}</span>
            </p>
            <Listening class="presence-off" feature pending={spotifyConnected} />
            {/* the line set by hand in /admin; CSS hides it while Spotify shows a track */}
            <p class="presence-sub presence-off mono" data-presence-listen hidden={!presence.listening}>
              {presence.listening ? `♪ ${presence.listening.title}${presence.listening.artist ? ` — ${presence.listening.artist}` : ''}` : ''}
            </p>
            {settings.spotifyProfile && (
              <a class="presence-profile presence-off mono" href={settings.spotifyProfile} target="_blank" rel="noopener noreferrer">
                spotify profile <span aria-hidden="true">↗</span>
              </a>
            )}
            <p class="presence-line presence-on">
              <LiveMark live={live} />
            </p>
            {settings.pages.dj && (
              <p class="presence-sub presence-on mono">
                <a href="/dj">huismax dj channel</a>
              </p>
            )}
          </div>
          <div class="hero-side">
            {rows.length > 0 && (
              <ol class="identities" data-identities>
                {rows.map((id, i) => {
                  const side = sideLink(id, project);
                  return (
                    <li>
                      <a class="identity" href={s(id.href)} {...extAttrs(s(id.href))} data-mood-key={s(id.id)} data-caption={s(id.caption)}>
                        <span class="identity-idx mono">{String(i + 1).padStart(2, '0')}</span>
                        <span class="identity-name">{s(id.name)}</span>
                        <span class="identity-meta mono">{side ? '' : s(id.meta)}</span>
                        <span class="identity-arrow" aria-hidden="true">→</span>
                      </a>
                      {/* a sibling, not nested: the row goes to its page, the small link goes out */}
                      {side && (
                        <a class="identity-ext mono" href={side.url} target="_blank" rel="noopener noreferrer">
                          {side.text} <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <p class="mood-caption mono" data-mood-caption aria-hidden="true" />
          </div>
        </div>
      </section>

      <section class="home-index" aria-label="index">
        <Cell href="/now">
          <span class="index-label mono">now</span>
          <ul class="index-list">
            <li>
              <span class="mono dim">right now</span> <span class="doing-dot" aria-hidden="true" />
              <span data-presence-status>{presence.status}</span>
            </li>
            {now.map((n) => (
              <li>
                {s(n.label) && <span class="mono dim">{s(n.label)}</span>} {s(n.text)}
              </li>
            ))}
          </ul>
        </Cell>
        <Cell href="/music">
          <span class="index-label mono" data-listening-label>listening</span>
          <span class="index-art" aria-hidden="true"><img alt="" data-listening-art hidden /></span>
          <span class="index-big" data-listening-name>—</span>
          <span class="dim" data-listening-artist />
        </Cell>
        <Cell href="/vibe-coder">
          <span class="index-label mono">building</span>
          {projects.length ? projects.map((p) => <span class="index-big">{s(p.name)}</span>) : <span class="index-big dim">—</span>}
        </Cell>
        <div class="index-cell index-links" data-prox>
          <span class="index-label mono">elsewhere</span>
          {elsewhere.map(([href, label]) => (
            <a class="index-link" href={href}>
              {label} <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      </section>
    </>
  );
};
