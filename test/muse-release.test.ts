import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK, museRelease, newer, parseLatest } from '../src/lib/muse-release';

const json = (version: string, urls: string[]) => ({ installer_sha256: 'x', version, installer_urls: urls });
const server = (v: string) => `https://download.huismax.com/MuseCompanion-Setup-${v}.exe`;
const github = (v: string) => `https://github.com/huismaxx/companion/releases/download/v${v}/MuseCompanion-Setup-${v}.exe`;

/** fetch answering latest.json with `latest`, and HEAD with 200 only for the files in `published`. */
function stub(latest: unknown, published: string[]) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/latest.json')) return latest === undefined ? new Response('nope', { status: 404 }) : new Response(typeof latest === 'string' ? latest : JSON.stringify(latest));
    return new Response(null, { status: published.includes(url) ? 200 : 404 });
  }) as typeof fetch;
  return asked;
}

test('muse: latest.json is read the way Muse Companion writes it', () => {
  assert.deepEqual(parseLatest(json('0.4.7', [server('0.4.7'), github('0.4.7')])), { version: '0.4.7', urls: [server('0.4.7'), github('0.4.7')] });
  assert.equal(parseLatest(json('0.4', [server('0.4')])), null, 'three numbers');
  assert.equal(parseLatest(json('0.4.7', ['https://evil.example/MuseCompanion-Setup-0.4.7.exe'])), null, 'only our server and the GitHub releases');
  assert.equal(parseLatest(json('0.4.7', ['http://download.huismax.com/MuseCompanion-Setup-0.4.7.exe'])), null, 'https only');
  assert.equal(parseLatest(null), null);
  assert.ok(newer('0.4.10', '0.4.9') && newer('0.5.0', '0.4.9') && !newer('0.4.6', '0.4.6') && !newer('0.4.5', '0.4.6'));
});

test('muse: the page offers the new version once its installer is there', async () => {
  stub(json('0.4.7', [server('0.4.7'), github('0.4.7')]), [server('0.4.7')]);
  assert.deepEqual(await museRelease(), { version: '0.4.7', url: server('0.4.7') });
});

test("muse: latest.json ahead of its files keeps the last published version", async () => {
  const asked = stub(json('0.4.7', [server('0.4.7'), github('0.4.7')]), []);
  assert.deepEqual(await museRelease(), FALLBACK);
  assert.ok(asked.includes(`HEAD ${server('0.4.7')}`) && asked.includes(`HEAD ${github('0.4.7')}`), 'both addresses tried');
});

test('muse: only on GitHub so far: the GitHub link', async () => {
  stub(json('0.4.8', [server('0.4.8'), github('0.4.8')]), [github('0.4.8')]);
  assert.deepEqual(await museRelease(), { version: '0.4.8', url: github('0.4.8') });
});

test('muse: no latest.json, a broken one, or an older version: the last published version', async () => {
  stub(undefined, []);
  assert.deepEqual(await museRelease(), FALLBACK);
  stub('{not json', []);
  assert.deepEqual(await museRelease(), FALLBACK);
  stub(json('0.4.5', [server('0.4.5')]), [server('0.4.5')]);
  assert.deepEqual(await museRelease(), FALLBACK);
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  assert.deepEqual(await museRelease(), FALLBACK);
});
