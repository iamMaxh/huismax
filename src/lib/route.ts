import { rng } from './seed';

export const MAP_W = 800;
export const MAP_H = 520;

type Pt = [number, number];

const toPath = (pts: Pt[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** Placeholder route: a wandering line (or loop) generated from a seed. Swap for projected GPX points later. */
export function routePath(seed: number): { d: string; start: Pt; end: Pt } {
  const r = rng(seed * 104729);
  const loop = seed % 2 === 0;
  const harmonics = Array.from({ length: 4 }, (_, k) => ({ a: (0.05 + r() * 0.16) / (k + 1), p: r() * Math.PI * 2, k: k + 2 }));
  const n = 180;
  const pts: Pt[] = [];
  const cx = MAP_W / 2, cy = MAP_H / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (loop) {
      const th = t * Math.PI * 2;
      const rad = 1 + harmonics.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.p), 0);
      pts.push([cx + Math.cos(th) * 250 * rad, cy + Math.sin(th) * 170 * rad]);
    } else {
      const x = 90 + t * (MAP_W - 180);
      const y = cy + harmonics.reduce((s, h) => s + h.a * 420 * Math.sin(h.k * t * Math.PI + h.p), 0);
      pts.push([x, y]);
    }
  }
  return { d: toPath(pts), start: pts[0], end: pts[pts.length - 1] };
}

/** Topographic rings around a few random peaks. Pure decoration, but tied to the route seed. */
export function contours(seed: number): string[] {
  const r = rng(seed * 7717);
  const out: string[] = [];
  for (let c = 0; c < 3; c++) {
    const cx = 80 + r() * (MAP_W - 160), cy = 60 + r() * (MAP_H - 120);
    const wob = Array.from({ length: 3 }, (_, k) => ({ a: 0.04 + r() * 0.1, p: r() * 6.28, k: k + 2 }));
    for (let ring = 1; ring <= 7; ring++) {
      const R = ring * (18 + r() * 8);
      const pts: Pt[] = [];
      for (let i = 0; i <= 72; i++) {
        const th = (i / 72) * Math.PI * 2;
        const rad = R * (1 + wob.reduce((s, w) => s + w.a * Math.sin(w.k * th + w.p + ring * 0.3), 0));
        pts.push([cx + Math.cos(th) * rad * 1.3, cy + Math.sin(th) * rad]);
      }
      out.push(toPath(pts) + 'Z');
    }
  }
  return out;
}

/** Elevation samples (metres) along the route; total positive gain roughly matches `gainM`. */
export function elevation(seed: number, gainM: number, samples = 120): number[] {
  const r = rng(seed * 3571);
  const base = 40 + Math.round(r() * 900);
  const waves = Array.from({ length: 5 }, (_, k) => ({ a: r() / (k + 1), f: (k + 1) * (0.6 + r()), p: r() * 6.28 }));
  const raw = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1);
    return waves.reduce((s, w) => s + w.a * Math.sin(w.f * t * Math.PI * 2 + w.p), 0) + (r() - 0.5) * 0.04;
  });
  let gain = 0;
  for (let i = 1; i < raw.length; i++) gain += Math.max(0, raw[i] - raw[i - 1]);
  const scale = gainM / (gain || 1);
  const min = Math.min(...raw);
  return raw.map((v) => Math.round(base + (v - min) * scale));
}
