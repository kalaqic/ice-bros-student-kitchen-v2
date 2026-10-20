// One command dev mode: esbuild watch for the client + auto-restarting server.
import { spawn } from 'node:child_process';
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const client = run('node', ['tools/build-client.mjs', '--watch']);
setTimeout(() => {
  const server = run('npx', ['tsx', 'watch', 'server/src/index.ts']);
  const stop = () => { client.kill(); server.kill(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}, 800);
