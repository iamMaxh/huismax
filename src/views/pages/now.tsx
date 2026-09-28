import { now } from '../../data/now';
import type { Presence } from '../../lib/presence';
import { PageHead } from '../components/head';
import { Listening } from '../components/listening';

const since = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export const Now = ({ presence }: { presence: Presence }) => (
  <div class="now-page">
    <PageHead crumb="now" title="Now" class="now-head" />
    <dl class="now-list">
      <div class="now-item">
        <dt class="mono">right now</dt>
        <dd data-presence-status>{presence.status}</dd>
      </div>
      {now.map((n) => (
        <div class="now-item">
          <dt class="mono">{n.key}</dt>
          <dd>{n.value}</dd>
        </div>
      ))}
      <div class="now-item">
        <dt class="mono">listening</dt>
        <dd>
          <Listening />
          <span class="mono dim" data-listening-fallback>—</span>
        </dd>
      </div>
    </dl>
    {since(presence.updatedAt) && <p class="now-updated mono dim">updated {since(presence.updatedAt)}</p>}
  </div>
);
