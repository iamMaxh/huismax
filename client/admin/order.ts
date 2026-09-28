import { api } from './api';
import { paint, track, watch, type Label } from './state';

/**
 * Saves a manual order a moment after the last move, so several ↑ ↓ presses or a drag become one PUT.
 * On failure it reloads what the server has, so the screen never shows an order that isn't stored.
 */
export function orderSaver(url: string, state: Label, reload: () => Promise<void>) {
  let timer = 0;
  let pending: string[] | null = null;
  const flush = async () => {
    clearTimeout(timer);
    const ids = pending;
    if (!ids) return;
    pending = null;
    try {
      await track(api('PUT', url, { ids }));
      state.ok('order saved');
    } catch (e) {
      state.err((e as Error).message);
      await reload().catch(() => {});
    }
  };
  const key = {};
  watch(key, () => pending !== null);
  return {
    schedule(ids: string[]) {
      pending = ids;
      state.busy('order…');
      clearTimeout(timer);
      timer = window.setTimeout(flush, 450);
      paint();
    },
    flush,
  };
}
