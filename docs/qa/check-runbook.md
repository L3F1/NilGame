# Check runbook: which host runs what

Companion to the [required-checks table](../engineering/WORKING_RULES.md),
which says which check a change needs. This file adds only the dimension
that table lacks: **which machine it runs on and how long it takes**.
"Ran here" = WSL, node v22.23.2, main@9356527, timed 2026-09-09.
"Cited" = taken from the named run, not re-run.

## The two platform restrictions

1. **Browser/GPU checks run ONLY on Windows.** WSL's Linux node cannot
   spawn Chrome (socketpair block: `UtilBindVsockAnyPort: socket failed`),
   so every check needing a page, ANGLE or a real GPU is Windows-only.
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
