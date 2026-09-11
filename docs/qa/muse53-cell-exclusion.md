# MUSE-53: independent full-segment S3 cell-exclusion audit

Muse, 2026-09-11. Base 7e61c4b. Node-only; no helper, classifier, or other
test touched. New audit: `s3-cell-exclusion-truth.test.js` (13/13).
Full Node suite 78/78 (77 prior + 1 new). Verdict: READY FOR REVIEW.

Revision (review follow-up, same base): sampler allowance cut from 1e-12 to
an explicit REF_ALLOW = 1e-14 asserted below every production guard, with the
unsupported "every larger error is caught" claim removed; plane-foot
projections now divide by dot(pole, pole) (test point only, stored poles
untouched) with the on-plane residual tightened to < 1e-12; cutter case
pinned to excluded-via-face-2; far-end-only touch added as a shipped check;
fail-demo rerun as the shipped test against an isolated origin-only mutation
(exit 1, 7 named failures, scratch removed).

## Host and commands

`node tools/host-probe.js` (run once per rules; pasted, not investigated):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : .../muse-53/checkout @ 7e61c4b
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
chrome    : /mnt/c/Program Files/Google/Chrome/Application/chrome.exe
  starts  : NO -- <3>WSL (26 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1
queue     : no worker serving

VERDICT: browser checks are UNAVAILABLE here.
```

No browser run required for this Node-only task; root browser queue not used.

| Command | Result |
|---|---|
| `node s3-cell-exclusion-truth.test.js` | 13/13 |
| `node s3-cell-exclusion.test.js` (existing, preserved) | 6/6 |
| `node tools/test.js` | 78/78 suites passed |

## Reference method (independent of the helper's extrema logic)

For each excluded result, the harness evaluates the NAMED witness face only,
as f(theta) = dot(q(theta), pole) with q(theta) = p*cos + u*sin, on a dense
uniform grid (8192 samples over at most pi rad, spacing < 4e-4) plus
golden-section refinement inside the argmin bracket (80 iterations, no
derivatives). No atan2/phase/amplitude anywhere; stored poles used verbatim,
never renormalized. Every excluded result must have all dense and refined
samples strictly positive and at or above the claimed `lower` within an
explicit reference-roundoff allowance REF_ALLOW = 1e-14. Allowance rationale:
Reviewer qualification: this is an empirical double-precision allowance,
not a certified error bound; JavaScript specifies no portable ulp guarantee
for cos/sin. The test asserts
REF_ALLOW below the production guard of EVERY compared result (smallest guard
observed 2.831e-14, at the cutter off-plane witness). Observed worst sampler gap
(sampled minus claimed lower) is +2.831e-14 (dense and refined, cutter
off-plane d=1e-4): every sample sits above the claimed lower with margin to
spare against the 1e-14 allowance. Honest limit: a sampled minimum can only
overestimate the true minimum (up to roundoff), so this checks the claimed
lower from above; it does not prove production's analytic minimum correct --
a dip narrower than the grid spacing that production also misses would escape
both. Exact special cases (endpoint values, signs, budgets, validation) are
asserted analytically, separate from sampled evidence. Limitation shared with
MUSE-52: cos/sin geodesic evaluation is common with production, and sampling
is converged evidence, not a proof against arbitrarily thin solids.

## Findings

- Compiled translated/rotated cells at R = 0.5/1/8/100 with 8-decimal frames
  (0.87758256/0.47942554 and 0.45359612/0.89120736): 478 excluded rays total
  (119, 119, 120, 120 of 144 each); every refined minimum sits at or above
  the claimed lower, e.g. R=0.5 lower 3.210e-3 vs refined 3.210e-3. Stored
  poles byte-identical before/after screening at every R.
- Rays outside at the origin but entering later are never excluded
  (unknown/no-witness, entry proved by samples < -1e-9). Rays beginning
  inside unknown at ranges 0.05/0.5/2. Zero range excludes (work 1) iff the
  origin is strictly outside; on-plane/inside unknown. Both endpoint touches
  (sin on [0, pi], interior peak 1.0) stay unknown. Near-coplanar (1e-15
  tilt) and identically-zero faces unknown. Full half-circle span never
  excludes a non-degenerate face (refined min < -0.999); beyond pi*R throws
  at R=1 and R=8.
- Budgets exact: caps 0..6 on a witness-at-face-3 cell transition exactly at
  cap 4 (below: unknown/work-budget, work <= cap; above: excluded, face 3,
  work 4). Non-integer maxWork, negative/NaN/over-limit range, non-S3 space,
  non-six-plane cell, and non-unit pole all throw. Scaled position
  (1+1e-10) and non-tangent direction give input-roundoff, never a witness;
  non-unit direction throws.
- Ambiguous face plus a different valid witness: face 0 identically zero,
  face 3 excludes [0, 0.5] (verified by sampling); the same witness fails on
  [0, 2] (entry sampled), giving unknown/no-witness. No persistent face is
  UNKNOWN, never an occupancy claim.
- Far-end-only touch (cos on [0, pi/2], interior min 0.0039 over
  [0, pi/2), endpoint ~0): unknown. This is the origin-only fallacy's
  kill case -- f(0) = 1 would falsely exclude -- and the shipped check that
  fails under the mutation below.
- Authored face-plane poses: an origin exactly on a face plane never gets
  THAT face as witness, but the cell may still exclude via another face
  (compiled cell: on-plane ray excluded via faces 1, 1, 5 at ranges
  0.5/2/8, all verified). Plane-foot projection now divides by
  dot(pole, pole) on the TEST point only (stored poles untouched,
  byte-identical before/after screening at every R). Measured on the face-2
  decimal pole (off-unit 7.00e-10): old residual 9.24e-10, new residual
  8.33e-17; the test asserts < 1e-12.
- Cutter pose: no Claude-reported pose exists in this checkout (integration
  is concurrent at this base), so the equivalent class was constructed: a
  ray starting on an authored subtractor face plane. Pinned: excluded via
  face 2 (lower 1.666e-1, refined 1.666e-1); backing off the plane by 1e-4
  resolved via face 0 (lower 9.689e-5). So a full-span witness DOES resolve
  a strictly-outside cutter cell even from on-plane origins. It does not
  fix every cutter-plane refusal: the on-plane face itself never witnesses,
  ball cutters are outside this screen by construction, and MUSE-52's
  cutter-face-origin ball refusal is unaffected.

## Fail-demo (shipped test vs isolated origin-only mutation, scratch removed)

Scratch copy of the checkout at /tmp/muse53-originonly with the ONLY change
`minimum = A` (origin-only minimum: far endpoint and stationary minima
dropped) in its copy of engine/geometry/s3-cell-exclusion.js. The SHIPPED
revised truth test ran there: exit 1, 6/13, worst sampler gap -3.727e-1.
Working-engine `git status` confirms engine/ untouched; the scratch copy was
removed (`rm -rf`), leaving no muse53 files in /tmp.

```text
EXIT=1
FAIL far-end-only touch stays unknown despite a positive interior: far-end touch never excludes
FAIL outside at origin but entering later is never excluded: later entry blocks exclusion
FAIL pi*R limit: full half-circle never excludes a non-degenerate face: half-circle span cannot exclude cos face
FAIL ambiguous face does not block a different valid full-span witness: ambiguous+valid: dense 0.8775... below claimed lower 0.9999...
FAIL compiled translated/rotated cells at multiple R: every witness verified: R=0.5 ray 0: dense minimum must stay outside (-0.2415...)
FAIL poses on authored face planes: on-plane origins never exclude: on-plane range=0.5: dense 0.4485... below claimed lower 0.4886...
FAIL authored subtractor-cutter pose: screen resolves only a strictly-outside cell: cutter on-plane: dense 0.1665... below claimed lower 0.3900...
```

The shipped test fails without the whole-segment minimum (7 named failures)
and passes with it (13/13 on the real helper). Note the both-endpoint touch
(sin on [0, pi], f(0) = 0) still passes under this mutation -- its origin
value is already 0 -- which is exactly why the far-end-only touch (f(0) = 1)
was added as a shipped check.

## Files

- Added: `s3-cell-exclusion-truth.test.js` (auto-discovered by tools/test.js).
- This report. Task status line in MUSE_TASKS.md.

READY FOR REVIEW. Tests run: focused 13/13 and 6/6, full 78/78 on LeoPC
(node v22.23.2) at base 7e61c4b. No production files touched; no defect found
in the helper -- the sampler cross-check holds within 1e-14 against every
claimed lower, and the fail-demo confirms the shipped test (not a scratch
probe) rejects the origin-only fallacy. Remaining uncertainty: none in the
helper's screening logic per this audit; GPU promotion still needs the pose
corpus and precision work Astra gated, and Claude's integration review will
decide the refusal-coverage question on real scenes.
