import { $, $$, cssVar, fitCanvas, reducedMotion } from '../lib/dom';
import { tickListening } from '../lib/listening';
import { live } from '../lib/live';
import { lyrics, type Line } from '../lib/lyrics';
import { player } from '../lib/player';
import { readSpectrum } from '../lib/viz';
import type { PageInit } from '../main';

const GLYPHS = '01{}[]<>/\\=+*;:._-~$#&|?!abcdefmx';

/** Small integer hash, so each column shows its own glyph sequence. */
const hash = (a: number, b: number) => {
  let x = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
};

export const initHome: PageInit = (main, scope) => {
  const hero = $('.home-hero', main)!;
  const caption = $('[data-mood-caption]', main)!;
  const links = $$<HTMLAnchorElement>('[data-mood-key]', main);

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

  const setMood = (m: string, text = '') => {
    hero.dataset.mood = m;
    typeCaption(text);
  };

  for (const a of links) {
    const m = a.dataset.moodKey!;
    scope.on(a, 'pointerenter', () => setMood(m, a.dataset.caption));
    scope.on(a, 'focus', () => setMood(m, a.dataset.caption));
    scope.on(a, 'pointerleave', () => document.activeElement !== a && setMood('none'));
    scope.on(a, 'blur', () => setMood('none'));
  }

  // ↑/↓ between identities, 1–9 to jump.
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    if (!links.length || (e.target as HTMLElement).closest('input, textarea, dialog[open]')) return;
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (i < 0 && e.key === 'ArrowUp') return;
      e.preventDefault();
      links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    } else if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      links[Number(e.key) - 1]?.focus();
    }
  });

  typeHeadline($('[data-typewriter]', main), scope);

  // Spotify progress on every device (a text + transform update twice a second, nothing else).
  tickListening(main);
  const tick = setInterval(() => tickListening(main), 500);
  scope.add(() => clearInterval(tick));

  rain($<HTMLCanvasElement>('[data-rain]', main)!, scope);
  const liveViz = $<HTMLCanvasElement>('[data-live-viz]', main);
  if (liveViz) spectrum(liveViz, scope);
  sungLine(main, scope);
};

/**
 * Under the Spotify card: the line being sung, like a subtitle, while the song plays and has synced lyrics.
 * Anything else (paused, unsynced, none found, an error) and it's simply not there.
 */
function sungLine(main: HTMLElement, scope: Parameters<PageInit>[1]) {
  const el = $('[data-listening-lyric]', main);
  if (!el) return;
  const text = $('[data-listening-lyric-text]', el)!;
  let lines: Line[] = [];
  scope.add(
    lyrics.subscribe((s) => {
      lines = s.status === 'synced' && !s.paused ? s.lines : [];
      if (!lines.length) el.hidden = true;
    }),
  );
  scope.add(
    lyrics.onLine((i) => {
      const l = lines[i];
      el.hidden = !l;
      if (!l) return;
      const words = l.text || '♪';
      el.classList.toggle('is-break', !l.text);
      if (text.textContent === words) return;
      text.textContent = words;
      if (!reducedMotion()) text.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
    }),
  );
}

/**
 * The DJ console's spectrum at album-art size, while the channel is live: still until the set plays, then the real
 * audio (the stream allows Web Audio). Off air the card is hidden and nothing is drawn.
 */
function spectrum(canvas: HTMLCanvasElement, scope: Parameters<PageInit>[1]) {
  const { ctx, size } = fitCanvas(canvas, scope);
  const n = 20;
  const data = new Uint8Array(n);
  const peaks = new Float32Array(n);
  let fg = cssVar('--fg');
  let red = cssVar('--live');
  scope.on(window, 'themechange', () => ((fg = cssVar('--fg')), (red = cssVar('--live'))));
  const draw = (t: number) => {
    if (!live.get().isLive || !size.w) return;
    readSpectrum(data, t, player.state().status === 'playing' ? 1 : 0);
    const { w, h } = size;
    const bw = w / n;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = fg;
    ctx.fillRect(0, h / 2, w, 1);
    for (let i = 0; i < n; i++) {
      const v = data[i] / 255;
      peaks[i] = Math.max(v, peaks[i] - 0.006);
      const bh = Math.max(1, v * h * 0.42);
      const x = i * bw + 1;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = fg;
      ctx.fillRect(x, h / 2 - bh, Math.max(1, bw - 3), bh * 2);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = red;
      ctx.fillRect(x, h / 2 - peaks[i] * h * 0.42 - 3, Math.max(1, bw - 3), 1);
    }
    ctx.globalAlpha = 1;
  };
  if (!reducedMotion()) return scope.loop(draw);
  // reduced motion: a still frame, redrawn once a second so it appears when the channel goes live
  const id = setInterval(() => draw(0), 1000);
  scope.add(() => clearInterval(id));
  draw(0);
}

/**
 * "WHO IS MAX?" types itself on arrival behind a blinking "_": the first line quickly, a beat, then the last word.
 * Letters are only hidden (not removed) while typing, so nothing reflows.
 */
function typeHeadline(h1: HTMLElement | null, scope: Parameters<PageInit>[1]) {
  if (!h1) return;
  if (reducedMotion()) return void h1.classList.add('is-typed');
  const lines = $$('.who-line', h1);
  const chars: HTMLElement[] = [];
  let pauseAt = -1;
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const c of child.textContent ?? '') {
          const span = document.createElement('span');
          span.className = 'ch';
          span.textContent = c;
          frag.append(span);
          chars.push(span);
        }
        child.replaceWith(frag);
      } else walk(child);
    }
  };
  lines.forEach((line, i) => {
    if (i === lines.length - 1 && i > 0) pauseAt = chars.length;
    walk(line);
  });
  if (!chars.length) return void h1.classList.add('is-typed');

  // hidden letters are invisible to screen readers too, so the heading says its full text meanwhile
  h1.setAttribute('aria-label', lines.map((l) => l.textContent).join(' '));
  const cursor = document.createElement('span');
  cursor.className = 'who-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.textContent = '_';
  chars[0].before(cursor);
  h1.classList.add('is-typing');

  let i = 0;
  let timer = 0;
  const step = () => {
    chars[i].classList.add('on');
    chars[i].after(cursor);
    i++;
    if (i >= chars.length) {
      h1.classList.replace('is-typing', 'is-typed');
      h1.removeAttribute('aria-label');
      // a few more blinks, then the cursor steps away
      timer = window.setTimeout(() => cursor.classList.add('is-out'), 2600);
      return;
    }
    timer = window.setTimeout(step, i === pauseAt ? 650 : i > pauseAt && pauseAt > 0 ? 120 : 55);
  };
  timer = window.setTimeout(step, 260);
  scope.add(() => clearTimeout(timer));
}

/**
 * The homepage's one effect: sparse mono glyph rain behind everything, always on.
 * Capped at 30fps (20 on touch devices), paused while the tab is hidden, a still frame with reduced motion.
 */
function rain(canvas: HTMLCanvasElement, scope: Parameters<PageInit>[1]) {
  const { ctx, size } = fitCanvas(canvas, scope);
  const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CELL = touch ? 20 : 18;
  const FPS = touch ? 20 : 30;
  // quiet enough to read text over it; phones put more text over less space, so they go a little quieter
  const HEAD = touch ? 0.3 : 0.36;
  const TAIL = touch ? 0.12 : 0.15;
  let fg = cssVar('--fg');
  scope.on(window, 'themechange', () => (fg = cssVar('--fg')));

  type Drop = { y: number; v: number; len: number; seed: number };
  // A new drop starts somewhere above the screen, so columns come and go instead of all raining at once.
  const drop = (anywhere = false): Drop => ({
    y: anywhere ? Math.random() * size.h * 1.4 : -Math.random() * size.h * 0.9,
    v: 34 + Math.random() * 76,
    len: 5 + ((Math.random() * 13) | 0),
    seed: (Math.random() * 997) | 0,
  });
  let drops: Drop[] = [];
  const fit = () => {
    const cols = Math.ceil(size.w / CELL);
    if (cols !== drops.length) drops = Array.from({ length: cols }, (_, c) => drops[c] ?? drop(true));
  };

  function draw(t: number, dt: number) {
    fit();
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.font = `${CELL - 6}px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = fg;
    const flicker = Math.floor(t / 140);
    for (let c = 0; c < drops.length; c++) {
      const d = drops[c];
      d.y += d.v * dt;
      if (d.y - d.len * CELL > size.h) drops[c] = drop();
      const head = Math.floor(d.y / CELL);
      for (let k = 0; k < d.len; k++) {
        const row = head - k;
        const y = row * CELL;
        if (y < -CELL || y > size.h) continue;
        ctx.globalAlpha = k === 0 ? HEAD : TAIL * (1 - k / d.len);
        ctx.fillText(GLYPHS[hash(d.seed + c, row + (k < 2 ? flicker : 0)) % GLYPHS.length], c * CELL + 3, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  if (reducedMotion()) {
    fit();
    draw(0, 0);
    scope.on(window, 'resize', () => draw(0, 0));
    return;
  }

  let raf = 0, last = 0;
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (t - last < 1000 / FPS - 2) return;
    draw(t, last ? Math.min(0.1, (t - last) / 1000) : 0);
    last = t;
  };
  const run = () => !raf && !document.hidden && (last = 0, (raf = requestAnimationFrame(frame)));
  const stop = () => (cancelAnimationFrame(raf), (raf = 0));
  scope.on(document, 'visibilitychange', () => (document.hidden ? stop() : run()));
  scope.add(stop);
  run();
}
