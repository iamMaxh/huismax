import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SSEParser, type SSEEvent } from '../client/lib/sse';
import { ENDPOINT, ERROR_TEXT, HISTORY_LIMIT, TIMEOUTS, kindOfStatus, recentHistory, streamAssistantMessage, type HistoryItem } from '../client/lib/assistant-api';
import { format, inline } from '../client/lib/chat-format';

// ——— SSE parser ———

const STREAM =
  'event: ready\ndata: {"status":"ok"}\n\n' +
  ': keep-alive\n\n' +
  'event: token\ndata: {"content":"你好，"}\n\n' +
  'event: token\r\ndata: {"content":"Max is\\na photographer."}\r\n\r\n' +
  'event: token\rdata: {"content":" 🎧"}\r\r' +
  'data: line one\ndata: line two\n\n' +
  'event: done\ndata: {"done":true,"model":"local"}\n\n';

const EXPECTED: SSEEvent[] = [
  { event: 'ready', data: '{"status":"ok"}' },
  { event: 'token', data: '{"content":"你好，"}' },
  { event: 'token', data: '{"content":"Max is\\na photographer."}' },
  { event: 'token', data: '{"content":" 🎧"}' },
  { event: 'message', data: 'line one\nline two' },
  { event: 'done', data: '{"done":true,"model":"local"}' },
];

test('sse: whole stream at once', () => {
  assert.deepEqual(new SSEParser().feed(STREAM), EXPECTED);
});

test('sse: every chunk size, every split point (including between \\r and \\n)', () => {
  for (let size = 1; size <= 40; size++) {
    const p = new SSEParser();
    const out: SSEEvent[] = [];
    for (let i = 0; i < STREAM.length; i += size) out.push(...p.feed(STREAM.slice(i, i + size)));
    assert.deepEqual(out, EXPECTED, `chunk size ${size}`);
  }
  for (let cut = 1; cut < STREAM.length; cut++) {
    const p = new SSEParser();
    assert.deepEqual([...p.feed(STREAM.slice(0, cut)), ...p.feed(STREAM.slice(cut))], EXPECTED, `cut at ${cut}`);
  }
});

test('sse: an event without its closing blank line is not dispatched', () => {
  const p = new SSEParser();
  assert.deepEqual(p.feed('event: token\ndata: {"content":"x"}\n'), []);
  p.end();
  assert.deepEqual(p.feed('data: y\n\n'), [{ event: 'message', data: 'y' }]);
});

// ——— API client (fetch stubbed) ———

type Call = { url: string; init: RequestInit };
const enc = new TextEncoder();

/** A fetch that answers with `chunks` (bytes, split anywhere), one per tick; `hang` leaves the stream open. */
function stubFetch(opts: { status?: number; chunks?: (string | Uint8Array)[]; hang?: boolean; fail?: boolean; cutAfter?: boolean }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (opts.fail) throw new TypeError('Failed to fetch');
    const signal = init.signal!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        gone = true;
        clearTimeout(timer);
      },
      start(ctl) {
        const chunks = [...(opts.chunks ?? [])];
        const next = () => {
          if (signal.aborted || gone) return;
          const c = chunks.shift();
          if (c === undefined) {
            if (opts.cutAfter) ctl.error(new TypeError('network error'));
            else if (!opts.hang) ctl.close();
            return;
          }
          ctl.enqueue(typeof c === 'string' ? enc.encode(c) : c);
          timer = setTimeout(next, 1);
        };
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          if (gone) return;
          gone = true;
          try {
            ctl.error(new DOMException('aborted', 'AbortError'));
          } catch {
            /* already closed */
          }
        });
        next();
      },
    });
    return new Response(body, { status: opts.status ?? 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  return calls;
}

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test('api: streams tokens in order and ends with done', async () => {
  // "你好" split in the middle of a UTF-8 character, and an event split across chunks
  const bytes = enc.encode(ev('ready', { status: 'ok' }) + ev('token', { content: '你好' }) + ev('token', { content: ', Max' }) + ev('done', { done: true, model: 'm1' }));
  const split = [bytes.slice(0, 40), bytes.slice(40, 67), bytes.slice(67, 68), bytes.slice(68)];
  const calls = stubFetch({ chunks: split });
  const tokens: string[] = [];
  let ready = 0;
  const out = await streamAssistantMessage('Who is Max?', [], { onReady: () => ready++, onToken: (t) => tokens.push(t) }, new AbortController().signal);
  assert.deepEqual(out, { status: 'done', model: 'm1' });
  assert.equal(tokens.join(''), '你好, Max');
  assert.equal(ready, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'omit');
});

test('api: request body is {message, history} with only the last 8 messages', async () => {
  const calls = stubFetch({ chunks: [ev('done', { done: true })] });
  const history: HistoryItem[] = Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  history.splice(5, 0, { role: 'assistant', content: '   ' }); // empty: never sent
  await streamAssistantMessage('next', history, { onToken() {} }, new AbortController().signal);
  const body = JSON.parse(calls[0].init.body as string);
  assert.deepEqual(Object.keys(body).sort(), ['history', 'message']);
  assert.equal(body.message, 'next');
  assert.equal(body.history.length, HISTORY_LIMIT);
  assert.deepEqual(body.history.map((m: HistoryItem) => m.content), ['m5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']);
  for (const m of body.history) assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
});

test('api: Stop keeps what arrived and resolves as stopped', async () => {
  stubFetch({ chunks: [ev('token', { content: 'partial ' }), ev('token', { content: 'answer' })], hang: true });
  const ctl = new AbortController();
  const tokens: string[] = [];
  const out = await streamAssistantMessage('q', [], { onToken: (t) => (tokens.push(t), tokens.length === 2 && ctl.abort()) }, ctl.signal);
  assert.deepEqual(out, { status: 'stopped' });
  assert.equal(tokens.join(''), 'partial answer');
});

test('api: HTTP errors map to friendly kinds, never the server text', async () => {
  for (const [status, kind] of [[429, 'rate_limited'], [502, 'unavailable'], [503, 'unavailable'], [504, 'timeout'], [500, 'server'], [400, 'server']] as const) {
    stubFetch({ status, chunks: ['{"error":"Traceback: secret stuff"}'] });
    const out = await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal);
    assert.deepEqual(out, { status: 'error', kind }, `status ${status}`);
    assert.equal(kindOfStatus(status), kind);
  }
  assert.equal(ERROR_TEXT.rate_limited, 'Too many requests right now. Try again in a moment.');
  assert.equal(ERROR_TEXT.unavailable, "Max's AI assistant is temporarily unavailable.");
  assert.equal(ERROR_TEXT.timeout, 'This response is taking longer than expected. Please try again.');
});

test('api: network failure, cut stream, error event, stream closed without done', async () => {
  stubFetch({ fail: true });
  assert.deepEqual(await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal), { status: 'error', kind: 'network' });

  stubFetch({ chunks: [ev('token', { content: 'a' })], cutAfter: true });
  assert.deepEqual(await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal), { status: 'error', kind: 'interrupted' });

  stubFetch({ chunks: [ev('token', { content: 'a' }), ev('error', { error: 'model crashed at /home/max' })], hang: true });
  assert.deepEqual(await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal), { status: 'error', kind: 'server' });

  stubFetch({ chunks: [ev('token', { content: 'a' })] });
  assert.deepEqual(await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal), { status: 'error', kind: 'interrupted' });
});

test('api: malformed events are skipped', async () => {
  stubFetch({ chunks: ['event: token\ndata: {not json\n\n', ev('token', { content: 'ok' }), ev('token', { nope: 1 }), ev('done', { done: true })] });
  const tokens: string[] = [];
  const out = await streamAssistantMessage('q', [], { onToken: (t) => tokens.push(t) }, new AbortController().signal);
  assert.equal(out.status, 'done');
  assert.deepEqual(tokens, ['ok']);
});

test('api: silence times out (first token, then between tokens)', async () => {
  const saved = { ...TIMEOUTS };
  TIMEOUTS.firstToken = 30;
  TIMEOUTS.idle = 30;
  try {
    stubFetch({ chunks: [], hang: true });
    assert.deepEqual(await streamAssistantMessage('q', [], { onToken() {} }, new AbortController().signal), { status: 'error', kind: 'timeout' });
    stubFetch({ chunks: [ev('token', { content: 'a' })], hang: true });
    const tokens: string[] = [];
    assert.deepEqual(await streamAssistantMessage('q', [], { onToken: (t) => tokens.push(t) }, new AbortController().signal), { status: 'error', kind: 'timeout' });
    assert.deepEqual(tokens, ['a']);
  } finally {
    Object.assign(TIMEOUTS, saved);
  }
});

test('api: recentHistory keeps order and drops empties', () => {
  assert.deepEqual(recentHistory([{ role: 'user', content: '' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 8), [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
  ]);
});

// ——— rendering: untrusted text, links only when allowed ———

const allow = (href: string) => href === '/music' || href.startsWith('https://tapical.us');

test('format: only allowed links become links; everything else stays text', () => {
  const parts = inline('See [music](/music), [evil](https://evil.example/login), [x](javascript:alert(1)) and https://tapical.us.', allow);
  const links = parts.filter((p) => p.t === 'link');
  assert.deepEqual(links, [
    { t: 'link', href: '/music', v: 'music' },
    { t: 'link', href: 'https://tapical.us', v: 'tapical.us' },
  ]);
  const text = parts.map((p) => p.v).join('');
  assert.ok(text.includes('evil') && !text.includes('evil.example'));
  assert.ok(!text.includes('javascript:'));
});

test('format: no link policy (null) means no links at all', () => {
  assert.ok(inline('go to /music or https://tapical.us', null).every((p) => p.t === 'text'));
});

test('format: html stays literal text; lists and paragraphs survive', () => {
  const blocks = format('<img src=x onerror=alert(1)>\n\n**Max** does:\n- photos\n- DJ sets', allow);
  assert.equal(blocks[0].t, 'p');
  assert.deepEqual(blocks[0].t === 'p' && blocks[0].inline, [{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
  assert.deepEqual(blocks[1].t === 'p' && blocks[1].inline, [{ t: 'text', v: 'Max does:' }]);
  assert.deepEqual(blocks[2].t === 'list' && blocks[2].items.length, 2);
});
