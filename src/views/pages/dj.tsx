import type { LiveStatus } from '../../lib/live';
import type { Mix } from '../../lib/mixes';
import { Data, PageHead } from '../components/head';
import { LiveMark } from '../components/live';

const no = (n: number) => String(n).padStart(3, '0');

/** Live when LIVE is on in /admin; otherwise the console plays the archive (also managed in /admin). */
export const DJ = ({ live, mixes }: { live: LiveStatus; mixes: Mix[] }) => {
  const latest = mixes[mixes.length - 1];
  const list = [...mixes].reverse();
  return (
    <div class="dj-page" data-live-root data-live={live.isLive ? 'on' : 'off'}>
      <PageHead crumb="dj" title={<>huismax<br />dj channel</>} class="dj-head">
        <LiveMark live={live} class="live-mark-xl" />
      </PageHead>

      <section class="console" aria-label="player" data-prox>
        <canvas class="console-viz" data-dj-viz aria-hidden="true" />
        <div class="console-bar">
          <div class="console-cell">
            <span class="label mono" data-dj-kicker>{live.isLive ? 'now playing' : latest ? `latest · ${no(latest.no)}` : 'archive'}</span>
            <strong class="console-title" data-dj-title>
              {live.isLive ? live.sessionTitle ?? 'live' : latest ? latest.title : 'first transmission soon'}
            </strong>
          </div>
          <div class="console-cell console-clock-cell">
            <span class="label mono">on air</span>
            <span class="mono console-clock" data-dj-clock data-started={live.startedAt ?? ''}>--:--:--</span>
          </div>
          <button class="btn-primary console-live" type="button" data-listen-live data-hide-off hidden={!live.isLive}>
            listen live <span aria-hidden="true">→</span>
          </button>
          {latest && (
            <button class="btn-primary console-latest" type="button" data-play-mix={latest.id} hidden={live.isLive}>
              <span data-latest-label>play</span> <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </section>

      <section class="archive" aria-label="archive">
        <h2 class="section-label mono">archive</h2>
        {list.length ? (
          <ol class="mixes">
            {list.map((m) => (
              <li class="mix">
                <button type="button" class="mix-play" data-play-mix={m.id} aria-label={`play ${m.title}`}>▶</button>
                <div class="mix-body">
                  <span class="mix-title"><span class="mono dim">{no(m.no)}</span> {m.title}</span>
                  <span class="mono dim" data-mix-meta={m.id}>{m.date}</span>
                </div>
                <span class="mix-wave" data-wave={m.id} aria-hidden="true" />
              </li>
            ))}
          </ol>
        ) : (
          <div class="archive-empty">
            <p class="archive-empty-title">NO ARCHIVE YET</p>
            <p class="mono dim">first transmission soon</p>
          </div>
        )}
      </section>
      <Data id="mix-data" value={mixes.map((m) => ({ id: m.id, title: `${no(m.no)} — ${m.title}`, audioUrl: m.url }))} />
    </div>
  );
};
