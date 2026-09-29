import type { LiveStatus } from '../../lib/live';
import type { PublicRequest, PublicSession } from '../../lib/content';
import { MAX_NAME, MAX_REQUEST } from '../../lib/requests';
import { Data, PageHead } from '../components/head';
import { LiveMark } from '../components/live';

const no = (n: number) => String(n).padStart(3, '0');

/**
 * Live while the radio is on air (or LIVE is on in /admin): the console plays the stream, straight from Icecast.
 * Otherwise it plays the archive (sessions from /admin, newest number first).
 * Requests ask what to play next live (POST /api/dj/requests); the ones Max publishes in /admin are listed.
 */
export const DJ = ({ live, sessions, requests, ready, intro }: { live: LiveStatus; sessions: PublicSession[]; requests: PublicRequest[]; ready: boolean; intro: string }) => {
  const list = [...sessions].sort((a, b) => b.number - a.number);
  // the console offers the newest session that can actually be played
  const latest = list.find((s) => s.audioUrl) ?? list[0];
  return (
    <div class="dj-page" data-live-root data-live={live.isLive ? 'on' : 'off'}>
      <PageHead crumb="dj" title={<>huismax<br />dj channel</>} intro={intro} class="dj-head">
        <LiveMark live={live} class="live-mark-xl" />
      </PageHead>

      <section class="console" aria-label="player" data-prox>
        <canvas class="console-viz" data-dj-viz aria-hidden="true" />
        <div class="console-bar">
          <div class="console-cell">
            <span class="label mono" data-dj-kicker>{live.isLive ? 'now playing' : latest ? `latest · ${no(latest.number)}` : 'archive'}</span>
            <strong class="console-title" data-dj-title>
              {live.isLive ? live.sessionTitle ?? 'live' : latest ? latest.title : 'first transmission soon'}
            </strong>
          </div>
          <div class="console-cell console-clock-cell">
            <span class="label mono">on air</span>
            <span class="mono console-clock" data-dj-clock data-started={live.startedAt ?? ''}>--:--:--</span>
          </div>
          {/* the radio's listener count (/api/dj-status); only while on air */}
          <div class="console-cell" data-dj-listeners-cell hidden>
            <span class="label mono">listening</span>
            <span class="mono console-count" data-dj-listeners />
          </div>
          {/* shown once there is something to hear, and where the browser lets a page set the volume */}
          <label class="console-cell console-volume" data-dj-volume hidden>
            <span class="label mono">volume</span>
            <input type="range" min="0" max="100" step="1" value="100" aria-label="volume" data-dj-volume-input />
          </label>
          <button class="btn-primary console-live" type="button" data-listen-live data-hide-off hidden={!live.isLive} aria-pressed="false">
            <span data-listen-label>listen live</span> <span aria-hidden="true">→</span>
          </button>
          {latest?.audioUrl && (
            <button class="btn-primary console-latest" type="button" data-play-mix={latest.id} hidden={live.isLive}>
              <span data-latest-label>play</span> <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </section>

      {ready && <Requests picked={requests} />}

      <section class="archive" aria-label="archive">
        <h2 class="section-label mono">archive</h2>
        {list.length ? (
          <ol class="mixes">
            {list.map((m) => (
              <li class="mix" data-session={m.number}>
                <button type="button" class="mix-play" data-play-mix={m.id} disabled={!m.audioUrl} aria-label={m.audioUrl ? `play ${m.title}` : `${m.title}: no audio yet`}>
                  ▶
                </button>
                <div class="mix-body">
                  <div class="mix-head">
                    {m.cover && <img class="mix-cover" src={m.cover} alt="" width={56} height={56} loading="lazy" decoding="async" />}
                    <div class="mix-text">
                      <span class="mix-title">
                        <span class="mono dim">{no(m.number)}</span> {m.title}
                      </span>
                      {(m.date || m.duration) && <span class="mono dim">{[m.date, m.duration].filter(Boolean).join(' · ')}</span>}
                    </div>
                  </div>
                  {m.description && <p class="mix-desc">{m.description}</p>}
                  {m.tracklist.length > 0 && (
                    <details class="mix-tracks">
                      <summary class="mono">
                        tracklist <span class="dim">{m.tracklist.length}</span>
                      </summary>
                      <ol class="mix-tracklist mono">
                        {m.tracklist.map((t, i) => (
                          <li>
                            <span class="dim">{String(i + 1).padStart(2, '0')}</span> <span>{t}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {m.audioUrl && (
                    <a class="mix-link mono" href={m.audioUrl} target="_blank" rel="noopener noreferrer">
                      audio file <span aria-hidden="true">↗</span>
                    </a>
                  )}
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
      <Data id="mix-data" value={list.map((m) => ({ id: m.id, no: no(m.number), title: m.title, audioUrl: m.audioUrl }))} />
    </div>
  );
};

/** `website` is a honeypot, as on /reply: invisible to people, filled in by bots, silently dropped by the server. */
const Requests = ({ picked }: { picked: PublicRequest[] }) => (
  <section class="requests" aria-labelledby="requests-ask">
    <h2 class="section-label mono">requests</h2>
    <div class="requests-cols">
      <form class="reply-form requests-form" data-request-form method="post" action="/api/dj/requests" novalidate>
        <p class="requests-ask" id="requests-ask">
          What should I play next live?
        </p>
        <div class="field">
          <label class="label mono" for="request-track">
            a track, an artist, a vibe
          </label>
          <input id="request-track" name="request" type="text" maxlength={MAX_REQUEST} required autocomplete="off" enterkeyhint="send" data-request-input />
        </div>
        <div class="field">
          <label class="label mono" for="request-name">
            name <span class="dim">· optional</span>
          </label>
          <input id="request-name" name="name" type="text" maxlength={MAX_NAME} autocomplete="nickname" />
        </div>
        <div class="reply-trap" aria-hidden="true">
          <label for="request-website">website</label>
          <input id="request-website" name="website" type="text" tabindex={-1} autocomplete="off" aria-hidden="true" />
        </div>
        <div class="reply-actions">
          <button type="submit" class="btn-primary" data-request-send>
            <span data-request-label>request</span> <span aria-hidden="true">→</span>
          </button>
          <p class="reply-status mono" role="status" aria-live="polite" data-request-status />
        </div>
      </form>
      <div class="requests-picked">
        <h3 class="label mono">
          on the list {picked.length > 0 && <span class="dim">{picked.length}</span>}
        </h3>
        {picked.length ? (
          <ol class="requests-list">
            {picked.map((r) => (
              <li>
                <span class="requests-track">{r.request}</span>
                {r.name && <span class="mono dim">from {r.name}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p class="mono dim requests-empty">nothing picked yet.</p>
        )}
      </div>
    </div>
  </section>
);
