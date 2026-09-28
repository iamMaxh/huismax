import { $, $$, cssVar, fitCanvas, reducedMotion } from '../lib/dom';
import { live } from '../lib/live';
import { player } from '../lib/player';
import { readSpectrum } from '../lib/viz';
import type { PageInit } from '../main';

type Mood = 'none' | 'photo' | 'dj' | 'trail' | 'code';
const moods: Mood[] = ['none', 'photo', 'dj', 'trail', 'code'];
const GLYPHS = '01{}[]<>/\\=+*;:._-~$#&|?!abcdefmx';

export const initHome: PageInit = (main, scope) => {
  const hero = $('.home-hero', main)!;
  const canvas = $<HTMLCanvasElement>('[data-mood-canvas]', main)!;
  const caption = $('[data-mood-caption]', main)!;
  const links = $$<HTMLAnchorElement>('[data-mood-key]', main);
  const { ctx, size } = fitCanvas(canvas, scope);

  let target: Mood = 'none';
  const weight: Record<Mood, number> = { none: 1, photo: 0, dj: 0, trail: 0, code: 0 };
  const pointer = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };
  let fg = cssVar('--fg');
  scope.on(window, 'themechange', () => (fg = cssVar('--fg')));

  /* ——— caption typewriter ——— */
  let typeTimer = 0;
  const typeCaption = (text: string) => {
    clearInterval(typeTimer);
    if (reducedMotion()) return void (caption.textContent = text);
    let i = 0;
    caption.textContent = '';
    typeTimer = window.setInterval(() => {
      caption.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 22);
  };
  scope.add(() => clearInterval(typeTimer));

  const setMood = (m: Mood, text = '') => {
    target = m;
    if (fine) wake();
    hero.dataset.mood = m;
    typeCaption(text);
    if (reducedMotion() && fine) {
      moods.forEach((k) => (weight[k] = k === m ? 1 : 0));
      render(performance.now());
    }
  };

  for (const a of links) {
    const m = a.dataset.moodKey as Mood;
    scope.on(a, 'pointerenter', () => setMood(m, a.dataset.caption));
    scope.on(a, 'focus', () => setMood(m, a.dataset.caption));
    scope.on(a, 'pointerleave', () => document.activeElement !== a && setMood('none'));
    scope.on(a, 'blur', () => setMood('none'));
  }

  // ↑/↓ between identities, 1–4 to jump.
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, dialog[open]')) return;
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (i < 0 && e.key === 'ArrowUp') return;
      e.preventDefault();
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    } else if (/^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      links[Number(e.key) - 1]?.focus();
    }
  });

  // Touch devices and reduced motion get no pointer effects at all: no canvas, no loop.
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) {
    canvas.hidden = true;
    return;
  }

  scope.on(hero, 'pointermove', (e: PointerEvent) => {
    const r = hero.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = (e.clientY - r.top) / r.height;
    lastMove = performance.now();
    wake();
  });
  scope.on(hero, 'pointerleave', () => {
    lastMove = performance.now();
    wake();
  });

  /* ——— mood layers ——— */
  const spectrum = new Uint8Array(64);
  // Recent pointer positions, each fading out: dots near the path lift and drift, leaving a soft wake.
  const trail: { x: number; y: number; e: number }[] = [];
  const SIGMA = 70;
  let lastMove = 0;
  const drops = Array.from({ length: 64 }, () => ({ y: Math.random(), v: 0.2 + Math.random() * 0.8, g: 0 }));

  const layers: Record<Mood, (t: number, a: number) => void> = {
    // quiet dot grid
    // dot field that responds to the pointer's recent path
    none(_t, a) {
      const step = 26;
      ctx.fillStyle = fg;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of trail) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      const pad = SIGMA * 3, inv = 1 / (2 * SIGMA * SIGMA);
      const head = trail[trail.length - 1];
      for (let x = step / 2; x < size.w; x += step) {
        for (let y = step / 2; y < size.h; y += step) {
          let inf = 0;
          if (trail.length && x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad) {
            for (const p of trail) {
              const dx = x - p.x, dy = y - p.y;
              inf += p.e * Math.exp(-(dx * dx + dy * dy) * inv);
            }
            inf = Math.min(1, inf * 0.35);
          }
          if (inf < 0.01) {
            ctx.globalAlpha = a * 0.14;
            ctx.fillRect(x, y, 1, 1);
            continue;
          }
          const dx = x - head.x, dy = y - head.y, d = Math.hypot(dx, dy) || 1;
          const push = inf * 7;
          const r = 1 + inf * 1.2;
          ctx.globalAlpha = a * (0.14 + inf * 0.5);
          ctx.fillRect(x + (dx / d) * push - r / 2, y + (dy / d) * push - r / 2, r, r);
        }
      }
    },
    // viewfinder: thirds, crop corners, drifting focus box
    photo(t, a) {
      const { w, h } = size;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      ctx.globalAlpha = a * 0.12;
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h);
        ctx.moveTo(0, h * f); ctx.lineTo(w, h * f);
      }
      ctx.stroke();
      const m = Math.min(w, h) * 0.06, L = 26;
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath();
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
        ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y);
      }
      ctx.stroke();
      const fx = pointer.sx * w, fy = pointer.sy * h, s = 38 + Math.sin(t * 0.004) * 3;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeRect(fx - s, fy - s * 0.7, s * 2, s * 1.4);
      ctx.fillStyle = fg;
      ctx.globalAlpha = a * 0.45;
      ctx.font = '11px "Geist Mono", monospace';
      ctx.fillText('AF · f/1.7 · 1/60', fx - s, fy + s * 0.7 + 16);
    },
    // stacked waveforms, driven by the real player when audio is playing
    dj(t, a) {
      const energy = player.state().status === 'playing' ? 1 : live.get().isLive ? 0.8 : 0.5;
      readSpectrum(spectrum, t, energy);
      const { w, h } = size;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      const lines = 9;
      for (let l = 0; l < lines; l++) {
        ctx.globalAlpha = a * (0.08 + (l / lines) * 0.3);
        ctx.beginPath();
        const yBase = h * (0.25 + (l / lines) * 0.6);
        for (let x = 0; x <= w; x += 6) {
          const i = Math.floor((x / w) * spectrum.length * 0.7);
          const amp = (spectrum[i] / 255) * 60 * (1 - Math.abs(x / w - pointer.sx) * 0.8);
          const y = yBase + Math.sin(x * 0.012 + t * 0.002 + l * 0.6) * amp;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    },
    // contour rings + an elevation line being drawn
    trail(t, a) {
      const { w, h } = size;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      const cx = w * (0.62 + (pointer.sx - 0.5) * 0.06), cy = h * (0.45 + (pointer.sy - 0.5) * 0.06);
      for (let r = 1; r <= 9; r++) {
        ctx.globalAlpha = a * 0.1;
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const th = (i / 90) * Math.PI * 2;
          const rad = r * 34 * (1 + 0.12 * Math.sin(3 * th + r * 0.4) + 0.07 * Math.sin(5 * th - r));
          const x = cx + Math.cos(th) * rad * 1.5, y = cy + Math.sin(th) * rad;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      const progress = ((t * 0.00012) % 1.2);
      ctx.globalAlpha = a * 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const end = Math.min(1, progress) * w;
      let py = 0;
      for (let x = 0; x <= end; x += 4) {
        const u = x / w;
        py = h * 0.82 - (Math.sin(u * 7.1) * 0.5 + Math.sin(u * 2.3 + 1) * 0.8 + Math.sin(u * 17) * 0.1 + 1.3) * h * 0.08;
        x ? ctx.lineTo(x, py) : ctx.moveTo(x, py);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = fg;
      ctx.arc(end, py, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    // sparse glyph rain on a mono grid
    code(t, a) {
      const cell = 18;
      const cols = Math.ceil(size.w / cell);
      ctx.font = '12px "Geist Mono", monospace';
      ctx.fillStyle = fg;
      for (let c = 0; c < Math.min(cols, drops.length); c++) {
        const d = drops[c];
        d.y += d.v * 0.004;
        if (d.y > 1.1) Object.assign(d, { y: -0.1, v: 0.2 + Math.random() * 0.8 });
        const x = (c * cols / drops.length | 0) * cell;
        for (let k = 0; k < 10; k++) {
          const y = (d.y - k * 0.025) * size.h;
          const near = 1 - Math.min(1, Math.hypot(x / size.w - pointer.sx, y / size.h - pointer.sy) * 2);
          ctx.globalAlpha = a * (k === 0 ? 0.7 : (0.3 * (1 - k / 10))) * (0.4 + near * 0.6);
          const g = GLYPHS[(c * 7 + k * 13 + Math.floor(t / 180)) % GLYPHS.length];
          ctx.fillText(g, x, y);
        }
      }
      ctx.globalAlpha = a * 0.6;
      ctx.fillText(Math.floor(t / 530) % 2 ? '▮' : ' ', pointer.sx * size.w, pointer.sy * size.h);
    },
  };

  function render(t: number, dt = 16) {
    const k = 1 - Math.pow(0.001, dt / 1000 * 1.6);
    const inside = t - lastMove < 1500 && pointer.x >= 0 && pointer.x <= 1 && pointer.y >= 0 && pointer.y <= 1;
    for (const p of trail) p.e *= 0.93;
    while (trail.length && trail[0].e < 0.02) trail.shift();
    if (inside) {
      const px = pointer.sx * size.w, py = pointer.sy * size.h, last = trail[trail.length - 1];
      if (!last || Math.hypot(px - last.x, py - last.y) > 6) trail.push({ x: px, y: py, e: 1 });
      if (trail.length > 24) trail.shift();
    }
    for (const m of moods) weight[m] += ((m === target ? 1 : 0) - weight[m]) * (reducedMotion() ? 1 : k * 3);
    pointer.sx += (pointer.x - pointer.sx) * 0.08;
    pointer.sy += (pointer.y - pointer.sy) * 0.08;
    ctx.clearRect(0, 0, size.w, size.h);
    for (const m of moods) if (weight[m] > 0.01) layers[m](t, weight[m]);
    ctx.globalAlpha = 1;
  }

  // Frames only run while something is moving; an idle homepage costs nothing.
  let raf = 0, prev = 0;
  const animated = () => weight.photo + weight.dj + weight.trail + weight.code > 0.01;
  const settling = () => moods.some((m) => Math.abs((m === target ? 1 : 0) - weight[m]) > 0.005);
  function frame(t: number) {
    raf = 0;
    render(t, prev ? Math.min(64, t - prev) : 16);
    prev = t;
    if (trail.length || animated() || settling() || t - lastMove < 1500) raf = requestAnimationFrame(frame);
    else prev = 0;
  }
  function wake() {
    if (!raf && !reducedMotion()) raf = requestAnimationFrame(frame);
  }
  scope.add(() => cancelAnimationFrame(raf));
  scope.on(document, 'visibilitychange', () => document.hidden && (cancelAnimationFrame(raf), (raf = 0)));
  scope.on(window, 'resize', () => (reducedMotion() ? render(performance.now()) : wake()));
  render(performance.now());
  wake();
};
