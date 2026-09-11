# MUSE-59: connected-global CPU truth

Independent checks on `compileConnectedCoverWorld` + `levels/fixtures/connected-global.nil.json`
via existing `traceRegionSight` / `moveRegionProbe`. No engine edits (`git diff --stat` empty).

## Host probe (once)

```
host      : LeoPC (linux, WSL), node v22.23.2
chrome starts : NO -- WSL UtilBindVsockAnyPort socket failed
queue     : no worker serving
VERDICT: browser checks are UNAVAILABLE here.
```

Node-only per task. No browser run, no full suite, no agents, no commits.

## What was built

`connected-global-truth.test.js` (new, allowed write). Expectations derived in-test
from authored fixture coordinates with great-circle math: entry plane at y=0 gives
leg 2; chart centers E=[0,0,0,1], X=[0,-1,0,0] give central angle pi/2, and the
basis-mapped entry forward dots the short-way heading at -1, so the sphere leg is
the long way 3pi/2*8 = 12pi; target surface at 3-0.6 = 2.4. Total 2+12pi+2.4.

## Measured results (LeoPC, node v22.23.2, base 518fd48)

- `node connected-global-truth.test.js` -- PASS (all groups below).
- `node connected-cover.test.js` (baseline) -- PASS, unchanged.
- Full route: hit on flat-target, crossings enter-sphere @2.0 / leave-sphere
  @2+12pi, segments flat/sphere/flat = 2 / 12pi / 2.4, all within 1e-9.
- Range ladder (eps 1e-6): before-entry miss/0 cross; after-entry miss/1;
  before-return miss/1; after-return miss/2; before-target miss/2; after-target
  hit. All as expected.
- Budgets 0/1: unresolved crossing-budget (0/1 crossings); budget 2: hit.
- Inside-ball (sphere blob, origin at -0.5 depth): unresolved inside-start.
  Near-tangent (offset r+1e-9, exact tangent): unresolved; offset r+0.05: miss.
  Head-on endpoint 5e-9 short: unresolved range-boundary; 1e-3 short: miss.
- Blocked exit: blocker ball makes transit gap -0.45; probe travels 39 frames
  then blocked-exit / destination-clearance-insufficient, stays in sphere.
- No engine failures on legitimate cases; nothing to repair, no test weakened.

## Isolated fail-demo (crossing-budget guard removed in /tmp copy only)

Copied test + engine + levels + root modules to /tmp/muse59fail, replaced the
`crossings.length >= maxCrossings` guard with a no-op comment. Suite FAILED loudly:

```
AssertionError [ERR_ASSERTION]: 'hit' == 'unresolved'
    at file:///tmp/muse59fail/connected-global-truth.test.js:79:10
```

Budget-0 ray crosses instead of refusing. Scratch removed (`rm -rf /tmp/muse59fail`);
checkout shows only `?? connected-global-truth.test.js`, no engine diff.

READY FOR REVIEW

## Lead acceptance - 2026-09-11

Accepted after main-checkout focused rerun and isolated budget-removal mutation.
Landmarks added by lead required selecting sphere-blob by ID instead of array0;
semantics unchanged. See connected-global-gpu-review.md for integrated evidence.
