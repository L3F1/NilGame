# S3 bound collapse: verdict (MUSE-40)

Muse, 2026-09-10. Corpus: `s3-bound-truth.test.js` — 3 checks, green.
Reads: contract + amendment, `sphericalPrimitive` and its callers
(read-only, as authorised), MUSE-34's documented reference. Nothing else.

## One-line verdict

Conservative bound behaving exactly: the field equals slab truth
everywhere measured, and the 77x is the walker paying contact-regime
churn for a route whose true (slab) clearance is −0.05. No defect in
`sphericalPrimitive`'s distance function. MUSE-34 stands; MUSE-38's
"250x collapse" is corrected below.

## Evidence

- Ratio field `bound/truth = 1.0000` (min and p10) on a 720-sample hallway
  grid (5 clearances × 24 stations × 3 heights) at R = 8 AND R = 10000.
  Safety (`field <= truth + 1e-9`) holds on every sample.
- Burn point [2.85,−3,0.9], R = 8: field 0.2001, truth 0.2001, author gap
  0.35. Winner: the facing x− plane's own extension (werr ~1e-13) — correct
  at its face center (0.0000), reading 0.20 three units along-face because
  the great sphere peels ~0.14 off the author plane there. All other terms
  deeply negative; composition innocent.
- Peel profile (field along x = 2.85): R = 8: 0.200→0.351 rising to the
  face center; R = 10000: flat 0.350. Separation is curvature-as-geometry
  (where the wall is), not extra shortfall.
- Reconstructions: R1 single cell alone 0.2001 = truth (room innocent);
  R2 full room identical (composition innocent); R3 flat 0.3500; R4 face
  center 0.3510.
- Walk-truth loop (truth on every 10th leg): R = 8, 2778 steps, drift
  0.045, min slab clearance −0.0499 — genuinely in contact; R = 10000,
  36 steps, min clearance +0.1000. The churn is contact regime, and the
  flat control never enters it.

## Correction to MUSE-38 (same author)

Two errors in my MUSE-38 report: (1) "bound ~4e-4" conflated advance-p50
with bound values — bound p50 is 0.227; the 4e-4 steps are contact-regime
advances. (2) "truth 0.1" used the author box as truth — slab truth is
0.20, clearance −0.05. The walk data (2778/36) was and is correct; the
"250x under-report in open space" was not. MUSE-34's fractional shortfall
was never contradicted — nothing on this grid is a seam case.

## Consequence

Marching against `field.distance` is safe (one-sided, verified); the cost
lives in the walker's contact regime, entered here because author
clearance (0.35 − 0.25 = 0.10) minus slab peel (~0.15 far along-face) went
negative. Authoring rule candidate: warn when author-clearance minus the
peel for the face length at hand drops below r.

## Next experiment

Map peel vs along-face distance and face length (single-cell scenes,
varying h_y at fixed R) to fit the authoring margin formula, then check
the jamb-hug and corner routes against it — if their costs also equal
contact-regime time, one rule covers all three.

## Runs

`node s3-bound-truth.test.js` → `3 checks passed, 0 failed`
(WSL node v22.23.2 @ 4e9dbc9). Status: READY FOR REVIEW.
