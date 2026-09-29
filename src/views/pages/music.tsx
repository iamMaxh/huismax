import type { Item } from '../../lib/cms';
import { PageHead } from '../components/head';

type Props = { artists: Item[]; rotation: Item[]; featured: Item[]; spotifyProfile: string; intro: string };

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** A manual pick: title (+ subtitle), linked when it has a url. */
const Pick = ({ item }: { item: Item }) => {
  const inner = (
    <>
      <span class="pick-title">
        {s(item.title)}
        {s(item.url) && <span class="ext" aria-hidden="true"> ↗</span>}
      </span>
      {s(item.subtitle) && <span class="pick-sub dim">{s(item.subtitle)}</span>}
    </>
  );
  return (
    <li>
      {s(item.url) ? (
        <a class="pick" href={s(item.url)} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      ) : (
        <div class="pick">{inner}</div>
      )}
    </li>
  );
};

/**
 * Spotify (now playing with its lyrics, recently played, on repeat) is live via /api/spotify/*, rendered client-side.
 * Artists, rotation and featured are Max's own picks from /admin; a section only appears when it has items.
 */
export const Music = ({ artists, rotation, featured, spotifyProfile, intro }: Props) => (
  <div class="music-page">
    <PageHead crumb="music" title="Music" intro={intro} class="music-head">
      {spotifyProfile && (
        <a class="music-profile mono" href={spotifyProfile} target="_blank" rel="noopener noreferrer">
          spotify profile <span aria-hidden="true">↗</span>
        </a>
      )}
    </PageHead>

    <section class="np" data-np data-state="loading" aria-label="spotify" aria-live="polite">
      <a class="np-art" data-np-art-link target="_blank" rel="noopener" tabindex={-1}>
        <img data-np-art alt="" hidden />
      </a>
      <div class="np-info">
        <span class="label mono" data-np-label>
          <span class="np-dot" aria-hidden="true" /> <span data-np-label-text>loading</span>
        </span>
        <p class="np-title">
          <a data-np-link target="_blank" rel="noopener" />
        </p>
        <p class="np-artist" data-np-artist />
        <p class="np-album mono dim" data-np-album />
        <div class="np-progress mono" data-np-progress hidden>
          <span data-np-cur>0:00</span>
          <div class="bar"><div class="bar-fill" data-np-fill /></div>
          <span data-np-dur>0:00</span>
        </div>
        <p class="np-empty mono dim" data-np-empty hidden />
        {/* lyrics of the song playing (client/pages/music-lyrics.ts); not read out line by line as they change */}
        <div class="np-lyrics" data-lyrics data-state="off" aria-live="off" hidden>
          <p class="np-lyrics-head mono">
            <span class="np-lyrics-label">lyrics</span>
            <span class="np-lyrics-note" data-lyrics-note />
            <a class="np-lyrics-src" href="https://lrclib.net" target="_blank" rel="noopener noreferrer" data-lyrics-src hidden>
              lrclib<span aria-hidden="true">↗</span>
            </a>
            <button type="button" class="np-lyrics-toggle" data-lyrics-toggle aria-expanded="false" aria-controls="np-lyrics-view" hidden>
              all lines
            </button>
          </p>
          <div class="np-lyrics-view" id="np-lyrics-view" data-lyrics-view hidden>
            <ol class="np-lyrics-lines" data-lyrics-lines />
          </div>
        </div>
      </div>
    </section>

    <div class="music-cols">
      <section aria-label="recently played" data-recent-wrap>
        <h2 class="section-label mono">recently played</h2>
        <ol class="tracks" data-recent>
          <li class="tracks-empty mono dim">—</li>
        </ol>
      </section>
      <section aria-label="on repeat" data-repeat-wrap>
        <h2 class="section-label mono">on repeat</h2>
        <ol class="tracks" data-repeat>
          <li class="tracks-empty mono dim">—</li>
        </ol>
      </section>
    </div>

    {(rotation.length > 0 || featured.length > 0) && (
      <div class="music-cols">
        {rotation.length > 0 && (
          <section aria-label="in rotation">
            <h2 class="section-label mono">in rotation</h2>
            <ol class="picks">
              {rotation.map((m) => <Pick item={m} />)}
            </ol>
          </section>
        )}
        {featured.length > 0 && (
          <section aria-label="featured">
            <h2 class="section-label mono">featured</h2>
            <ol class="picks">
              {featured.map((m) => <Pick item={m} />)}
            </ol>
          </section>
        )}
      </div>
    )}

    {artists.length > 0 && (
      <section class="artists" aria-label="artists">
        <h2 class="section-label mono">artists</h2>
        <ol class="artist-list">
          {artists.map((a) => {
            const name = (
              <>
                <span class="artist-name">
                  {s(a.title)}
                  {s(a.url) && <span class="ext" aria-hidden="true"> ↗</span>}
                </span>
                {s(a.subtitle) && <span class="artist-sub mono dim">{s(a.subtitle)}</span>}
              </>
            );
            return s(a.url) ? (
              <li class="artist">
                <a class="artist-link" href={s(a.url)} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>
              </li>
            ) : (
              <li class="artist">{name}</li>
            );
          })}
        </ol>
      </section>
    )}
  </div>
);
