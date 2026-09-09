// tools/fixtures/browser-worker.js — real-process fixture for POSIX
// group-cleanup tests. No sockets, no Chrome, no shell: stdout lines only.
//
//   node tools/fixtures/browser-worker.js linger [nchildren]
//     Run until SIGTERM, then exit 0. Spawns nchildren `linger 0`
//     grandchildren, which stay in this process group (no setsid).
//   node tools/fixtures/browser-worker.js ignore-term
//     Swallow SIGTERM, so only SIGKILL can stop it (forced path).
//   node tools/fixtures/browser-worker.js exit-now [code]
//     Print READY, then exit immediately with code.
import { spawn } from 'node:child_process';

const mode = process.argv[2] || 'linger';
const say = (line) => process.stdout.write(`${line}\n`);

if (mode === 'exit-now') {
  say(`READY ${process.pid}`);
  process.exit(Number(process.argv[3] || 0));
} else if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {});
  say(`READY ${process.pid}`);
  setInterval(() => {}, 1000);
} else if (mode === 'linger') {
  const n = Number(process.argv[3] || 0);
  for (let i = 0; i < n; i++) {
    const grand = spawn(process.execPath, [process.argv[1], 'linger', '0'],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    say(`CHILD ${grand.pid}`);
  }
  process.on('SIGTERM', () => process.exit(0));
  say(`READY ${process.pid}`);
  setInterval(() => {}, 1000);
} else {
  console.error(`unknown worker mode: ${mode}`);
  process.exit(2);
}
