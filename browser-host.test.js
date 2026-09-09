// The WSL interop route, tested without launching anything.
//
// Every assertion here runs on any platform, because the bug this guards
// against is a platform bug and a test that can only fail on one machine is
// how the last one survived. The behaviour that genuinely needs a browser --
// that the Windows tree is reaped -- is verified by running `page-check` from
// WSL and by the WARNING it prints if anything survives; that is recorded in
// docs/qa/check-runbook.md, not faked here.
import assert from 'node:assert/strict';
import {
  browserCandidates, findBrowser, isWindowsExe, hostPathForBrowser, runStamp,
} from './tools/browser-host.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

test('WSL prefers the WINDOWS Chrome, and it is first', () => {
  // The whole point. A Linux Chrome may well be installed in WSL and it is
  // precisely the one that cannot start -- seccomp denies socketpair -- so
  // finding it first would reproduce the block this module routes around.
  const wsl = browserCandidates({ wsl: true });
  assert.ok(isWindowsExe(wsl[0]), `first candidate on WSL should be a .exe, got ${wsl[0]}`);
  assert.ok(wsl[0].startsWith('/mnt/'), 'reached through the interop mount');
  const linuxIndex = wsl.findIndex((p) => p === '/usr/bin/google-chrome');
  assert.ok(linuxIndex > 0, 'the Linux Chrome is still a fallback, just not first');
});

test('off WSL the candidate list is unchanged in shape', () => {
  // This module replaced page-check's own findBrowser, so the hosts that
  // already worked must keep looking in the same places.
  const plain = browserCandidates({ wsl: false });
  assert.ok(plain.some((p) => p && p.includes('Google Chrome.app')), 'macOS path kept');
  assert.ok(plain.some((p) => p === '/usr/bin/google-chrome'), 'linux path kept');
  assert.ok(plain.some((p) => p === '/usr/bin/chromium'), 'chromium kept');
  assert.ok(!plain.some((p) => p && p.startsWith('/mnt/')), 'no interop paths off WSL');
});

test('isWindowsExe decides by extension, case-insensitively', () => {
  assert.equal(isWindowsExe('/mnt/c/x/chrome.exe'), true);
  assert.equal(isWindowsExe('C:\\x\\CHROME.EXE'), true);
  assert.equal(isWindowsExe('/usr/bin/google-chrome'), false);
  assert.equal(isWindowsExe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), false);
});

test('a missing browser says WHERE it looked', () => {
  // "no Chrome found" on a host with three plausible install locations is a
  // message that costs someone twenty minutes.
  try {
    findBrowser(['/definitely/not/here/chrome', '/nor/here/chrome.exe']);
    assert.fail('expected a throw');
  } catch (error) {
    assert.match(error.message, /definitely\/not\/here/, 'names the paths tried');
    assert.match(error.message, /nor\/here/, 'all of them');
  }
});

test('paths are only translated for a browser that needs it', () => {
  // Translating on the wrong host would call wslpath where it does not exist,
  // and NOT translating on WSL hands Chrome a Linux path it silently resolves
  // against the Windows drive root.
  assert.equal(hostPathForBrowser('/tmp/x', '/usr/bin/google-chrome'), '/tmp/x');
  assert.equal(hostPathForBrowser('/tmp/x',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), '/tmp/x');
  if (process.platform === 'win32') {
    // On Windows there is nothing to translate even for a .exe.
    assert.equal(hostPathForBrowser('C:\\tmp\\x', 'C:\\chrome.exe'), 'C:\\tmp\\x');
  }
});

test('each run gets its OWN stamp, and it is inert', () => {
  // Cleanup finds this run's processes by exact match on this string. Two runs
  // sharing one would let a finishing run kill a starting one's browser --
  // which is why it is not the profile path: a warm leased profile is shared
  // between runs by design.
  const a = runStamp(), b = runStamp();
  assert.notEqual(a, b, 'two runs must never share a stamp');
  assert.match(a, /^--nilgame-run-id=[0-9a-f-]{36}$/, 'a switch, not a word Chrome acts on');
  // Nothing in the stamp may look like a Chrome switch that does something.
  assert.ok(!/--(headless|user-data-dir|no-sandbox|remote-debugging)/.test(a));
});

console.log(`\nbrowser host: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
