import type { LiveStatus } from '../../lib/live';

/** Status mark kept in sync client-side via [data-live-mark]. It only ever says LIVE; off air it is hidden and empty. */
export const LiveMark = ({ live, class: cls = '' }: { live: LiveStatus; class?: string }) => (
  <span class={`live-mark ${cls}`} data-live-mark data-live={live.isLive ? 'on' : 'off'}>
    <span class="live-dot" aria-hidden="true" />
    <span data-live-label>{live.isLive ? 'LIVE' : ''}</span>
  </span>
);
