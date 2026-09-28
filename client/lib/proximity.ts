import { $$, reducedMotion, type Scope } from './dom';

/**
 * Pointer-proximity for [data-prox] elements. Writes smoothed CSS variables that styles use for
 * quiet reactions (highlight position, border glow, a pixel or two of drift). The cursor itself is untouched.
 *   --px / --py   pointer position inside the element (px)
 *   --pd          proximity 0…1 (1 = pointer inside, fades out over `reach` px)
 *   --dx / --dy   pointer offset from centre, −1…1
 */
export function proximity(root: ParentNode, scope: Scope, reach = 140) {
  if (reducedMotion() || !matchMedia('(pointer: fine)').matches) return;
  const els = $$('[data-prox]', root);
  if (!els.length) return;
  const state = els.map(() => ({ px: 0, py: 0, pd: 0, dx: 0, dy: 0, t: { px: 0, py: 0, pd: 0, dx: 0, dy: 0 } }));
  let mx = -1e4, my = -1e4, raf = 0, rects: DOMRect[] = [];

  const measure = () => (rects = els.map((el) => el.getBoundingClientRect()));
  const tick = () => {
    raf = 0;
    let moving = false;
    els.forEach((el, i) => {
      const r = rects[i], s = state[i];
      const ox = Math.max(r.left - mx, 0, mx - r.right), oy = Math.max(r.top - my, 0, my - r.bottom);
      s.t.pd = Math.max(0, 1 - Math.hypot(ox, oy) / reach);
      s.t.px = mx - r.left;
      s.t.py = my - r.top;
      s.t.dx = Math.max(-1, Math.min(1, (mx - (r.left + r.width / 2)) / (r.width / 2)));
      s.t.dy = Math.max(-1, Math.min(1, (my - (r.top + r.height / 2)) / (r.height / 2)));
      for (const k of ['px', 'py', 'pd', 'dx', 'dy'] as const) {
        const d = s.t[k] - s[k];
        if (Math.abs(d) > (k === 'px' || k === 'py' ? 0.3 : 0.002)) moving = true;
        s[k] += d * 0.18;
      }
      el.style.setProperty('--px', `${s.px.toFixed(1)}px`);
      el.style.setProperty('--py', `${s.py.toFixed(1)}px`);
      el.style.setProperty('--pd', s.pd.toFixed(3));
      el.style.setProperty('--dx', s.dx.toFixed(3));
      el.style.setProperty('--dy', s.dy.toFixed(3));
    });
    if (moving) raf = requestAnimationFrame(tick);
  };
  const kick = () => (raf ||= requestAnimationFrame(tick));

  scope.on(window, 'pointermove', (e: PointerEvent) => {
    mx = e.clientX;
    my = e.clientY;
    kick();
  }, { passive: true });
  scope.on(document, 'pointerleave', () => {
    mx = my = -1e4;
    kick();
  });
  scope.on(window, 'scroll', () => (measure(), kick()), { passive: true });
  scope.on(window, 'resize', measure);
  const ro = new ResizeObserver(measure);
  els.forEach((el) => ro.observe(el));
  scope.add(() => {
    ro.disconnect();
    cancelAnimationFrame(raf);
  });
  measure();
}
