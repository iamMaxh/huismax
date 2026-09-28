import { artists } from '../../data/music';
import { PageHead } from '../components/head';

/** Everything live here comes from Spotify via /api/spotify/*, rendered client-side. */
export const Music = () => (
  <div class="music-page">
    <PageHead crumb="music" title="Music" class="music-head" />

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

    <section class="artists" aria-label="artists">
      <h2 class="section-label mono">always</h2>
      <ol class="artist-list">
        {artists.map((a) => (
          <li class="artist" tabindex={0}>
            <span class="artist-name">{a}</span>
          </li>
        ))}
      </ol>
    </section>
  </div>
);
