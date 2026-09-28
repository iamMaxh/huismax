import type { LiveStatus } from '../../lib/live';
import { LiveMark } from './live';

/**
 * Persistent bottom player. Lives outside <main> so the client router never re-renders it,
 * which keeps audio playing across page changes.
 */
export const AudioBar = ({ live }: { live: LiveStatus }) => (
  <aside class="audiobar" data-audiobar data-state={live.isLive ? 'live' : 'idle'} aria-label="player">
    <div class="audiobar-inner">
      <LiveMark live={live} />
      <a class="audiobar-channel" href="/dj">huismax dj channel</a>
      <span class="audiobar-title" data-player-title>{live.sessionTitle ?? ''}</span>
      <div class="audiobar-progress" data-player-progress hidden>
        <span data-player-time>0:00</span>
        <div class="bar"><div class="bar-fill" data-player-fill /></div>
      </div>
      <canvas class="audiobar-viz" data-player-viz width="120" height="24" aria-hidden="true" />
      <button class="audiobar-btn" type="button" data-player-toggle aria-pressed="false">
        <span data-player-btn-label>listen</span> <span aria-hidden="true">→</span>
      </button>
    </div>
  </aside>
);
