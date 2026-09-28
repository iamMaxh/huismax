import { runs } from '../../data/runs';
import { contours, elevation, MAP_H, MAP_W, routePath } from '../../lib/route';
import { Data, PageHead } from '../components/head';

const fmt = (n: number) => n.toLocaleString('en-US');

export const Trail = () => {
  const data = runs.map((r) => ({ ...r, route: routePath(r.seed), contours: contours(r.seed), elevation: elevation(r.seed, r.gainM) }));
  const first = data[0];
  const totals = {
    km: runs.reduce((s, r) => s + r.distanceKm, 0),
    gain: runs.reduce((s, r) => s + r.gainM, 0),
  };

  return (
    <div class="trail-page">
      <PageHead crumb="03 — trail runner" title="Trail runner" class="trail-head">
        <dl class="stats mono">
          <div><dt>distance</dt><dd>{totals.km.toFixed(1)} <small>km</small></dd></div>
          <div><dt>climbed</dt><dd>{fmt(totals.gain)} <small>m</small></dd></div>
          <div><dt>runs</dt><dd>{runs.length}</dd></div>
        </dl>
      </PageHead>

      <section class="trail-stage" aria-label="selected route">
        <div class="map-wrap">
          <svg class="route-map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`route map of ${first.name}`} data-route-map>
            <g class="contours" data-contours>
              {first.contours.map((d) => <path d={d} />)}
            </g>
            <path class="route-shadow" d={first.route.d} data-route-shadow />
            <path class="route-line" d={first.route.d} data-route-line pathLength="1" />
            <circle class="route-start" r="5" cx={first.route.start[0]} cy={first.route.start[1]} data-route-start />
            <circle class="route-runner" r="4" cx={first.route.start[0]} cy={first.route.start[1]} data-route-runner />
          </svg>
          <div class="map-meta mono">
            <span data-route-coord>km 0.0 / {first.distanceKm}</span>
            <span>1 : 25 000</span>
          </div>
        </div>

        <div class="route-info">
          <p class="mono dim" data-route-date>{first.date} · {first.location}</p>
          <h2 class="route-name" data-route-name>{first.name}</h2>
          <p class="route-note" data-route-note>{first.note}</p>
          <dl class="route-stats mono">
            <div><dt>km</dt><dd data-route-km>{first.distanceKm}</dd></div>
            <div><dt>↑ m</dt><dd data-route-gain>{fmt(first.gainM)}</dd></div>
            <div><dt>time</dt><dd data-route-time>{first.time}</dd></div>
          </dl>
        </div>

        <div class="elev-wrap" data-elev>
          <svg class="elev" viewBox="0 0 800 140" preserveAspectRatio="none" aria-hidden="true">
            <path class="elev-area" data-elev-area />
            <path class="elev-line" data-elev-line />
            <line class="elev-cursor" data-elev-cursor x1="0" x2="0" y1="0" y2="140" />
          </svg>
          <div class="elev-readout mono" data-elev-readout>elevation</div>
        </div>
      </section>

      <section class="trail-log" aria-label="log">
        <h2 class="section-label mono">log</h2>
        <ol class="log-list">
          {runs.map((r, i) => (
            <li>
              <button type="button" class="log-row" data-run={i} aria-pressed={i === 0 ? 'true' : 'false'}>
                <span class="mono dim">{r.date}</span>
                <span class="log-name">{r.name}</span>
                <span class="mono dim">{r.location}</span>
                <span class="mono">{r.distanceKm} km</span>
                <span class="mono">↑ {fmt(r.gainM)}</span>
                <span class="mono dim">{r.time}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <Data id="run-data" value={data} />
    </div>
  );
};
