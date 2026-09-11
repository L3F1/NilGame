# MUSE-58 global portal truth — measured report

## Host probe (once, verbatim verdict)

```
host      : LeoPC (linux, WSL), node v22.23.2
chrome starts : NO -- WSL UtilBindVsockAnyPort socket failed
queue     : no worker serving
VERDICT: browser checks are UNAVAILABLE here.
```

Node-only task; no browser run attempted. No full suite, no agents, no commits.

## What was built

`global-portal-truth.test.js` (new, allowed write): 45 rotated S3 rays
(3 R x 3 X-W rotations x 5 rays) plus unrotated radial/body/roundtrip cases.
Uses existing `compileFramedPortals` + `createSphericalCover` at R = 0.5, 8,
10000. No engine edits. Independent oracle: own great-circle evaluator, 720
samples bracketing + to - signed-height sign changes, 60-step bisection, then
metric + chord (`|at-center| = 2 sin(d/2R)`, agreement < 1e-9) disc check.
Sampling is a cross-check, not proof (grazing orbits could hide between
samples; all cases here are transverse).

## Measured results (LeoPC, node v22.23.2, base ee54f24)

- `node global-portal-truth.test.js` → PASS:
  `global portal truth: 45 rotated rays + radial/body/antipodal/roundtrip
  cases at R=0.5,8,10000 passed`
- `node global-portal.test.js` (baseline) → PASS (unchanged).
- Coverage confirmed: full-orbit hit at (2π-0.2)R > πR; on-plane inward start
  yields 2πR event, never zero; antipodal +direction hits at πR with landing at
  aperture center, reversed direction null; too-short maxTravel null (direct
  and 2πR variants); oversize body and far-offset null with oracle agreement;
  front-side-away ray null over full 2πR (antipodal-disc miss, oracle agrees);
  S3→E3→S3 and E3→S3→E3 roundtrips: position drift ≤ 1e-9·R, speed |v| = 2
  preserved, carry inverts.
- No legitimate-case engine failures found; no repro to hand back, no test
  weakened, no engine fix attempted.

## Isolated fail demo (old early-back-side return)

Copied test + `engine/world/region-portal.js`, `engine/geometry/
spherical-cover.js`, `metric-space.js`, `geom.js` to `/tmp/muse58fail/` with
relative layout preserved; in the copy only, restored the old policy
(`if(R*asin(...)<=TOL)return null` for all S3, dropping the `s3-cover`
exemption). Copied suite FAILED as required:

```
AssertionError [ERR_ASSERTION]: R=0.5 phi=0 full-orbit: engine null where
oracle hits at 3.0415926535897935
```

Scratch removed (`rm -rf /tmp/muse58fail`). Checkout proof: `git status
--short` shows only `?? global-portal-truth.test.js`; `git diff --stat`
empty — no engine diff.

## Files

- Added: `global-portal-truth.test.js`
- Added: `docs/qa/muse58-global-portals.md` (this report)

READY FOR REVIEW

## Lead verdict - ACCEPTED, 2026-09-11

Scope and unchanged checkout HEAD verified against ee54f24. Host focused rerun
passed; isolated old-policy mutation rerun caught the reported full-orbit case.
See muse-log.md for scope/limitations and connected-global-review.md for integration.
