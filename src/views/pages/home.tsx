import type { LiveStatus } from '../../lib/live';
import type { Presence } from '../../lib/presence';
import { now } from '../../data/now';
import { LiveMark } from '../components/live';
import { Listening } from '../components/listening';
import { links } from '../../data/links';

const identities = [
  { href: '/photographer', name: 'Photographer', mood: 'photo', meta: '', caption: 'frames' },
  { href: '/dj', name: 'DJ', mood: 'dj', meta: '', caption: 'huismax dj channel' },
  { href: '/trail-runner', name: 'Trail runner', mood: 'trail', meta: '', caption: 'elevation' },
  { href: '/vibe-coder', name: 'Vibe coder', mood: 'code', meta: 'Tapical', metaUrl: 'https://tapical.us', caption: '> building tapical' },
] as { href: string; name: string; mood: string; meta: string; metaUrl?: string; caption: string }[];

const spotifyProfile = links.spotifyProfile;

export const Home = ({ live, presence, spotifyConnected }: { live: LiveStatus; presence: Presence; spotifyConnected: boolean }) => (
  <>
    <section class="home-hero" data-mood="none">
      <canvas class="mood-canvas" data-mood-canvas aria-hidden="true" />
      <div class="hero-inner">
        <h1 class="who" data-who>
          <span class="who-line">WHO IS</span>
          <span class="who-line">
            MAX<span class="who-q">?</span>
          </span>
        </h1>
        {/* personal state + what's playing; a live DJ session overrides both and they return when it ends */}
        <div class="presence" data-presence data-live={live.isLive ? 'on' : 'off'} aria-live="polite">
          <p class="presence-line presence-off">
            <span data-presence-status>{presence.status}</span>
          </p>
          <Listening class="presence-off" feature pending={spotifyConnected} />
          {spotifyProfile && (
            <a class="presence-profile presence-off mono" href={spotifyProfile} target="_blank" rel="noopener noreferrer">
              spotify profile <span aria-hidden="true">↗</span>
            </a>
          )}
          <p class="presence-line presence-on">
            <LiveMark live={live} />
          </p>
          <p class="presence-sub presence-on mono">
            <a href="/dj">huismax dj channel</a>
          </p>
        </div>
        <div class="hero-side">
          <ol class="identities" data-identities>
            {identities.map((id, i) => (
              <li>
                <a class="identity" href={id.href} data-mood-key={id.mood} data-caption={id.caption}>
                  <span class="identity-idx mono">0{i + 1}</span>
                  <span class="identity-name">{id.name}</span>
                  <span class="identity-meta mono">{id.metaUrl ? '' : id.meta}</span>
                  <span class="identity-arrow" aria-hidden="true">→</span>
                </a>
                {/* a sibling, not nested: the row goes to /vibe-coder, the project name goes to the project */}
                {id.metaUrl && (
                  <a class="identity-ext mono" href={id.metaUrl} target="_blank" rel="noopener noreferrer">
                    {id.meta} <span aria-hidden="true">↗</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
          <p class="mood-caption mono" data-mood-caption aria-hidden="true" />
        </div>
      </div>
    </section>

    <section class="home-index" aria-label="index">
      <a class="index-cell" data-prox href="/now">
        <span class="index-label mono">now</span>
        <ul class="index-list">
          <li>
            <span class="mono dim">right now</span> <span data-presence-status>{presence.status}</span>
          </li>
          {now.map((n) => (
            <li>
              <span class="mono dim">{n.key}</span> {n.value}
            </li>
          ))}
        </ul>
      </a>
      <a class="index-cell" data-prox href="/music">
        <span class="index-label mono" data-listening-label>listening</span>
        <span class="index-art" aria-hidden="true"><img alt="" data-listening-art hidden /></span>
        <span class="index-big" data-listening-name>—</span>
        <span class="dim" data-listening-artist />
      </a>
      <a class="index-cell" data-prox href="/vibe-coder">
        <span class="index-label mono">building</span>
        <span class="index-big">Tapical</span>
      </a>
      <div class="index-cell index-links" data-prox>
        <span class="index-label mono">elsewhere</span>
        <a class="index-link" href="/music">music <span aria-hidden="true">→</span></a>
        <a class="index-link" href="/dj">dj <span aria-hidden="true">→</span></a>
        <a class="index-link" href="/lab">lab <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </>
);
