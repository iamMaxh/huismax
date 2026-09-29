import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index';

// Trailing-slash canonicalisation must never redirect off-site.
test('trailing-slash redirect stays on this site', async () => {
  const base = 'https://huismax.com';
  let redirected = 0;
  for (const path of ['/%09/evil.example/', '/%5C%09/evil.example/', '//evil.example/', '/%0A/evil.example/', '/%0D%0A/%5Cevil.example/', '/music/']) {
    const res = await app.request(base + path, {}, {} as never);
    // a 404 is fine too (a newline doesn't match the route); what must never happen is an off-site Location
    if (res.status !== 301) {
      assert.equal(res.status, 404, path);
      continue;
    }
    const to = new URL(res.headers.get('location')!, base);
    assert.equal(to.origin, base, `${path} → ${res.headers.get('location')}`);
    redirected++;
  }
  assert.ok(redirected >= 4);
});
