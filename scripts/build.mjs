// Bundles the client (TS + CSS) into public/assets with content hashes,
// then writes src/generated/assets.ts so the worker can reference them.
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outdir = 'public/assets';
await rm(outdir, { recursive: true, force: true });

const result = await build({
  entryPoints: { app: 'client/main.ts', style: 'client/styles/index.css' },
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  outdir,
  entryNames: '[name]-[hash]',
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const files = Object.keys(result.metafile.outputs).map((f) => '/' + path.relative('public', f));
const pick = (prefix, ext) => files.find((f) => f.startsWith(`/assets/${prefix}-`) && f.endsWith(ext));

await mkdir('src/generated', { recursive: true });
const manifest = `export const assets = ${JSON.stringify({ js: pick('app', '.js'), css: pick('style', '.css') }, null, 2)} as const;\n`;
// Only touch the file when hashes change, so the dev server doesn't loop on its own output.
const prev = await readFile('src/generated/assets.ts', 'utf8').catch(() => '');
if (prev !== manifest) await writeFile('src/generated/assets.ts', manifest);
console.log('client built →', pick('app', '.js'), pick('style', '.css'));
