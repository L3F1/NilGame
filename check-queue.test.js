// The cross-host check queue: what it will and will not agree to run.
//
// This is a REMOTE EXECUTION CHANNEL. Somebody lends their machine by running
// `--serve`, and a request arriving from another host decides what runs on it.
// So the allowlist is the security boundary, and these are the tests that keep
// it one. Everything here is pure: no worker, no browser, no filesystem beyond
// a temp heartbeat, so it runs on any host including the one that cannot start
// Chrome -- which is the whole point of the queue existing.
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateJob, workerStatus, ALLOWED } from './tools/check-queue.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const refuses = (job, pattern, why) => assert.throws(() => validateJob(job), pattern, why);

test('a request may only name a check on the list', () => {
  refuses({ check: 'rm-rf' }, /unknown check "rm-rf"/);
  // And the refusal says what IS allowed, because the requester is on another
  // machine and cannot read this file to find out.
  try { validateJob({ check: 'nope' }); assert.fail('expected throw'); }
  catch (error) { assert.match(error.message, /page-check/, 'lists the allowed checks'); }
  for (const name of Object.keys(ALLOWED)) {
    assert.ok(Array.isArray(validateJob({ check: name })), `${name} is runnable with no args`);
  }
});

test('A REQUEST CANNOT NAME A PATH', () => {
  // The failure that would matter most: a bare argument passed through to the
  // child would let a request reach any file on the lender's machine.
  refuses({ check: 'page-check', args: ['/etc/passwd'] }, /does not accept/);
  refuses({ check: 'sdf-check', args: ['../../secrets'] }, /does not accept/);
  refuses({ check: 'page-check', args: ['--user-data-dir=/etc'] }, /does not accept/);
  // Nor can it smuggle one through a flag that IS allowed but takes a number.
  refuses({ check: 'play-check', args: ['--seeds=../../etc'] }, /value not allowed/);
  refuses({ check: 'play-check', args: ['--preset=../../etc'] }, /value not allowed/);
});

test('the argv handed to the child is built from the schema, not the request', () => {
  const argv = validateJob({ check: 'page-check', args: ['--ball-lab'] });
  assert.equal(argv[0], 'tools/page-check.js', 'the script comes from the allowlist');
  assert.deepEqual(argv.slice(1), ['--ball-lab']);
  // The requester never chooses the script, so a check name can never resolve
  // to a file of the requester's choosing.
  assert.ok(Object.values(ALLOWED).every((s) => s.script.startsWith('tools/')));
});

test('unknown flags are REFUSED, never silently dropped', () => {
  // Dropping one quietly would let a requester believe it measured something
  // it did not -- a --sw run reported as a real-GPU run, say.
  refuses({ check: 'page-check', args: ['--headless'] }, /does not accept/);
  refuses({ check: 'sdf-check', args: ['--worlds'] }, /does not accept/);
  // And the message names the flags that would have worked.
  try { validateJob({ check: 'page-check', args: ['--nope'] }); assert.fail('expected throw'); }
  catch (error) { assert.match(error.message, /--ball-lab/, 'names the real flags'); }
});

test('valued flags are bounded, not merely present', () => {
  assert.ok(validateJob({ check: 'play-check', args: ['--seeds=3', '--frames=6000'] }));
  refuses({ check: 'play-check', args: ['--seeds=0'] }, /value not allowed/, 'zero seeds');
  refuses({ check: 'play-check', args: ['--seeds=99999'] }, /value not allowed/, 'over the cap');
  refuses({ check: 'play-check', args: ['--seeds=-4'] }, /value not allowed/, 'negative');
  refuses({ check: 'play-check', args: ['--seeds=3.5'] }, /value not allowed/, 'not an integer');
  refuses({ check: 'play-check', args: ['--seeds'] }, /needs a value/, 'no value at all');
  refuses({ check: 'play-check', args: ['--preset=nonesuch'] }, /value not allowed/);
  assert.ok(validateJob({ check: 'play-check', args: ['--preset=sol'] }), 'a real preset passes');
});

test('a malformed request is refused rather than coerced', () => {
  refuses({ check: 'page-check', args: 'not-an-array' }, /args must be an array/);
  refuses({ check: 'page-check', args: [42] }, /must be a string/);
  refuses({ check: 'page-check', args: [{ toString: () => '--ball-lab' }] }, /must be a string/);
});

test('a stale heartbeat does not count as a worker', () => {
  // A requester that trusts a dead worker's heartbeat waits the full timeout
  // and then reports a failure that never ran. Worse than saying so at once.
  const dir = mkdtempSync(join(tmpdir(), 'nil-queue-'));
  const beatPath = join(dir, 'worker.json');
  const now = 1_000_000_000_000;
  writeFileSync(beatPath, JSON.stringify({ pid: 1, host: 'x', at: now }));
  assert.ok(workerStatus(now + 1000, beatPath), 'a fresh beat is a live worker');
  assert.equal(workerStatus(now + 60_000, beatPath), null, 'a minute old is gone');
  assert.equal(workerStatus(now, join(dir, 'absent.json')), null, 'no file, no worker');
  writeFileSync(beatPath, 'not json at all');
  assert.equal(workerStatus(now, beatPath), null, 'garbage is not a worker');
  writeFileSync(beatPath, JSON.stringify({ pid: 1, host: 'x' }));
  assert.equal(workerStatus(now, beatPath), null, 'a beat with no timestamp is not a worker');
});

console.log(`\ncheck queue: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
