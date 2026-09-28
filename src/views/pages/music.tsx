import { albums, artists, nowPlaying, playlists, rotation } from '../../data/music';
import { PageHead } from '../components/head';

export const Music = () => {
  const max = Math.max(...rotation.map((r) => r.plays));
  return (
    <div class="music-page">
      <PageHead crumb="music" title="Music" class="music-head" />

      <section class="np" aria-label="currently listening">
        <span class="label mono">currently listening</span>
        <div class="np-row">
          <span class="eq eq-lg" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <div>
            <p class="np-title">{nowPlaying.title}</p>
            <p class="dim">{nowPlaying.artist} — {nowPlaying.album}</p>
          </div>
        </div>
      </section>

      <section class="artists" aria-label="favorite artists">
        <h2 class="section-label mono">artists</h2>
        <ol class="artist-list" data-artists>
          {artists.map((a, i) => (
            <li class="artist" tabindex={0}>
              <span class="mono dim">{String(i + 1).padStart(2, '0')}</span>
              <span class="artist-name">{a.name}</span>
              <span class="artist-note">{a.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <div class="music-cols">
        <section aria-label="albums">
          <div class="section-row">
            <h2 class="section-label mono">albums</h2>
            <div class="seg mono" data-album-sort>
              <button type="button" aria-pressed="true" data-sort="pick">pick</button>
              <button type="button" aria-pressed="false" data-sort="year">year</button>
              <button type="button" aria-pressed="false" data-sort="title">a–z</button>
            </div>
          </div>
          <ol class="albums" data-albums>
            {albums.map((a, i) => (
              <li data-pick={i} data-year={a.year} data-title={a.title}>
                <span class="album-cover" aria-hidden="true">{a.title.slice(0, 1)}</span>
                <span class="album-title">{a.title}</span>
                <span class="mono dim">{a.artist}</span>
                <span class="mono dim">{a.year}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="recent rotation">
          <h2 class="section-label mono">recent rotation</h2>
          <ol class="rotation">
            {rotation.map((r) => (
              <li style={`--w:${(r.plays / max).toFixed(3)}`}>
                <span class="rot-bar" aria-hidden="true" />
                <span class="rot-title">{r.title}</span>
                <span class="mono dim">{r.artist}</span>
                <span class="mono">{r.plays}</span>
              </li>
            ))}
          </ol>

          <h2 class="section-label mono playlists-label">playlists</h2>
          <ul class="playlists">
            {playlists.map((p) => (
              <li>
                <span>{p.name}</span>
                <span class="mono dim">{p.count} tracks</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
