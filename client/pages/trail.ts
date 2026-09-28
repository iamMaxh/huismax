import { $, $$, readJSON, reducedMotion } from '../lib/dom';
import type { PageInit } from '../main';

type Run = {
  name: string; location: string; date: string; distanceKm: number; gainM: number; time: string; note: string;
  route: { d: string; start: [number, number]; end: [number, number] };
  contours: string[];
  elevation: number[];
};

const fmt = (n: number) => n.toLocaleString('en-US');

export const initTrail: PageInit = (main, scope) => {
  const runs = readJSON<Run[]>('run-data', main) ?? [];
  const line = $<SVGPathElement>('[data-route-line]', main)!;
  const shadow = $<SVGPathElement>('[data-route-shadow]', main)!;
  const start = $<SVGCircleElement>('[data-route-start]', main)!;
  const runner = $<SVGCircleElement>('[data-route-runner]', main)!;
  const contours = $('[data-contours]', main)!;
  const elevWrap = $('[data-elev]', main)!;
  const area = $('[data-elev-area]', main)!;
  const eline = $('[data-elev-line]', main)!;
  const cursor = $('[data-elev-cursor]', main)!;
  const readout = $('[data-elev-readout]', main)!;
  const coord = $('[data-route-coord]', main)!;
  const rows = $$<HTMLButtonElement>('[data-run]', main);
  let run = runs[0];
  let pos = -1;

  elevWrap.tabIndex = 0;
  elevWrap.setAttribute('role', 'slider');
  elevWrap.setAttribute('aria-label', 'position along route');
  elevWrap.setAttribute('aria-valuemin', '0');

  const drawElevation = () => {
    const e = run.elevation;
    const min = Math.min(...e), max = Math.max(...e);
    const y = (v: number) => 130 - ((v - min) / (max - min || 1)) * 110;
    const pts = e.map((v, i) => `${((i / (e.length - 1)) * 800).toFixed(1)} ${y(v).toFixed(1)}`);
    eline.setAttribute('d', 'M' + pts.join('L'));
    area.setAttribute('d', 'M0 140L' + pts.join('L') + 'L800 140Z');
    elevWrap.setAttribute('aria-valuemax', String(run.distanceKm));
  };

  const animateLine = () => {
    if (reducedMotion()) return;
    line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1600, easing: 'cubic-bezier(.6,0,.2,1)' });
  };

  const select = (i: number) => {
    run = runs[i];
    rows.forEach((r, j) => r.setAttribute('aria-pressed', String(i === j)));
    line.setAttribute('d', run.route.d);
    shadow.setAttribute('d', run.route.d);
    start.setAttribute('cx', String(run.route.start[0]));
    start.setAttribute('cy', String(run.route.start[1]));
    contours.innerHTML = run.contours.map((d) => `<path d="${d}"/>`).join('');
    $('[data-route-name]', main)!.textContent = run.name;
    $('[data-route-date]', main)!.textContent = `${run.date} · ${run.location}`;
    $('[data-route-note]', main)!.textContent = run.note;
    $('[data-route-km]', main)!.textContent = String(run.distanceKm);
    $('[data-route-gain]', main)!.textContent = fmt(run.gainM);
    $('[data-route-time]', main)!.textContent = run.time;
    drawElevation();
    setPos(0);
    animateLine();
  };

  // Scrubbing the elevation profile moves the runner along the map line.
  const setPos = (t: number) => {
    pos = Math.min(1, Math.max(0, t));
    const len = line.getTotalLength();
    const p = line.getPointAtLength(pos * len);
    runner.setAttribute('cx', String(p.x));
    runner.setAttribute('cy', String(p.y));
    cursor.setAttribute('x1', String(pos * 800));
    cursor.setAttribute('x2', String(pos * 800));
    const e = run.elevation[Math.round(pos * (run.elevation.length - 1))];
    const km = (pos * run.distanceKm).toFixed(1);
    readout.textContent = `km ${km} · ${fmt(e)} m`;
    coord.textContent = `km ${km} / ${run.distanceKm}`;
    elevWrap.setAttribute('aria-valuenow', km);
    elevWrap.setAttribute('aria-valuetext', `kilometre ${km}, ${e} metres`);
  };

  scope.on(elevWrap, 'pointermove', (e: PointerEvent) => {
    const r = elevWrap.getBoundingClientRect();
    setPos((e.clientX - r.left) / r.width);
    elevWrap.classList.add('scrub');
  });
  scope.on(elevWrap, 'pointerleave', () => elevWrap.classList.remove('scrub'));
  scope.on(elevWrap, 'keydown', (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowLeft' ? -0.02 : 0;
    if (!d) return;
    e.preventDefault();
    setPos(pos + d);
    elevWrap.classList.add('scrub');
  });

  scope.on(main, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-run]');
    if (b) select(Number(b.dataset.run));
  });
  scope.on($('.log-list', main)!, 'keydown', (e: KeyboardEvent) => {
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length].focus();
  });

  drawElevation();
  setPos(0);
  // draw the first route when the map scrolls into view
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting) {
      animateLine();
      io.disconnect();
    }
  }, { threshold: 0.3 });
  io.observe(line);
  scope.add(() => io.disconnect());
};
