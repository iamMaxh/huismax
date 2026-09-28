import type { LiveStatus } from '../../lib/live';

/** Status mark kept in sync client-side via [data-live-mark]. */
export const LiveMark = ({ live, class: cls = '' }: { live: LiveStatus; class?: string }) => (
  <span class={`live-mark ${cls}`} data-live-mark data-live={live.isLive ? 'on' : 'off'}>
    <span class="live-dot" aria-hidden="true" />
    <span data-live-label>{live.label}</span>
  </span>
);
