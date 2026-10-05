import type { Item } from '../../lib/cms';
import { RANGES } from '../../lib/homelab-types';
import { PageHead } from '../components/head';

/**
 * /homelab and /homelab/:id. The server renders the frame; client/pages/homelab.ts fills it from /api/homelab
 * (the Monitoring API through the worker, or demo data) and keeps it current. The self-hosted sites come from /admin.
 */

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The verdict, what it's based on, and what's wrong, if anything. */
const Overall = ({ label }: { label: string }) => (
  <section class="hl-overall" aria-label={label} data-hl-overall data-health="loading">
    <p class="hl-verdict" aria-live="polite">
      <span class="hl-mark" aria-hidden="true" /> <span data-hl-verdict>checking the servers</span>
    </p>
    <p class="hl-meta mono" data-hl-meta />
    <ul class="hl-issues mono" data-hl-issues />
    <dl class="hl-stats" data-hl-stats>
      {['cpu', 'memory', 'storage', 'network', 'containers', 'uptime'].map((k) => (
        <div class="hl-stat is-skeleton">
          <dt class="mono">{k}</dt>
          <dd>
            <span class="hl-stat-value">—</span>
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

const Banner = () => <p class="hl-banner mono" data-hl-banner hidden />;

export const Homelab = ({ intro, sites }: { intro: string; sites: Item[] }) => (
  <div class="homelab" data-homelab>
    <PageHead crumb="homelab" title="Homelab" intro={intro} class="homelab-head" />
    <Banner />
    <Overall label="overall status" />

    {sites.length > 0 && (
      <section class="hl-section" aria-labelledby="hl-sites-h">
        <h2 class="section-label mono" id="hl-sites-h">
          self-hosted
        </h2>
        <ul class="hl-sites">
          {sites.map((x) => (
            <li>
              <a class="hl-site" href={s(x.url)} target="_blank" rel="noopener noreferrer" data-hl-site={s(x.id)}>
                <span class="hl-site-name">{s(x.name)}</span>
                <span class="hl-site-host mono">
                  {host(s(x.url))} <span aria-hidden="true">↗</span>
                </span>
                {s(x.description) && <span class="hl-site-desc">{s(x.description)}</span>}
                <span class="hl-site-state mono" data-hl-site-state>
                  checking
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    )}

    <section class="hl-section" aria-labelledby="hl-servers-h">
      <h2 class="section-label mono" id="hl-servers-h">
        servers <span class="dim" data-hl-count />
      </h2>
      <div class="hl-grid" data-hl-servers>
        {[0, 1, 2].map(() => (
          <div class="hl-card is-skeleton" aria-hidden="true" />
        ))}
      </div>
    </section>

    <section class="hl-section" aria-labelledby="hl-docker-h">
      <h2 class="section-label mono" id="hl-docker-h">
        containers <span class="dim" data-hl-ccount />
      </h2>
      <div class="hl-table-wrap" data-hl-containers />
    </section>
  </div>
);

const Chart = ({ id, title, legend }: { id: string; title: string; legend?: boolean }) => (
  <figure class="hl-chart">
    <figcaption class="hl-chart-head">
      <span class="hl-chart-title mono">{title}</span>
      <span class="hl-chart-now" data-now={id}>
        —
      </span>
      {legend && (
        <span class="hl-legend mono" aria-hidden="true">
          <span>
            <i class="chart-key" /> in
          </span>
          <span>
            <i class="chart-key is-dashed" /> out
          </span>
        </span>
      )}
    </figcaption>
    <div class="hl-plot" data-plot={id} />
  </figure>
);

export const HomelabServer = ({ id }: { id: string }) => (
  <div class="homelab hl-detail" data-homelab data-hl-server={id}>
    <PageHead
      crumb={
        <>
          <a href="/homelab">homelab</a> <span aria-hidden="true">/</span> {id}
        </>
      }
      title={<span data-hl-name>{id}</span>}
      class="homelab-head"
    >
      <p class="hl-role mono" data-hl-role />
    </PageHead>
    <Banner />
    <Overall label="status" />

    <div data-hl-body>
      <section class="hl-section" aria-labelledby="hl-history-h">
        <div class="section-row">
          <h2 class="section-label mono" id="hl-history-h">
            history <span class="dim" data-hl-history-note />
          </h2>
          <div class="seg" role="group" aria-label="time range">
            {RANGES.map((r) => (
              <button type="button" data-range={r} aria-pressed={r === '1h' ? 'true' : 'false'}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div class="hl-charts" data-hl-charts>
          <Chart id="cpu" title="cpu" />
          <Chart id="memory" title="memory" />
          <Chart id="network" title="network" legend />
        </div>
      </section>

      <div class="hl-cols">
        <section class="hl-section" aria-labelledby="hl-storage-h">
          <h2 class="section-label mono" id="hl-storage-h">
            storage
          </h2>
          <ul class="hl-disks" data-hl-storage />
        </section>
        <section class="hl-section" aria-labelledby="hl-net-h">
          <h2 class="section-label mono" id="hl-net-h">
            network
          </h2>
          <div class="hl-table-wrap" data-hl-ifaces />
        </section>
      </div>

      <section class="hl-section" aria-labelledby="hl-docker-h">
        <h2 class="section-label mono" id="hl-docker-h">
          containers <span class="dim" data-hl-ccount />
        </h2>
        <div class="hl-table-wrap" data-hl-containers />
      </section>

      <section class="hl-section" aria-labelledby="hl-system-h">
        <h2 class="section-label mono" id="hl-system-h">
          system information
        </h2>
        <dl class="hl-system" data-hl-system />
      </section>
    </div>
  </div>
);
