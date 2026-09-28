/**
 * Drag to reorder with pointer events, so mouse, pen and touch share one path. Dragging starts only from a
 * handle (touch-action: none in CSS), so the rest of a row still scrolls the page on phones.
 * The item moves in the DOM as it passes its neighbours; `onDrop` gets the new id order once, at the end.
 * Moves are followed on window, not through pointer capture: moving the item in the DOM would drop the capture.
 */
export function sortable(list: HTMLElement, opts: { item: string; handle: string; grid?: boolean; onDrop: (ids: string[]) => void }) {
  const items = () => [...list.querySelectorAll<HTMLElement>(opts.item)].filter((el) => !el.hidden);
  const ids = () => items().map((el) => el.dataset.id!);

  list.addEventListener('pointerdown', (down: PointerEvent) => {
    const handle = (down.target as Element).closest<HTMLElement>(opts.handle);
    if (!handle || !list.contains(handle) || down.button !== 0) return;
    const el = handle.closest<HTMLElement>(opts.item);
    if (!el) return;
    down.preventDefault();
    const before = ids().join();
    const r0 = el.getBoundingClientRect();
    const off = { x: down.clientX - r0.left, y: down.clientY - r0.top };
    let dragging = false;

    const move = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 4) return;
        dragging = true;
        el.classList.add('is-dragging');
        list.classList.add('is-sorting');
      }
      const all = items();
      const over = all.find((s) => {
        if (s === el) return false;
        const r = s.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom && (!opts.grid || (e.clientX >= r.left && e.clientX <= r.right));
      });
      if (over) {
        const forward = all.indexOf(el) < all.indexOf(over);
        const r = over.getBoundingClientRect();
        // in a list, pass the neighbour's middle before swapping, so rows of different heights don't flip back and forth
        const past = opts.grid || (forward ? e.clientY > r.top + r.height / 2 : e.clientY < r.top + r.height / 2);
        if (past) (forward ? over.after(el) : over.before(el));
      }
      // follow the pointer from wherever the item now sits in the flow
      el.style.transform = '';
      const n = el.getBoundingClientRect();
      el.style.transform = `translate(${opts.grid ? e.clientX - off.x - n.left : 0}px, ${e.clientY - off.y - n.top}px)`;
      const edge = 90;
      if (e.clientY < edge + 60) scrollBy(0, -14);
      else if (e.clientY > innerHeight - edge) scrollBy(0, 14);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      el.style.transform = '';
      el.classList.remove('is-dragging');
      list.classList.remove('is-sorting');
      const after = ids();
      if (dragging && after.join() !== before) opts.onDrop(after);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });
}

/** New full order after moving the visible ids into `ids` order; hidden items (another view) keep their slots. */
export function reorderWithin<T extends { id: string }>(all: T[], ids: string[]): T[] {
  const set = new Set(ids);
  const byId = new Map(all.map((x) => [x.id, x]));
  const queue = ids.map((id) => byId.get(id)!).filter(Boolean);
  return all.map((x) => (set.has(x.id) ? queue.shift()! : x));
}
