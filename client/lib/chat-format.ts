/**
 * Turns an assistant answer (untrusted model output) into blocks the chat renders as DOM text nodes.
 * Nothing here is ever parsed as HTML. A link becomes clickable only if it's in `allowed`: the links of
 * Max's own site and links (see chat.ts). Any other URL (a made-up one, a phishing one a visitor coaxed
 * out of the model, javascript:) stays plain text.
 */

export type Inline = { t: 'text'; v: string } | { t: 'link'; href: string; v: string };
export type Block = { t: 'p'; inline: Inline[] } | { t: 'list'; items: Inline[][] };

/** Decides whether a URL or site path may be a link. null: nothing is (e.g. while an answer streams). */
export type LinkPolicy = ((href: string) => boolean) | null;

export const isAllowed = (href: string, allowed: LinkPolicy) => !!allowed && allowed(href);

// [label](url) · https://… · a site path like /music (after a space, a bracket or the start)
const TOKEN = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|(https?:\/\/[^\s<>"'`]+)|(^|[\s(“"'])(\/[a-z][\w\-/]*)/g;
const TRAIL = /[.,;:!?)\]}"'”’]+$/;

export function inline(text: string, allowed: LinkPolicy): Inline[] {
  const out: Inline[] = [];
  const push = (n: Inline) => {
    const prev = out[out.length - 1];
    if (n.t === 'text' && prev?.t === 'text') prev.v += n.v;
    else if (n.t === 'link' || n.v) out.push(n);
  };
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index!;
    push({ t: 'text', v: text.slice(last, start) });
    if (m[1] !== undefined) {
      // markdown link: the label always shows; the link only if allowed
      push(isAllowed(m[2], allowed) ? { t: 'link', href: m[2], v: m[1] } : { t: 'text', v: m[1] });
    } else {
      const lead = m[4] ?? '';
      const raw = m[3] ?? m[5];
      const tail = raw.match(TRAIL)?.[0] ?? '';
      const href = raw.slice(0, raw.length - tail.length);
      push({ t: 'text', v: lead });
      push(isAllowed(href, allowed) ? { t: 'link', href, v: href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') } : { t: 'text', v: href });
      push({ t: 'text', v: tail });
    }
    last = start + m[0].length;
  }
  push({ t: 'text', v: text.slice(last) });
  return out;
}

const LIST = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/;

/** Paragraphs and simple lists; markdown emphasis, code ticks and headings are dropped to plain text. */
export function format(text: string, allowed: LinkPolicy): Block[] {
  const clean = text
    .replace(/\r/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s+/gm, '');
  const blocks: Block[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    const lines = para.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let prose: string[] = [];
    let list: Inline[][] = [];
    const flushProse = () => prose.length && (blocks.push({ t: 'p', inline: inline(prose.join('\n'), allowed) }), (prose = []));
    const flushList = () => list.length && (blocks.push({ t: 'list', items: list }), (list = []));
    for (const l of lines) {
      if (LIST.test(l)) {
        flushProse();
        list.push(inline(l.replace(LIST, ''), allowed));
      } else {
        flushList();
        prose.push(l.trim());
      }
    }
    flushProse();
    flushList();
  }
  return blocks;
}
