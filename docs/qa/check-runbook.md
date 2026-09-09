# Check runbook: which host runs what

Companion to the [required-checks table](../engineering/WORKING_RULES.md),
which says which check a change needs. This file adds only the dimension
that table lacks: **which machine it runs on and how long it takes**.
"Ran here" = WSL, node v22.23.2, main@9356527, timed 2026-09-09.
"Cited" = taken from the named run, not re-run.

## The two platform restrictions

1. ~~**Browser/GPU checks run ONLY on Windows.**~~ **SUPERSEDED 2026-09-09.**
   The LINUX Chrome still cannot start in WSL -- the sandbox denies
   `socketpair(2)` and no flag avoids it -- but that was never the only
   Chrome available. `tools/browser-host.js` launches the WINDOWS Chrome
   through WSL interop, which runs outside the Linux sandbox entirely.
   Measured from WSL on this machine: `page-check --ball-lab` 57 checks,
   `page-check --worlds` **346 checks in 31.6 s**, both on a real GPU with
   a cold shader cache. See "Running browser checks from WSL" below,
   including the one thing that will bite you if you write this yourself.
2. **`browser-process.test.js` real-worker cases run ONLY on POSIX.**
   Windows has no process groups: `process.kill(-pid)` throws ESRCH even
   for a live child. The suite skips those cases before spawning on
   win32 (MUSE-08); everything else in the file runs on both.

Headless Chrome on Windows was broken, then fixed (unique cold profiles
+ user Chrome update): cold `page-check --worlds` now gives 346 checks,
exit 0 ([integration](opus-integration-2026-09-09.md)). Old
"browser verification blocked" notes are history, not today's state.

## The table

| Check | Proves | Host | Rough time | A failure usually means |
| --- | --- | --- | --- | --- |
| `node tools/test.js` | all 23 root suites green | either | 6 s ran here | real regression; output names the suite |
| `node browser-process.test.js` | owned-process lifecycle + POSIX group tree | either, workers POSIX-only | 2 s ran here | hang = leaked detached child (see MUSE-08) |
| `node tools/ball-conformance.js` | 22 doc cases match JS; emits native expectations | either | <1 s ran here | JS drift; FAIL names the case |
| `node tools/scene-check.js [file]` | scene docs validate; transfer samples | either | <1 s ran here | malformed authoring; message names id/field |
| `node tools/march-check.js` | no exhausted-ray wedge (JS replay) | either | 3 s ran here | grey seam; fix step rule/SDF, not shading |
| `node tools/net-check.js` | relay sockets anywhere; WebRTC self-connect on Windows | split | 42 s ran here (peer FAILs) | relay FAIL = strip sandbox proxy vars; peer FAIL on WSL = expected |
| `node tools/shader-check.js` | all 10 programs compile+link under ANGLE | Windows | cited: integration table | GLSL/syntax error with info log |
| `node tools/sdf-check.js` | JS/GLSL SDF agreement, 21 cases | Windows | cited: integration table | physics/render disagree; needs shared emitter |
| `node tools/link-time.js` | real-driver link cost per program | Windows | cited: 0.7 s editor vs 8.4 s arena ([map](../host-capability-map.md)) | unrolled level loops (once 212 s); Rough time is cold-cache |
| `node tools/page-check.js --worlds [--timeout=N]` | every world STARTS; 346 cold checks | Windows | cited: 28.5 s cold real-GPU | exit 21 = profile in use; assertion names world+check |
| `... --ball-lab` | ball lab boots + probe | Windows | **57 checks**, lead-run 2026-09-09 | same as above, ball scope |
| `... --sw` | same under SwiftShader software GL | Windows | cited: 158.8 s cold (MUSE-04) | slowness expected; GPU-vs-SwiftShader pixels are driver diffs |
| `... --warm` | reuses leased profile for iteration | Windows only (POSIX publication off) | cited: warm 346 final | profile lock = stale owner; run cold first |
| `node tools/render-fixture.js <view> <png>` | saves a before/after view PNG | Windows | not measured here | exit 2 no-Chrome from WSL = expected; see [guide](render-fixture-guide.md) |
| `tools/world-probe.js` | focused-shortcut/menu behavior, injected by page-check | Windows via page-check | inside --worlds time | Digit9-from-focus FAIL = menu guard regression (MUSE-04) |

`--timeout=` only bounds the report wait (default 300 s); it never
changes what is checked. Run browser/GPU checks sequentially; concurrent
Chrome runs distort timings and caches.

## Running browser checks from WSL

Nothing to configure. `page-check` finds the Windows Chrome by itself and
prints `browser : Windows Chrome via WSL interop` when it takes that route.

What makes it work, all measured rather than assumed:

- `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe` launches from
  WSL and exits 0. The earlier reading of EPERM on `chrome.exe` was an
  artifact: `timeout(1)` is itself broken in that sandbox (`timeout 10 echo
  hi` -> Operation not permitted, exit 126) and the probe ran through it.
  Interop was never actually tested.
- Windows Chrome reaches a server bound to **127.0.0.1 inside WSL**, which is
  what `page-check` binds. Tested explicitly rather than inferred from
  `localhost` working.
- `taskkill.exe` and `wslpath` are both on PATH from WSL.
- `--user-data-dir` is translated to a Windows path. Handing Chrome `/tmp/x`
  makes it create that relative to the Windows drive root, silently.

**The thing that will bite you.** Killing the WSL-side child does NOT reap the
Windows Chrome: measured, 11 processes from one run survived both SIGTERM and
SIGKILL to the Linux child, because that child is an interop stub and the real
tree is on the Windows side. A naive port leaks a browser tree per run on the
user's own desktop. So each run stamps a unique inert switch
(`--nilgame-run-id=<uuid>`) onto Chrome's command line, resolves the root of
the tree carrying that stamp, and kills it by PID with `taskkill /T /F`.
Nothing is ever matched by image name, so a run cannot see another run's
browser, let alone the user's own -- which is the standing rule that only a
test's own process tree may be cleaned up. If anything survives, `page-check`
prints a WARNING naming the count rather than widening the match.

**Not yet verified in the sandboxed agent shell.** The measurements above were
taken in a plain WSL shell on this machine. Whether the agent sandbox permits
`execve` of a Windows binary at all is a separate question from whether it
permits `socketpair`, and it has not been tested. Run
`node tools/page-check.js --ball-lab` there first; if it fails, record the
exact error, because it is a different block from the one this routes around.
