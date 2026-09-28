/** Tiny element builder. Strings always become text nodes: data is never parsed as HTML. */
type Child = Node | string | number | null | undefined | false;
type Attr = string | number | boolean | null | undefined | ((e: any) => void);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Attr> | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const props: [string, Attr][] = [];
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') props.push([k, v]);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  // after the children, so a <select> has its options before its value is set
  for (const [k, v] of props) (el as unknown as Record<string, Attr>)[k] = v;
  return el;
}

export function append(el: Node, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export const pad3 = (n: unknown) => String(Number(n) || 0).padStart(3, '0');

/** "2026-09-28T10:00:00Z" → "28 sep 2026, 10:00" in the admin's own time zone. */
export function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
