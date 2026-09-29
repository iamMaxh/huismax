import { SSEParser } from './sse';

/**
 * The only code that talks to Max's assistant API. The browser knows this one URL and nothing else:
 * no keys, no tunnel, no model host. Everything behind it is Max's backend.
 *
 *   POST {ENDPOINT}  { message, history: [{ role, content }] }
 *   → text/event-stream: ready · token { content } · done { done, model } · error { error }
 */
export const ENDPOINT = 'https://api.huismax.com/v1/chat/stream';

/** Past messages sent with a question (the question itself goes in `message`). */
export const HISTORY_LIMIT = 8;

export const TIMEOUTS = {
  /** a local model can take a while to load before its first word */
  firstToken: 90_000,
  /** silence once it has started */
  idle: 45_000,
};

export type Role = 'user' | 'assistant';
export type HistoryItem = { role: Role; content: string };

export type ErrorKind = 'rate_limited' | 'unavailable' | 'timeout' | 'network' | 'interrupted' | 'server';

export type Callbacks = {
  onReady?: () => void;
  onToken: (text: string) => void;
  onDone?: (info: { model?: string }) => void;
};

export type Outcome = { status: 'done'; model?: string } | { status: 'stopped' } | { status: 'error'; kind: ErrorKind };

/** What a visitor reads. Never the server's own text. */
export const ERROR_TEXT: Record<ErrorKind, string> = {
  rate_limited: 'Too many requests right now. Try again in a moment.',
  unavailable: "Max's AI assistant is temporarily unavailable.",
  timeout: 'This response is taking longer than expected. Please try again.',
  network: "Couldn't reach Max's AI assistant. Check your connection and try again.",
  interrupted: 'The answer was cut off. Please try again.',
  server: 'Something went wrong on our side. Please try again.',
};

export function kindOfStatus(status: number): ErrorKind {
  if (status === 429) return 'rate_limited';
  if (status === 504 || status === 408) return 'timeout';
  if (status === 502 || status === 503) return 'unavailable';
  return 'server';
}

/** The last `limit` messages, trimmed, empty ones left out. */
export function recentHistory(items: HistoryItem[], limit = HISTORY_LIMIT): HistoryItem[] {
  return items
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Sends one question and streams the answer into `callbacks.onToken` as it is generated.
 * Resolves (never rejects) with how it ended. Aborting `signal` stops it at once: 'stopped'.
 */
export async function streamAssistantMessage(message: string, history: HistoryItem[], callbacks: Callbacks, signal: AbortSignal): Promise<Outcome> {
  // our own controller: the caller's Stop, plus the two timeouts
  const ctl = new AbortController();
  let timedOut = false;
  const onStop = () => ctl.abort();
  if (signal.aborted) return { status: 'stopped' };
  signal.addEventListener('abort', onStop);
  let timer = setTimeout(() => ((timedOut = true), ctl.abort()), TIMEOUTS.firstToken);
  const idle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ((timedOut = true), ctl.abort()), TIMEOUTS.idle);
  };
  const ended = (): Outcome => (signal.aborted ? { status: 'stopped' } : { status: 'error', kind: timedOut ? 'timeout' : 'interrupted' });

  try {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, history: recentHistory(history) }),
        signal: ctl.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'strict-origin',
      });
    } catch {
      if (signal.aborted) return { status: 'stopped' };
      return { status: 'error', kind: timedOut ? 'timeout' : 'network' };
    }
    if (!res.ok || !res.body) {
      res.body?.cancel().catch(() => {});
      return { status: 'error', kind: kindOfStatus(res.status) };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        return ended();
      }
      if (chunk.done) {
        parser.feed(decoder.decode());
        parser.end();
        return ended();
      }
      // `stream: true`: a Chinese character split across two chunks decodes once both halves are here
      for (const ev of parser.feed(decoder.decode(chunk.value, { stream: true }))) {
        let data: Record<string, unknown> = {};
        try {
          const v: unknown = ev.data ? JSON.parse(ev.data) : {};
          // `data: null` or a bare number is no payload, but a done or error event still counts
          if (v !== null && typeof v === 'object') data = v as Record<string, unknown>;
        } catch {
          continue; // a malformed event is skipped, not shown
        }
        if (ev.event === 'ready') {
          callbacks.onReady?.();
        } else if (ev.event === 'token') {
          if (typeof data.content === 'string' && data.content) {
            idle();
            callbacks.onToken(data.content);
          }
        } else if (ev.event === 'done') {
          reader.cancel().catch(() => {});
          const model = typeof data.model === 'string' ? data.model : undefined;
          callbacks.onDone?.({ model });
          return { status: 'done', model };
        } else if (ev.event === 'error') {
          reader.cancel().catch(() => {});
          return { status: 'error', kind: 'server' };
        }
      }
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onStop);
  }
}
