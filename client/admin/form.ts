import { h } from './h';
import type { Field } from './api';

/**
 * Form controls built from a collection's field definitions (the same ones the server validates with),
 * so the admin can't drift from the rules. Values are read as strings; the server converts and checks.
 */

export type Controls = {
  el: HTMLElement;
  /** every field's current value */
  read(): Record<string, string>;
  /** only the fields that differ from what was loaded */
  changed(): Record<string, string>;
  isDirty(): boolean;
  /** load new values (after a save) */
  reset(values: Record<string, unknown>): void;
  focus(): void;
};

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

let uid = 0;

const asText = (f: Field, v: unknown) => {
  if (v === null || v === undefined) return '';
  // 0 is how the database stores "no number"
  if ((f.type === 'int' || f.type === 'real') && Number(v) === 0 && !f.required) return '';
  return String(v);
};

/** A hint without spaces is an example ("1:02:30"): it reads better inside the empty field. */
const example = (f: Field) => (f.hint && !/\s/.test(f.hint) ? f.hint : '');

function control(f: Field, id: string): Control {
  const common = { id, name: f.name, required: !!f.required, placeholder: example(f) || undefined };
  switch (f.type) {
    case 'long':
      return h('textarea', { ...common, class: 'a-field a-field-area', rows: f.name === 'tracklist' ? 8 : 3, maxlength: f.max });
    case 'enum':
      return h('select', { ...common, class: 'a-field' }, (f.options ?? []).map((o) => h('option', { value: o }, o)));
    case 'date':
      return h('input', { ...common, class: 'a-field a-field-date', type: 'date' });
    case 'int':
    case 'real':
      return h('input', { ...common, class: 'a-field a-field-num', type: 'number', step: f.type === 'int' ? 1 : 'any', min: f.min, inputmode: f.type === 'int' ? 'numeric' : 'decimal' });
    case 'url':
      return h('input', { ...common, class: 'a-field', type: 'url', maxlength: f.max, placeholder: 'https://…', spellcheck: 'false', autocomplete: 'off' });
    case 'link':
      return h('input', { ...common, class: 'a-field', type: 'text', maxlength: f.max, placeholder: f.hint ?? '', spellcheck: 'false', autocomplete: 'off' });
    default:
      return h('input', { ...common, class: 'a-field', type: 'text', maxlength: f.max, autocomplete: 'off' });
  }
}

export function controls(fields: Field[], values: Record<string, unknown>): Controls {
  const n = ++uid;
  const map = new Map<string, { f: Field; c: Control }>();
  let base: Record<string, string> = {};

  const el = h(
    'div',
    { class: 'fields' },
    fields.map((f) => {
      const id = `f${n}-${f.name}`;
      const c = control(f, id);
      map.set(f.name, { f, c });
      const counter = f.max && f.max >= 60 && f.type !== 'url' && f.type !== 'link' ? h('span', { class: 'f-count mono dim', 'aria-hidden': 'true' }) : null;
      const hint = f.hint && f.type !== 'link' && !example(f) ? f.hint : '';
      if (counter) {
        const paintCount = () => {
          const len = c.value.length;
          counter.textContent = len > f.max! * 0.7 ? `${len}/${f.max}` : '';
        };
        c.addEventListener('input', paintCount);
        c.addEventListener('change', paintCount);
      }
      return h(
        'div',
        { class: `f${f.type === 'long' ? ' f-wide' : ''}` },
        h('label', { class: 'f-label mono', for: id }, f.label, f.required ? ' *' : ''),
        c,
        hint || counter ? h('span', { class: 'f-hint mono dim' }, hint, counter) : null,
      );
    }),
  );

  const read = () => Object.fromEntries([...map].map(([k, { c }]) => [k, c.value]));
  const reset = (values: Record<string, unknown>) => {
    base = {};
    for (const [k, { f, c }] of map) {
      // a new item starts on the first option of a choice
      const v = asText(f, values[k]) || (f.type === 'enum' ? (f.options?.[0] ?? '') : '');
      c.value = v;
      base[k] = c.value;
      c.dispatchEvent(new Event('change'));
    }
  };
  reset(values);

  const changed = () => Object.fromEntries(Object.entries(read()).filter(([k, v]) => v !== base[k]));
  return {
    el,
    read,
    changed,
    isDirty: () => Object.keys(changed()).length > 0,
    reset,
    focus: () => [...map.values()].find(({ c }) => c.type !== 'select-one')?.c.focus(),
  };
}
