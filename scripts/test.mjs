// Runs test/*.test.ts on Node's built-in test runner. No test framework to install: esbuild (already here)
// bundles each test file first. `npm test -- sse` runs only files whose name contains "sse".
import { build } from 'esbuild';
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outdir = '.test-build';
await rm(outdir, { recursive: true, force: true });
const only = process.argv.slice(2);
const files = (await readdir('test')).filter((f) => f.endsWith('.test.ts') && (!only.length || only.some((o) => f.includes(o))));

await build({
  entryPoints: files.map((f) => `test/${f}`),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir,
  outExtension: { '.js': '.mjs' },
  jsx: 'automatic',
  jsxImportSource: 'hono/jsx',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});

const res = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map((f) => `${outdir}/${f.replace(/\.ts$/, '.mjs')}`)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
});
await rm(outdir, { recursive: true, force: true });
process.exit(res.status ?? 1);
