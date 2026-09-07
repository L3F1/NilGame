/**
 * PostToolUse hook: run the check that CLAUDE.md says belongs to the file
 * that was just edited.
 *
 * CLAUDE.md carries rules of the form "run tools/shader-check.js after every
 * shader edit" and "run sdf-check after touching either SDF". Written as prose
 * they are things to remember; here they are things that happen. The harness
 * runs this, not the model, so it fires whether or not anyone thought of it.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout, always exits 0
 * -- a non-zero exit from the hook process itself is reported as a broken hook
 * rather than as a failed check, which is not what a failing test means.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

// .claude/hooks/verify.mjs -> the project root two levels up. Prefer the
// environment when the harness sets it; fall back to our own location so the
// hook does not depend on the cwd it is launched with.
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CLAUDE_PROJECT_DIR || resolve(here, '..', '..');

// Which check belongs to which file. Everything here is under two seconds;
// march-check (2.6 s) and page-check (9.5 s, cold) stay manual on purpose.
const CHECKS = {
  'shader.js':  [['tools/shader-check.js']],
  'hyp.js':     [['hyp.test.js'], ['physics.test.js'], ['modes.test.js']],
  'physics.js': [['physics.test.js']],
  'net.js':     [['physics.test.js']],
  'level.js':   [['tools/sdf-check.js'], ['physics.test.js']],
  'modes.js':   [['modes.test.js']],
  'geom.js':    [['geom.test.js']],
};

const readStdin = () => new Promise((res) => {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => res(s));
  // No stdin at all (a hand-run) should not hang the hook.
  setTimeout(() => res(s), 5000).unref();
});

const say = (obj) => { process.stdout.write(JSON.stringify(obj)); process.exit(0); };

const payload = await readStdin();
let hook;
try { hook = JSON.parse(payload); } catch { process.exit(0); }

const path = hook?.tool_response?.filePath || hook?.tool_input?.file_path;
if (!path) process.exit(0);

// Only the project's own files, by name. A same-named file somewhere else
// would run the wrong suite, and the suites only make sense from the root.
if (resolve(path).toLowerCase().indexOf(resolve(ROOT).toLowerCase()) !== 0) process.exit(0);

const runs = CHECKS[basename(path)];
if (!runs) process.exit(0);

/**
 * What to show from a failed run.
 *
 * A tail alone is wrong here. The suites print one line per test in order, so
 * a FAIL lands wherever that test happens to sit -- measured, a broken constant
 * put the only FAIL on line 13 of 117, which a tail of any sane size misses
 * entirely. And a suite that THROWS dies before its summary line, so the tail
 * is the only place the stack trace appears. Take both ends: every failure
 * line, then the last of the output.
 */
function digest(r) {
  const lines = ((r.stdout || '') + '\n' + (r.stderr || '')).trim().split('\n');
  const bad = lines.filter((l) => /^\s*(FAIL|not ok)\b/.test(l) || /^\w*Error\b/.test(l.trim()));
  const parts = [];
  if (bad.length) parts.push(bad.slice(0, 15).join('\n'));
  parts.push(lines.slice(-15).join('\n'));
  return parts.join('\n...\n').slice(0, 4000);
}

const failures = [];
for (const [script] of runs) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
  });
  if (r.status === 0) continue;
  failures.push(`node ${script} failed (exit ${r.status ?? 'timeout'}):\n${digest(r)}`);
}

if (failures.length) {
  say({
    decision: 'block',
    reason:
      `A check that ${basename(path)} owns is now failing. Fix it before ` +
      `going on; do not disable the check.\n\n${failures.join('\n\n')}`,
  });
}

say({ suppressOutput: true });
