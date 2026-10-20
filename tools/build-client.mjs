// Bundles the client with esbuild into client/dist and copies runtime assets.
//   node tools/build-client.mjs          one-off production build
//   node tools/build-client.mjs --watch  rebuild on change (used by npm run dev)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'client', 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const BUILD = String(Date.now());
fs.writeFileSync(path.join(DIST, 'index.html'), fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8').replace(/__BUILD__/g, BUILD));
fs.cpSync(path.join(ROOT, 'assets', 'runtime'), path.join(DIST, 'assets'), { recursive: true });

const opts = {
  entryPoints: [path.join(ROOT, 'client', 'src', 'main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: path.join(DIST, 'main.js'),
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  define: { __BUILD__: JSON.stringify(BUILD) },
};
if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('[client] watching for changes...');
} else {
  await esbuild.build(opts);
  console.log('[client] built to client/dist');
}
