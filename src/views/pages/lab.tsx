import type { LiveStatus } from '../../lib/live';
import { PageHead } from '../components/head';
import { LiveMark } from '../components/live';

const entries = ['radio', 'visualizer', 'random', 'terminal', 'guestbook', '???'] as const;

export const Lab = ({ live }: { live: LiveStatus }) => (
  <div class="lab-page">
    <PageHead crumb="lab" title="Lab" class="lab-head">
      <p class="mono dim">{entries.length} experiments · unstable</p>
    </PageHead>

    <ol class="lab-list" data-lab>
      {entries.map((name, i) => (
        <li class="lab-item" data-exp={name} data-prox>
          <button type="button" class="lab-toggle" aria-expanded="false" aria-controls={`exp-${i}`} data-lab-toggle>
            <span class="mono dim">{String(i + 1).padStart(3, '0')}</span>
            <span class="lab-name">{name}</span>
            <span class="lab-plus mono" aria-hidden="true">+</span>
          </button>
          <div class="lab-panel" id={`exp-${i}`} hidden>
            {name === 'radio' && (
              <div class="exp exp-radio" data-live-root data-live={live.isLive ? 'on' : 'off'}>
                <LiveMark live={live} />
                <button type="button" class="btn-line" data-listen-live disabled={!live.isLive}>listen →</button>
                <button type="button" class="btn-line" data-static>tune static</button>
                <input type="range" class="dial" min="87.5" max="108" step="0.1" value="97.3" data-dial aria-label="frequency" />
                <span class="mono" data-freq>97.3 MHz</span>
              </div>
            )}
            {name === 'visualizer' && (
              <div class="exp exp-viz">
                <canvas class="viz-canvas" data-viz-canvas aria-hidden="true" />
                <div class="exp-row">
                  <button type="button" class="btn-line" data-viz-mic>use microphone</button>
                  <div class="seg mono" data-viz-mode>
                    <button type="button" aria-pressed="true" data-mode="bars">bars</button>
                    <button type="button" aria-pressed="false" data-mode="ring">ring</button>
                    <button type="button" aria-pressed="false" data-mode="scope">scope</button>
                  </div>
                </div>
              </div>
            )}
            {name === 'random' && (
              <div class="exp exp-random">
                <div class="exp-row">
                  <button type="button" class="btn-line" data-random-go>take me somewhere →</button>
                </div>
              </div>
            )}
            {name === 'terminal' && (
              <div class="exp exp-term mono" data-term>
                <div class="term-out" data-term-out aria-live="polite" />
                <label class="term-line">
                  <span class="term-prompt">max@huismax ~ %</span>
                  <input type="text" data-term-in autocomplete="off" autocapitalize="off" spellcheck={false} aria-label="terminal input" />
                </label>
              </div>
            )}
            {name === 'guestbook' && (
              <div class="exp exp-guest" data-guestbook>
                <form class="guest-form" data-guest-form>
                  <input name="name" maxlength={32} placeholder="name" required aria-label="name" />
                  <input name="message" maxlength={140} placeholder="leave a line" required aria-label="message" />
                  <button type="submit" class="btn-line">sign →</button>
                </form>
                <p class="mono dim" data-guest-status />
                <ol class="guest-list mono" data-guest-list />
              </div>
            )}
            {name === '???' && (
              <div class="exp exp-secret" data-secret>
                <p class="mono dim" data-secret-hint>locked.</p>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  </div>
);
