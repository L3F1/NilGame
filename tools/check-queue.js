// tools/check-queue.js -- run a browser check from a host that cannot.
//
//   node tools/check-queue.js --serve                 (on Windows, once)
//   node tools/check-queue.js page-check --ball-lab   (anywhere, incl. WSL)
//   node tools/check-queue.js page-check --region-lab
//   node tools/check-queue.js --list
//
// WHY THIS EXISTS, and why it is a file queue rather than anything cleverer.
//
// The sandboxed agent shell cannot start Chrome by ANY route. The Linux Chrome
// dies on `socketpair: Operation not permitted` (AF_UNIX). Launching the
// Windows Chrome through WSL interop dies on
// `UtilBindVsockAnyPort:309: socket failed` (AF_VSOCK) -- that is WSL's own
// `/init` transport failing before Chrome is even reached, so it is not a
// Chrome flag problem and there is nothing to tune. Measured twice, identical,
// 0 s wall. That route is closed and this file does not try to reopen it.
//
// What the sandbox DOES allow is ordinary files, and both hosts already share
// one disk -- the agent works in the same checkout, reached through /mnt/c. So
// the browser stays entirely on the Windows side and only a request and a
// result cross between them. No sockets of any family, no interop, no proxy
// variables to strip, nothing that can be denied by a seccomp policy. It is
// the least clever mechanism available and that is the reason to choose it:
// every more capable design so far has been blocked by something.
//
// THIS IS A REMOTE EXECUTION CHANNEL, so it is an ALLOWLIST and not a shell.
// A request names one of the checks below and passes flags that are validated
// against a schema; anything else is refused by the worker with a reason. A
// request can never name a command, a path, or an argument the schema does not
// describe. Whoever runs `--serve` is lending their machine, and they are
// entitled to know exactly what it can be asked to do.
import {
  mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync,
  existsSync, statSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const QUEUE_DIR = join(ROOT, '.check-queue');
const HEARTBEAT = join(QUEUE_DIR, 'worker.json');
// How stale a heartbeat may be before we call the worker gone. The worker
// writes every 2 s, so this tolerates a few missed beats during a long job
// without letting a dead worker look alive for long.
const HEARTBEAT_STALE_MS = 15000;

// --- what may be asked for -------------------------------------------------

const numeric = (max) => (value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= max;
const PRESETS = ['fight', 'hoops', 'grapple', 'sphere', 'light', 'dropper',
  'lap', 'race', 'street', 'torus', 'nil', 'sol', 'sl2r'];

/**
 * The checks a request may name, and the flags each accepts.
 *
 * `bare` flags take no value. `valued` flags are `--name=value` and the
 * validator decides. Nothing else is passed through -- in particular no
 * paths, so a request cannot reach a file the schema does not describe.
 */
export const ALLOWED = {
  'page-check': {
    script: 'tools/page-check.js',
    bare: ['--worlds', '--ball-lab', '--region-lab', '--sw', '--warm'],
    valued: { '--timeout': numeric(900) },
    note: 'boots the page in a real browser and runs its in-page checks',
  },
  'play-check': {
    script: 'tools/play-check.js',
    bare: ['--switch', '--no-folds', '--sw', '--warm'],
    valued: {
      '--preset': (v) => PRESETS.includes(v),
      '--seeds': numeric(64), '--seed': numeric(1e6), '--frames': numeric(60000),
      '--timeout': numeric(900),
    },
    note: 'plays the game with seeded input for many frames',
  },
  'link-time': { script: 'tools/link-time.js', bare: [], valued: {},
    note: 'measures real-driver shader link time per program' },
  'net-check': { script: 'tools/net-check.js', bare: [], valued: {},
    note: 'relay and peer transport checks' },
  'march-check': { script: 'tools/march-check.js', bare: [], valued: {},
    note: 'replays the marching loop over many rays' },
  'shader-check': { script: 'tools/shader-check.js', bare: [], valued: {},
    note: 'compiles and links every program' },
  'sdf-check': { script: 'tools/sdf-check.js', bare: [], valued: {},
    note: "every world's two SDFs agree" },
};

/**
 * Check a requested job against the allowlist.
 *
 * Returns the argv to run, or throws with a message saying what was wrong.
 * Deliberately strict and deliberately explicit: a silent drop of an
 * unrecognised flag would let a requester believe it measured something it
 * did not.
 */
export function validateJob({ check, args = [] }) {
  const spec = ALLOWED[check];
  if (!spec) {
    throw new Error(`unknown check "${check}". Allowed: ${Object.keys(ALLOWED).join(', ')}`);
  }
  if (!Array.isArray(args)) throw new Error('args must be an array');
  for (const arg of args) {
    if (typeof arg !== 'string') throw new Error('every arg must be a string');
    if (spec.bare.includes(arg)) continue;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? null : arg.slice(eq + 1);
    const validator = spec.valued[name];
    if (!validator) {
      throw new Error(`${check} does not accept "${arg}". `
        + `Flags: ${[...spec.bare, ...Object.keys(spec.valued).map((n) => `${n}=`)].join(' ') || '(none)'}`);
    }
    if (value === null) throw new Error(`${arg} needs a value, as ${name}=VALUE`);
    if (!validator(value)) throw new Error(`${arg}: value not allowed`);
  }
  return [spec.script, ...args];
}

// --- the shared directory --------------------------------------------------

const ensureQueue = () => { mkdirSync(QUEUE_DIR, { recursive: true }); };

/** Write a file the other side may be reading, without it ever seeing a half-file. */
function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};

/** Is somebody serving? Returns the heartbeat, or null if stale or absent. */
export function workerStatus(now = Date.now(), heartbeatPath = HEARTBEAT) {
  const beat = readJson(heartbeatPath);
  if (!beat || typeof beat.at !== 'number') return null;
  return now - beat.at <= HEARTBEAT_STALE_MS ? beat : null;
}

// --- the worker ------------------------------------------------------------

async function serve() {
  ensureQueue();
  if (workerStatus()) {
    console.error('another worker is already serving this queue; not starting a second');
    process.exit(2);
  }
  const me = { pid: process.pid, host: hostname(), platform: process.platform, startedAt: Date.now() };
  console.log(`serving ${QUEUE_DIR}`);
  console.log(`host: ${me.host} (${me.platform}), pid ${me.pid}`);
  console.log(`checks: ${Object.keys(ALLOWED).join(', ')}`);
  console.log('Ctrl-C to stop.\n');
  const beat = setInterval(() => writeAtomic(HEARTBEAT, JSON.stringify({ ...me, at: Date.now() })), 2000);
  writeAtomic(HEARTBEAT, JSON.stringify({ ...me, at: Date.now() }));
  const stop = () => {
    clearInterval(beat);
    try { unlinkSync(HEARTBEAT); } catch { /* already gone */ }
    console.log('\nstopped serving');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // One at a time, deliberately. Browser checks contend for the GPU and for
  // profile leases, and two concurrent cold runs measure each other rather
  // than the code.
  for (;;) {
    const pending = readdirSync(QUEUE_DIR)
      .filter((f) => f.endsWith('.request.json'))
      .sort();
    if (!pending.length) { await new Promise((r) => setTimeout(r, 500)); continue; }
    const file = join(QUEUE_DIR, pending[0]);
    const job = readJson(file);
    try { unlinkSync(file); } catch { /* someone else took it */ }
    if (!job || !job.id) continue;
    await runOne(job);
  }
}

async function runOne(job) {
  const started = Date.now();
  const result = { id: job.id, check: job.check, args: job.args, startedAt: started,
    host: hostname(), platform: process.platform };
  let argv;
  try {
    argv = validateJob(job);
  } catch (error) {
    console.log(`REFUSED ${job.check} ${(job.args || []).join(' ')}: ${error.message}`);
    writeAtomic(join(QUEUE_DIR, `${job.id}.result.json`), JSON.stringify(
      { ...result, exitCode: 2, stdout: '', stderr: `refused: ${error.message}`,
        finishedAt: Date.now() }, null, 2));
    return;
  }
  console.log(`RUN     ${job.check} ${(job.args || []).join(' ')}`);
  const out = await new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    // Bounded: a runaway job must not fill the disk with its own output.
    child.stdout.on('data', (c) => { stdout = (stdout + c).slice(-200000); });
    child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-100000); });
    child.on('error', (error) => resolve({ exitCode: 127, stdout, stderr: String(error.message) }));
    child.on('close', (code) => resolve({ exitCode: code === null ? 1 : code, stdout, stderr }));
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${out.exitCode === 0 ? 'ok     ' : 'FAIL   '} ${job.check} -> exit ${out.exitCode}, ${seconds} s`);
  writeAtomic(join(QUEUE_DIR, `${job.id}.result.json`),
    JSON.stringify({ ...result, ...out, finishedAt: Date.now() }, null, 2));
}

// --- the requester ---------------------------------------------------------

async function request(check, args, waitMs) {
  ensureQueue();
  try { validateJob({ check, args }); }
  catch (error) { console.error(error.message); process.exit(2); }

  const beat = workerStatus();
  if (!beat) {
    console.error('No check worker is serving this queue.');
    console.error(`Queue: ${QUEUE_DIR}`);
    console.error('');
    console.error('Browser checks need a host that can start Chrome. Ask whoever has');
    console.error('the Windows machine to run, from the repository root:');
    console.error('');
    console.error('    node tools/check-queue.js --serve');
    console.error('');
    console.error('and leave it running. Then re-run this command.');
    process.exit(3);
  }
  console.error(`worker: ${beat.host} (${beat.platform}), pid ${beat.pid}`);

  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  writeAtomic(join(QUEUE_DIR, `${id}.request.json`),
    JSON.stringify({ id, check, args, createdAt: Date.now(), from: hostname() }, null, 2));
  console.error(`queued ${check} ${args.join(' ')}`);

  const resultPath = join(QUEUE_DIR, `${id}.result.json`);
  const deadline = Date.now() + waitMs;
  let warnedGone = false;
  while (Date.now() < deadline) {
    if (existsSync(resultPath)) {
      const result = readJson(resultPath);
      if (result) {
        try { unlinkSync(resultPath); } catch { /* leave it */ }
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        const seconds = ((result.finishedAt - result.startedAt) / 1000).toFixed(1);
        console.error(`\n[${result.check} ran on ${result.host}, exit ${result.exitCode}, ${seconds} s]`);
        process.exit(result.exitCode);
      }
    }
    // A worker that dies mid-job would otherwise leave us waiting the full
    // timeout with no idea why.
    if (!workerStatus() && !warnedGone) {
      warnedGone = true;
      console.error('WARNING: the worker stopped heartbeating; it may have died mid-job');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`\nTimed out after ${(waitMs / 1000).toFixed(0)} s waiting for a result.`);
  console.error('The job may still be running on the worker; check its console.');
  process.exit(4);
}

// --- CLI -------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--serve')) return serve();
  if (argv.includes('--list') || !argv.length) {
    const beat = workerStatus();
    console.log(beat
      ? `worker: ${beat.host} (${beat.platform}), pid ${beat.pid}, serving`
      : 'worker: none serving (start one with --serve on a host that has Chrome)');
    console.log(`queue : ${QUEUE_DIR}\n`);
    for (const [name, spec] of Object.entries(ALLOWED)) {
      console.log(`  ${name.padEnd(13)} ${spec.note}`);
      const flags = [...spec.bare, ...Object.keys(spec.valued).map((n) => `${n}=`)];
      if (flags.length) console.log(`  ${' '.repeat(13)} ${flags.join(' ')}`);
    }
    return undefined;
  }
  const waitFlag = argv.find((a) => a.startsWith('--wait='));
  const waitMs = waitFlag ? Number(waitFlag.slice(7)) * 1000 : 900000;
  const rest = argv.filter((a) => a !== waitFlag);
  return request(rest[0], rest.slice(1), waitMs);
}

if (process.argv[1] && process.argv[1].endsWith('check-queue.js')) {
  await main(process.argv.slice(2));
}
