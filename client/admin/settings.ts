import { $$ } from '../lib/dom';
import { api, type Settings } from './api';
import { label, paint, track, watch } from './state';

/**
 * Settings forms rendered by the server (src/views/admin.tsx): inputs named by path ("headline",
 * "nav.music", "intros.dj"). Text saves with the form's button (only changed keys are sent);
 * switches save the moment they flip.
 */

type Control = HTMLInputElement;

const get = (s: Settings, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], s);
const valueOf = (c: Control) => (c.type === 'checkbox' ? c.checked : c.value);
const show = (c: Control, v: unknown) => (c.type === 'checkbox' ? (c.checked = !!v) : (c.value = String(v ?? '')));

/** { "nav.music": true, headline: "x" } → { nav: { music: true }, headline: "x" } */
function payload(controls: Control[]) {
  const out: Record<string, unknown> = {};
  for (const c of controls) {
    const [a, b] = c.name.split('.');
    if (b) ((out[a] ??= {}) as Record<string, unknown>)[b] = valueOf(c);
    else out[a] = valueOf(c);
  }
  return out;
}

export function settingsForms(root: ParentNode, initial: Settings, onSaved: (s: Settings) => void) {
  let current = initial;

  for (const form of $$<HTMLFormElement>('form[data-settings]', root)) {
    const controls = [...form.querySelectorAll<Control>('input[name]')];
    const texts = controls.filter((c) => c.type !== 'checkbox');
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const state = label(form.querySelector<HTMLElement>('[data-state]')!);
    const changed = () => texts.filter((c) => c.value !== String(get(current, c.name) ?? ''));
    const refresh = () => {
      if (button) button.disabled = changed().length === 0;
      paint();
    };
    watch(form, () => changed().length > 0);

    async function save(list: Control[]) {
      state.busy();
      try {
        current = await track(api<Settings>('PUT', '/api/admin/settings', payload(list)));
        // show what the server stored (trimmed, normalised)
        for (const c of list) show(c, get(current, c.name));
        onSaved(current);
        state.ok();
        return true;
      } catch (e) {
        state.err((e as Error).message);
        return false;
      } finally {
        refresh();
      }
    }

    form.addEventListener('input', (e) => {
      if ((e.target as Control).type !== 'checkbox') refresh();
    });
    form.addEventListener('change', async (e) => {
      const c = e.target as Control;
      if (c.type !== 'checkbox') return;
      if (!(await save([c]))) c.checked = !c.checked;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const list = changed();
      if (list.length) save(list);
    });
    refresh();
  }

  return { get: () => current };
}
