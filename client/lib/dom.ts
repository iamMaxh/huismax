export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function readJSON<T>(id: string, root: ParentNode = document): T | null {
  const el = root.querySelector(`#${id}`);
  try {
    return el?.textContent ? (JSON.parse(el.textContent) as T) : null;
  } catch {
    return null;
  }
}

/** Collects teardown callbacks so page modules can clean up listeners, loops and observers. */
export class Scope {
  private fns: (() => void)[] = [];
  add(fn: () => void) {
    this.fns.push(fn);
  }
  on<K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) {
    el.addEventListener(type, fn, opts);
    this.add(() => el.removeEventListener(type, fn, opts));
  }
  /** requestAnimationFrame loop that pauses when the tab is hidden. */
  loop(fn: (t: number, dt: number) => void) {
    let id = 0, last = performance.now();
    const tick = (t: number) => {
      fn(t, Math.min(64, t - last));
      last = t;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    this.add(() => cancelAnimationFrame(id));
  }
  dispose() {
    this.fns.splice(0).reverse().forEach((f) => f());
  }
}

/** Keeps a canvas' backing store matched to its CSS size × DPR. */
export function fitCanvas(canvas: HTMLCanvasElement, scope: Scope) {
  const ctx = canvas.getContext('2d')!;
  const size = { w: 0, h: 0, dpr: 1 };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    size.dpr = Math.min(2, devicePixelRatio || 1);
    size.w = r.width;
    size.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * size.dpr));
    canvas.height = Math.max(1, Math.round(r.height * size.dpr));
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  scope.add(() => ro.disconnect());
  resize();
  return { ctx, size };
}

/** Reads a CSS custom property as a color string (theme aware). */
export const cssVar = (name: string, el: Element = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

export const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
export const clock = (sec: number) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Runs a DOM change inside a View Transition when the browser supports it. */
export function withTransition(fn: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof d.startViewTransition === 'function' && !reducedMotion()) d.startViewTransition(fn);
  else fn();
}
