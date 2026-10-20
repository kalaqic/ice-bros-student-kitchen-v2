// Bundles the server (incl. ws) into one plain JS file: server/dist/server.mjs
// Lets the game run with only `node server/dist/server.mjs` (no npm install needed).
import * as esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['server/src/index.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node18',
  outfile: 'server/dist/server.mjs', external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
