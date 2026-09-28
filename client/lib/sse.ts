/**
 * Incremental Server-Sent Events parser (https://html.spec.whatwg.org/#event-stream-interpretation).
 * Feed it text as it arrives, in chunks of any size: a chunk can end in the middle of a line, of a field,
 * or between the \r and \n of a line break. Complete events come out; partial ones wait for more text.
 */

export type SSEEvent = { event: string; data: string };

export class SSEParser {
  private buf = '';
  private event = '';
  private data: string[] = [];
  private sawCR = false;

  /** Returns every event completed by this chunk, in order. */
  feed(chunk: string): SSEEvent[] {
    const out: SSEEvent[] = [];
    // a \r at the end of the last chunk may be half of a \r\n
    if (this.sawCR && chunk.startsWith('\n')) chunk = chunk.slice(1);
    this.sawCR = chunk.endsWith('\r');
    this.buf += chunk;
    for (;;) {
      const m = /\r\n|\r|\n/.exec(this.buf);
      if (!m) break;
      const line = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      const ev = this.line(line);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** The stream ended: an event without its closing blank line is dropped, as the spec says. */
  end(): void {
    this.buf = '';
    this.event = '';
    this.data = [];
  }

  private line(line: string): SSEEvent | null {
    if (line === '') {
      // blank line: dispatch
      if (!this.data.length) {
        this.event = '';
        return null;
      }
      const ev = { event: this.event || 'message', data: this.data.join('\n') };
      this.event = '';
      this.data = [];
      return ev;
    }
    if (line.startsWith(':')) return null; // comment / keep-alive
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    // id and retry mean nothing for a one-shot POST stream
    return null;
  }
}
