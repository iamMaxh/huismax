import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * The import rules in ARCHITECTURE.md §2 and DEPENDENCIES.md §5.2. They are what lets one module change without
 * breaking another: dependencies only point down. To widen an allowlist, change it here and in both documents.
 */

/** Pure constants views may take from src/lib (no I/O behind them). Everything else from lib is `import type`. */
const VIEW_CONSTANTS = new Set(['STATUS_PRESETS', 'MAX_NAME', 'MAX_REQUEST', 'RANGES']);
/** Server files the browser may `import type` from. Phase 2 replaces this with src/contracts/. */
const CLIENT_SHARED_TYPES = new Set(['src/lib/homelab-types']);
/** Public-bundle → admin imports that are tolerated until Phase 2 moves them to client/lib. */
const PUBLIC_ADMIN_EXCEPTIONS = new Set(['client/pages/homelab.ts → client/admin/h']);

const ROOT = process.cwd();
const CODE = /\.(ts|tsx|mjs)$/;

type Import = { from: string; spec: string; target: string | null; typeOnly: boolean; values: string[] };

function files(dir: string): string[] {
  return (readdirSync(path.join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => CODE.test(f) && !f.endsWith('.d.ts'))
    .map((f) => path.posix.join(dir, f.split(path.sep).join('/')));
}

/** Repo-relative module path without extension, or null for packages and node: built-ins. */
function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/\.(ts|tsx|mjs|js)$/, '');
}

/** Value names an import brings in (`import { a, type B }` → ['a']); default and namespace imports count as values. */
function valueNames(clause: string): string[] {
  const out: string[] = [];
  const named = clause.match(/\{([\s\S]*)\}/);
  for (const part of named ? named[1].split(',') : []) {
    const name = part.trim();
    if (name && !name.startsWith('type ')) out.push(name.split(/\s+as\s+/)[0].trim());
  }
  const rest = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
  if (rest) out.push(rest.startsWith('*') ? '*' : `default:${rest}`);
  return out;
}

function imports(file: string): Import[] {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  const out: Import[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
  for (const m of src.matchAll(re)) {
    const spec = m[4] ?? m[5] ?? m[6];
    const typeOnly = !!m[2];
    const values = m[4] ? (typeOnly ? [] : m[1] === 'export' && m[3].trim() === '*' ? ['*'] : valueNames(m[3])) : ['*'];
    out.push({ from: file, spec, target: resolve(file, spec), typeOnly, values });
  }
  return out;
}

const all = [...files('src'), ...files('client'), ...files('bridge')].flatMap(imports);
const under = (p: string | null, dir: string) => !!p && (p === dir || p.startsWith(`${dir}/`));
const show = (i: Import) => `${i.from} → ${i.spec}`;

test('the scan sees the code it guards', () => {
  assert.ok(all.filter((i) => i.from === 'src/index.tsx').length > 20, 'src/index.tsx imports');
  assert.ok(all.some((i) => i.from === 'client/main.ts'), 'client/main.ts imports');
  assert.ok(all.some((i) => i.from.startsWith('src/views/') && i.typeOnly), 'type-only view imports');
});

test('src/lib never imports views, the router or the client', () => {
  const bad = all.filter((i) => i.from.startsWith('src/lib/') && (under(i.target, 'src/views') || i.target === 'src/index' || under(i.target, 'client')));
  assert.deepEqual(bad.map(show), []);
});

test('views take only types (and listed pure constants) from src/lib', () => {
  const bad = all
    .filter((i) => i.from.startsWith('src/views/') && under(i.target, 'src/lib'))
    .flatMap((i) => i.values.filter((v) => !VIEW_CONSTANTS.has(v)).map((v) => `${show(i)}: ${v}`));
  assert.deepEqual(bad, []);
  const up = all.filter((i) => i.from.startsWith('src/views/') && (i.target === 'src/index' || under(i.target, 'client')));
  assert.deepEqual(up.map(show), []);
});

test('the server never imports client code', () => {
  assert.deepEqual(all.filter((i) => i.from.startsWith('src/') && under(i.target, 'client')).map(show), []);
});

test('the browser imports server code only as types, and only shared type files', () => {
  const bad = all.filter((i) => i.from.startsWith('client/') && under(i.target, 'src') && !(i.typeOnly && CLIENT_SHARED_TYPES.has(i.target!)));
  assert.deepEqual(bad.map(show), []);
});

test('the browser bundle has no package imports', () => {
  assert.deepEqual(all.filter((i) => i.from.startsWith('client/') && i.target === null).map(show), []);
});

test('client/lib does not know its callers', () => {
  const bad = all.filter((i) => i.from.startsWith('client/lib/') && (under(i.target, 'client/pages') || under(i.target, 'client/admin') || i.target === 'client/main' || i.target === 'client/admin'));
  assert.deepEqual(bad.map(show), []);
});

test('the public bundle does not pull in admin code', () => {
  const pub = (f: string) => f === 'client/main.ts' || f.startsWith('client/pages/') || f.startsWith('client/lib/');
  const bad = all.filter((i) => pub(i.from) && (under(i.target, 'client/admin') || i.target === 'client/admin') && !PUBLIC_ADMIN_EXCEPTIONS.has(`${i.from} → ${i.target}`));
  assert.deepEqual(bad.map(show), []);
});

test('the bridge stands alone: node built-ins and its own files only', () => {
  const bad = all.filter((i) => i.from.startsWith('bridge/') && !(i.spec.startsWith('node:') || under(i.target, 'bridge')));
  assert.deepEqual(bad.map(show), []);
});

test('nothing shipped imports build scripts or tests', () => {
  const bad = all.filter((i) => under(i.target, 'scripts') || under(i.target, 'test'));
  assert.deepEqual(bad.map(show), []);
});
