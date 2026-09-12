# Stable E3-to-S3 transfer in the live renderer, 2026-09-12

Base323aa73. The live connected trace now uses e3S3TransferSelected for eligible
E3-to-S3 transfers. It uses the already-selected crossing distance, not a second
root solve. The sinc construction avoids radial division at the aperture center.
The existing wrapper still solves its own plane root for isolated conformance
tests. Both paths share the same evaluation body.

Eligibility is E3 source, S3 destination and the helper's small-angle envelope
|mapped|/R<=.25. Other cases retain the original general transfer path. Portal
selection, rim checks, selected distance, traveled distance accumulation, root
ordering, E, half-space guards and refusal colors are unchanged. No relaxation
of any confidence threshold is part of this integration. The GPU interval
reference is not claimed as a proof of every live upstream state.

## Evidence rerun

LeoPC/Windows/Node24.20.0, RTX5070Ti/ANGLE D3D11 and SwiftShader; all browser work
through the host queue, sequentially:

- page-check --three-geometry:9 checks pass real and software GPU. Gallery entry
  still has52 numerical refusals, no confident disagreement in19200 center rays.
- page-check --connected-global:52 checks pass, real GPU.
- page-check --connected-preview:16 checks pass, real GPU (bounded rooms).
- page-check --h3-gpu, with and without --sw: both pass the existing H3 corpus.
- Live-wiring mutation: add0.1 to the selected distance only at the live helper
  call. Software gallery census fails with500 confident GPU disagreements.
  Restore the selected distance; software three-geometry check passes again.
  Thus the tests exercise the live call, not only its isolated shader probe.

Generated images remain under the existing page-check screenshot paths. This
change is algebraic evaluation infrastructure, not a reported visual-quality
improvement; the measured refusal counts are unchanged.

## MUSE-74 accepted, corrected revision

Integrated portal-transfer-truth.test.js and docs/qa/muse74-transfer-bounds.md
from run2026-09-12T07-17-54-000Z-fb8483c0 at base017901c. The corrected oracle
normalizes transported output at its destination while leaving the perturbed
input inside its declared box. Lead rerun:36/36 enclosed, all36 inputs nonunit.
The earlier raw-output oracle is superseded, not retroactively validated.

Lead reran its mutation: omit parallel transport in the interval reference.
The corrected test fails at center/exact-frame direction3. Restore and36/36
passes. No counterexample found in this sampled corpus; broader directions,
frames and multiple-transfer error propagation are not certified by it.

Next: compute propagated GPU error bounds alongside this chosen evaluation and
connect spherical-root intervals to the separately verified additive ordering.
Keep the existing guards until that complete path has conformance evidence.

Full approved-host node tools/test.js:132/132 suites passed
(.agent-bridge/live-transfer-suite.log). Inspected regenerated320x240 gallery
entry image: layout and magenta fringes remain, consistent with unchanged counts.
