/**
 * Save state: the header line ("saving… / all saved / unsaved edits / <error>"), a small per-row/per-form
 * label, and the unsaved-edits registry behind the leave-page warning.
 */

let inflight = 0;
let lastError = '';
const dirty = new Map<object, () => boolean>();

const anyDirty = () => [...dirty.values()].some((f) => f());

export function paint() {
  const el = document.querySelector<HTMLElement>('[data-save-state]');
  if (!el) return;
  const [text, tone] = inflight ? ['saving…', 'dim'] : lastError ? [lastError, 'save-err'] : anyDirty() ? ['unsaved edits', ''] : ['all saved', 'dim'];
  el.textContent = text;
  el.className = tone;
}

/** Wraps one write so the header shows it. */
export async function track<T>(p: Promise<T>): Promise<T> {
  inflight++;
  paint();
  try {
    const r = await p;
    lastError = '';
    return r;
  } catch (e) {
    lastError = (e as Error).message;
    throw e;
  } finally {
    inflight--;
    paint();
  }
}

/** Registers something that can hold unsaved edits (a form, a debounced save). */
export function watch(key: object, isDirty: () => boolean) {
  dirty.set(key, isDirty);
}
export function unwatch(key: object) {
  dirty.delete(key);
  paint();
}

// the header error clears once you act on it; the label next to the field keeps the message
addEventListener(
  'input',
  () => {
    if (!lastError) return;
    lastError = '';
    paint();
  },
  true,
);

addEventListener('beforeunload', (e) => {
  if (inflight || anyDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

export type Label = { busy(text?: string): void; ok(text?: string): void; err(msg: string): void; clear(): void };

/** A small inline state next to what is being saved. "saved" fades after a moment; errors stay. */
export function label(el: HTMLElement): Label {
  let t = 0;
  const set = (text: string, tone: string) => {
    clearTimeout(t);
    el.textContent = text;
    el.dataset.tone = tone;
  };
  return {
    busy: (text = 'saving…') => set(text, 'busy'),
    ok: (text = 'saved') => {
      set(text, 'ok');
      t = window.setTimeout(() => set('', ''), 2600);
    },
    err: (msg) => set(msg, 'err'),
    clear: () => set('', ''),
  };
}
