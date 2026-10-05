import type { Scope } from './dom';

/**
 * Line charts for /homelab, drawn as SVG in the site's own ink: 2px lines in --fg with a faint wash under single
 * series, hairline gridlines, one y-axis. Two series are told apart by line style (solid / dashed) and a legend,
 * never by colour alone. A crosshair snaps to the nearest point and the tooltip lists every series there; arrow keys
 * do the same from the keyboard. The svg carries a one-line summary for screen readers.
 */

export type Series = { label: string; values: (number | null)[]; dashed?: boolean };
export type ChartData = {
  times: number[];
  series: Series[];
  /** fixed top of the scale (100 for percentages); otherwise a round number above the data */
  max?: number;
  /** a value as the tooltip shows it, and as the axis does */
  format: (v: number) => string;
  axis: (v: number) => string;
  /** for screen readers: what the chart is */
  name: string;
};

const NS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** 1, 2, 2.5 or 5 × 10ⁿ: the round number at or above `v`. */
export function niceCeil(v: number) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function tickTime(t: number, span: number) {
  const d = new Date(t);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return span > 2 * 86_400_000 ? `${DAYS[d.getDay()]} ${d.getDate()}` : hm;
}
const fullTime = (t: number, span: number) => {
  const d = new Date(t);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return span > 86_400_000 ? `${DAYS[d.getDay()]} ${d.getDate()}, ${hm}` : hm;
};

/** Path through the points, lifting the pen over gaps (null values). */
function line(xs: number[], ys: (number | null)[]) {
  let d = '', pen = false;
  ys.forEach((y, i) => {
    if (y === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${xs[i].toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

function summary(data: ChartData) {
  return data.series
    .map((s) => {
      const v = s.values.filter((x): x is number => x !== null);
      if (!v.length) return `${s.label}: no data`;
      const avg = v.reduce((a, b) => a + b, 0) / v.length;
      return `${s.label}: now ${data.format(v[v.length - 1])}, average ${data.format(avg)}, peak ${data.format(Math.max(...v))}`;
    })
    .join('; ');
}

/** Draws into `host` (keeps its height from CSS) and redraws on resize. `update` swaps the data in place. */
export function lineChart(host: HTMLElement, scope: Scope, first: ChartData) {
  let data = first;
  let at = -1; // the point the crosshair is on
  host.classList.add('chart');
  host.tabIndex = 0;
  const tip = document.createElement('div');
  tip.className = 'chart-tip mono';
  tip.hidden = true;
  let geo: { xs: number[]; y: (v: number) => number; left: number; right: number; top: number; bottom: number } | null = null;
  let cross: SVGLineElement | null = null;
  let dots: SVGCircleElement[] = [];

  const draw = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const all = data.series.flatMap((s) => s.values).filter((x): x is number => x !== null);
    const max = data.max ?? niceCeil(Math.max(0, ...all) * 1.1);
    const left = 44, right = w - 10, top = 8, bottom = h - 24;
    const t0 = data.times[0] ?? 0, t1 = data.times[data.times.length - 1] ?? 1;
    const span = Math.max(1, t1 - t0);
    const xs = data.times.map((t) => left + ((t - t0) / span) * (right - left));
    const y = (v: number) => bottom - (Math.min(v, max) / max) * (bottom - top);
    geo = { xs, y, left, right, top, bottom };

    const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `${data.name}. ${summary(data)}` });
    // gridlines and the scale: 0, half, top
    for (const f of [0, 0.5, 1]) {
      const gy = y(max * f);
      root.append(svg('line', { x1: left, x2: right, y1: gy, y2: gy, class: 'chart-grid' }));
      const label = svg('text', { x: left - 8, y: gy + 3.5, class: 'chart-axis', 'text-anchor': 'end' });
      label.textContent = data.axis(max * f);
      root.append(label);
    }
    // four times along the bottom
    for (let i = 0; i < 4 && data.times.length > 1; i++) {
      const t = t0 + (span * i) / 3;
      const label = svg('text', { x: left + ((right - left) * i) / 3, y: h - 6, class: 'chart-axis', 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle' });
      label.textContent = tickTime(t, span);
      root.append(label);
    }
    const single = data.series.length === 1;
    for (const s of data.series) {
      const ys = s.values.map((v) => (v === null ? null : y(v)));
      const d = line(xs, ys);
      if (!d) continue;
      // a single series gets a faint wash down to the baseline, under each unbroken run
      if (single) {
        const runs = d.split('M').filter(Boolean).map((r) => {
          const pts = r.split('L');
          const firstX = pts[0].split(' ')[0], lastX = pts[pts.length - 1].split(' ')[0];
          return `M${firstX} ${bottom}L${r}L${lastX} ${bottom}Z`;
        });
        root.append(svg('path', { d: runs.join(''), class: 'chart-area' }));
      }
      root.append(svg('path', { d, class: `chart-line${s.dashed ? ' is-dashed' : ''}` }));
      // the latest value, marked
      const last = ys.length - 1 - [...ys].reverse().findIndex((v) => v !== null);
      if (last < ys.length && ys[last] !== null) root.append(svg('circle', { cx: xs[last], cy: ys[last]!, r: 3.5, class: 'chart-end' }));
    }
    cross = svg('line', { y1: top, y2: bottom, class: 'chart-cross', visibility: 'hidden' });
    root.append(cross);
    dots = data.series.map(() => {
      const c = svg('circle', { r: 4, class: 'chart-dot', visibility: 'hidden' });
      root.append(c);
      return c;
    });
    host.replaceChildren(root, tip);
    if (at >= 0) show(at);
  };

  const show = (i: number) => {
    if (!geo || !data.times.length || !cross) return;
    at = Math.max(0, Math.min(data.times.length - 1, i));
    const x = geo.xs[at];
    cross.setAttribute('x1', String(x));
    cross.setAttribute('x2', String(x));
    cross.setAttribute('visibility', 'visible');
    const span = data.times[data.times.length - 1] - data.times[0];
    const rows = data.series.map((s, k) => {
      const v = s.values[at];
      const dot = dots[k];
      if (v === null || v === undefined) dot.setAttribute('visibility', 'hidden');
      else {
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(geo!.y(v)));
        dot.setAttribute('visibility', 'visible');
      }
      const row = document.createElement('span');
      row.className = 'chart-tip-row';
      const key = document.createElement('i');
      key.className = `chart-key${s.dashed ? ' is-dashed' : ''}`;
      const value = document.createElement('b');
      value.textContent = v === null || v === undefined ? '—' : data.format(v);
      const label = document.createElement('span');
      label.textContent = s.label;
      row.append(key, value, label);
      return row;
    });
    const when = document.createElement('span');
    when.className = 'chart-tip-time';
    when.textContent = fullTime(data.times[at], span);
    tip.replaceChildren(when, ...rows);
    tip.hidden = false;
    // beside the crosshair, flipping sides near the right edge
    const flip = x > host.clientWidth * 0.6;
    tip.style.left = flip ? '' : `${x + 12}px`;
    tip.style.right = flip ? `${host.clientWidth - x + 12}px` : '';
  };
  const hide = () => {
    at = -1;
    tip.hidden = true;
    cross?.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  };
  const nearest = (clientX: number) => {
    if (!geo || !geo.xs.length) return -1;
    const x = clientX - host.getBoundingClientRect().left;
    let best = 0;
    geo.xs.forEach((gx, i) => Math.abs(gx - x) < Math.abs(geo!.xs[best] - x) && (best = i));
    return best;
  };

  scope.on(host, 'pointermove', (e: PointerEvent) => show(nearest(e.clientX)));
  scope.on(host, 'pointerleave', hide);
  scope.on(host, 'focus', () => show(at >= 0 ? at : data.times.length - 1));
  scope.on(host, 'blur', hide);
  scope.on(host, 'keydown', (e: KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'Home' ? -1e9 : e.key === 'End' ? 1e9 : 0;
    if (!step) return;
    e.preventDefault();
    show((at >= 0 ? at : data.times.length - 1) + step);
  });
  const ro = new ResizeObserver(draw);
  ro.observe(host);
  scope.add(() => ro.disconnect());
  draw();

  return {
    update(next: ChartData) {
      data = next;
      if (at >= data.times.length) at = -1;
      draw();
    },
  };
}

/** A small trend line (a card's last hour), 0–max, with a faint wash under it. */
export function sparkline(values: number[], max = 100) {
  const w = 120, h = 28;
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', class: 'spark', 'aria-hidden': 'true' });
  if (values.length < 2) return root;
  const xs = values.map((_, i) => (i / (values.length - 1)) * (w - 4) + 2);
  const ys = values.map((v) => h - 2 - (Math.min(v, max) / max) * (h - 4));
  const d = line(xs, ys);
  root.append(svg('path', { d: `${d}L${xs[xs.length - 1]} ${h}L${xs[0]} ${h}Z`, class: 'spark-area' }));
  root.append(svg('path', { d, class: 'spark-line' }));
  return root;
}
