import type { LiveStatus } from '../../lib/live';
import { currentSession, mixes } from '../../data/mixes';
import { Data, PageHead } from '../components/head';
import { LiveMark } from '../components/live';

export const DJ = ({ live }: { live: LiveStatus }) => {
  const [recent, archive] = [mixes.slice(0, 3), mixes.slice(3)];
  return (
    <div class="dj-page" data-live-root data-live={live.isLive ? 'on' : 'off'}>
      <PageHead crumb="02 — dj" title={<>huismax<br />dj channel</>} class="dj-head">
        <LiveMark live={live} class="live-mark-xl" />
      </PageHead>

      <section class="console" aria-label="player" data-prox>
        <canvas class="console-viz" data-dj-viz aria-hidden="true" />
        <div class="console-bar">
          <div class="console-cell">
            <span class="label mono">now playing</span>
            <strong class="console-title" data-dj-title>
              {live.isLive ? live.sessionTitle ?? 'live' : 'nothing on air'}
            </strong>
          </div>
          <div class="console-cell">
            <span class="label mono">on air</span>
            <span class="mono console-clock" data-dj-clock data-started={live.startedAt ?? ''}>
              --:--:--
            </span>
          </div>
          <div class="console-cell">
            <span class="label mono">signal</span>
            <span class="mono" data-dj-signal>{live.isLive ? (live.streamUrl ? 'stream ready' : 'no stream url') : 'standby'}</span>
          </div>
          <button class="btn-primary" type="button" data-listen-live disabled={!live.isLive}>
            <span data-listen-label>{live.isLive ? 'listen' : 'off air'}</span> <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section class="dj-cols">
        <div class="dj-col">
          <h2 class="section-label mono">current session</h2>
          <p class="session-name">{currentSession.title}</p>
          <ol class="tracklist mono">
            {currentSession.tracklist.map((t, i) => (
              <li data-current={i === currentSession.tracklist.length - 1 ? 'true' : undefined}>
                <span class="dim">{t.time}</span>
                <span>{t.artist}</span>
                <span class="dim">{t.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <div class="dj-col">
          <h2 class="section-label mono">recent mixes</h2>
          <ol class="mixes">
            {recent.map((m) => (
              <li class="mix">
                <button type="button" class="mix-play" data-play-mix={m.id} disabled={!m.audioUrl} aria-label={`play ${m.title}`}>
                  {m.audioUrl ? '▶' : '○'}
                </button>
                <div class="mix-body">
                  <span class="mix-title">{m.title}</span>
                  <span class="mono dim">
                    {m.date} · {m.duration} · {m.bpm} bpm
                  </span>
                </div>
                <span class="mix-wave" data-wave={m.id} aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="archive" aria-label="archive">
        <h2 class="section-label mono">archive</h2>
        <table class="archive-table mono">
          <thead>
            <tr><th>no.</th><th>session</th><th>date</th><th>length</th><th>bpm</th><th>tags</th></tr>
          </thead>
          <tbody>
            {archive.map((m) => (
              <tr>
                <td class="dim">{m.id}</td>
                <td>{m.title}</td>
                <td class="dim">{m.date}</td>
                <td class="dim">{m.duration}</td>
                <td class="dim">{m.bpm}</td>
                <td class="dim">{m.tags.join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Data id="mix-data" value={mixes} />
    </div>
  );
};
