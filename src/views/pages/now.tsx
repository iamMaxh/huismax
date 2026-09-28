import type { Item } from '../../lib/cms';
import type { Presence } from '../../lib/presence';
import { PageHead } from '../components/head';
import { Listening } from '../components/listening';

const since = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** "right now" comes from the admin status, "listening" from Spotify; everything between is the /admin list, as is. */
export const Now = ({ presence, items, intro }: { presence: Presence; items: Item[]; intro: string }) => (
  <div class="now-page">
    <PageHead crumb="now" title="Now" intro={intro} class="now-head" />
    <dl class="now-list">
      <div class="now-item">
        <dt class="mono">right now</dt>
        <dd data-presence-status>{presence.status}</dd>
      </div>
      {items.map((n) => (
        <div class="now-item">
          <dt class="mono">{s(n.label)}</dt>
          <dd>
            {s(n.url) ? (
              <a class="now-link" href={s(n.url)} target="_blank" rel="noopener noreferrer">
                {s(n.text)} <span class="ext" aria-hidden="true">↗</span>
              </a>
            ) : (
              s(n.text)
            )}
          </dd>
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
