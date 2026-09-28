import type { LiveStatus } from '../../lib/live';
import { photos } from '../../data/photos';
import { mixes } from '../../data/mixes';
import { runs } from '../../data/runs';
import { projects } from '../../data/projects';
import { nowPlaying } from '../../data/music';
import { now } from '../../data/now';
import { LiveMark } from '../components/live';

export const Home = ({ live }: { live: LiveStatus }) => {
  const km = runs.reduce((s, r) => s + r.distanceKm, 0);
  const identities = [
    { href: '/photographer', name: 'Photographer', mood: 'photo', meta: `${photos.length} frames`, caption: photos[0].exposure },
    { href: '/dj', name: 'DJ', mood: 'dj', meta: `${mixes.length} sessions`, caption: `${mixes[0].bpm} bpm` },
    { href: '/trail-runner', name: 'Trail runner', mood: 'trail', meta: `${Math.round(km)} km`, caption: `${runs[0].distanceKm} km ↑ ${runs[0].gainM} m` },
    { href: '/vibe-coder', name: 'Vibe coder', mood: 'code', meta: `${projects.length} builds`, caption: '> building' },
  ];

  return (
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
          <ol class="identities" data-identities>
            {identities.map((id, i) => (
              <li>
                <a class="identity" href={id.href} data-mood-key={id.mood} data-caption={id.caption}>
                  <span class="identity-idx mono">0{i + 1}</span>
                  <span class="identity-name">{id.name}</span>
                  <span class="identity-meta mono">{id.meta}</span>
                  <span class="identity-arrow" aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ol>
          <p class="mood-caption mono" data-mood-caption aria-hidden="true" />
        </div>
      </section>

      <section class="channel-strip" aria-label="huismax dj channel" data-live-root data-live={live.isLive ? 'on' : 'off'}>
        <LiveMark live={live} />
        <a class="channel-name" href="/dj">huismax dj channel</a>
        <span class="channel-session mono" data-live-session data-off-text={`last — ${mixes[0].title}`}>
          {live.isLive ? live.sessionTitle ?? '' : `last — ${mixes[0].title}`}
        </span>
        <button class="channel-listen" type="button" data-listen-live data-hide-off hidden={!live.isLive}>
          listen →
        </button>
      </section>

      <section class="home-index" aria-label="index">
        <a class="index-cell" href="/now">
          <span class="index-label mono">now</span>
          <ul class="index-list">
            {now.slice(0, 3).map((n) => (
              <li>
                <span class="mono dim">{n.key}</span> {n.value}
              </li>
            ))}
          </ul>
        </a>
        <a class="index-cell" href="/music">
          <span class="index-label mono">listening</span>
          <span class="index-big">{nowPlaying.title}</span>
          <span class="dim">
            {nowPlaying.artist} — {nowPlaying.album}
          </span>
          <span class="eq" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        </a>
        <a class="index-cell" href="/vibe-coder">
          <span class="index-label mono">selected work</span>
          <ul class="index-list">
            {projects.slice(0, 4).map((p) => (
              <li>
                {p.name} <span class="mono dim">{p.status}</span>
              </li>
            ))}
          </ul>
        </a>
        <div class="index-cell index-links">
          <span class="index-label mono">elsewhere</span>
          <a class="index-link" href="/music">music <span aria-hidden="true">→</span></a>
          <a class="index-link" href="/lab">lab <span aria-hidden="true">→</span></a>
          <a class="index-link" href="/now">now <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </>
  );
};
