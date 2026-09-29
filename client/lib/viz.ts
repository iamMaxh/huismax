import { player } from './player';

/**
 * Stand-in spectrum used while something plays but its audio can't be read (a stream without CORS):
 * a slow, breathing shape. Energy 0 is flat: nothing moves until something plays.
 */
export function synthSpectrum(out: Uint8Array, t: number, energy: number) {
  const n = out.length;
  const beat = Math.pow(Math.max(0, Math.sin(t * 0.0042)), 8); // ~ 80 bpm pulse
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const base = Math.exp(-x * 3.2) * 0.9 + 0.1;
    const wobble =
      0.5 + 0.25 * Math.sin(t * 0.0011 + i * 0.37) + 0.15 * Math.sin(t * 0.0023 - i * 0.11) + 0.1 * Math.sin(t * 0.0051 + i * 1.7);
    const v = base * wobble * (0.55 + beat * 0.45 * (1 - x)) * energy;
    out[i] = Math.max(0, Math.min(255, v * 255));
  }
}

/** Reads the player if it is producing sound, otherwise the synthetic signal. */
export function readSpectrum(out: Uint8Array, t: number, energy: number) {
  if (!player.spectrum(out)) synthSpectrum(out, t, energy);
}

export function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8Array, color: string, opts: { mirror?: boolean; gap?: number } = {}) {
  const n = data.length;
  const gap = opts.gap ?? 2;
  const bw = Math.max(1, w / n - gap);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const v = data[i] / 255;
    const bh = Math.max(1, v * (opts.mirror ? h / 2 : h));
    const x = i * (w / n);
    if (opts.mirror) ctx.fillRect(x, h / 2 - bh, bw, bh * 2);
    else ctx.fillRect(x, h - bh, bw, bh);
  }
}
