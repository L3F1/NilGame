# MUSE-74 rev: E3-to-S3 transfer bounds audit (oracle correction)

## Lead-found oracle issue (prior check was NOT correct)

The reference interval API returns a NORMALIZED outgoing direction
(`direction:normalize(transported)` in
`engine/geometry/portal-transfer-bounds.js:38`), but the prior oracle
compared the raw nonunit `exact.carry(v)` against that enclosure. Transport
is linear, so the raw carry keeps the perturbed input's nonunit scale while
the bands enclose a unit vector: wrong representative on the reference side.
The prior 36/36 pass does not validate the old oracle; it is superseded.

## Correction (test oracle only, no production code touched)

Raw perturbed v stays inside its declared component box and drives the plane
crossing as before; the oracle now normalizes only the OUTPUT with the
destination S3 metric at the arrival point before containment:

`out = dest.normalize(exact.position, exact.carry(v))`

This is output policy matching the API contract, not input rescaling: v
itself is never moved (still asserted in-box per case), and normalization
happens after `carry` at `exact.position`, mirroring the API's own
`normalize(transported)`. Added assertion: at least one perturbed input has
norm != 1 (observed 36/36, so the raw-vs-normalized distinction is live in
every case, not vacuous).

## Corpus

Seeded regression `portal-transfer-truth.test.js` (seed 747400, mulberry32):
`e3S3TransferBounds` vs compiled `gate.transit`/`carry` on 3 frames (fixture
+ two rotated/translated variants), 4 geometries each (center, 0.75R rim,
75-degree grazing, off-center tilt), 3 simultaneous point+direction
perturbations each: 36 checks. Position error 1e-7, direction error 1e-4 per
component. One widened `frameError=1e-7` enclosure per case also checked.

## Result (focused)

36/36 enclosed (distance + 4 position + 4 direction components, exact and
widened frames). Max position interval width 2.7e-4 (grazing rays amplify the
1e-4 direction box). Nonunit perturbed inputs 36/36. No counterexample:
corpus not expanded, claim unchanged, no production code touched.

## Fail-demo (isolated /tmp copy only, scratch removed)

Skipping parallel transport (`transported=vector`) in the copy fails the
corrected check: `center/exact-frame: direction 3 not enclosed`.
Delivered-tree `engine/`/`app/` verified untouched via `git status`
(only the two allowed untracked files present).

## Assumptions: tested

In-box simultaneous point+direction perturbations; 3 aperture frames;
center/rim/grazing geometries; normalized-output containment (not
closeness); small frame-error widening against the nominal-frame reference.

## Assumptions: NOT tested

No GPU/shader enclosure claimed (host-probe verdict `browser checks are
UNAVAILABLE here`: WSL vsock bind fails, no queue worker; no browser/queue/
shader runs). No S3-to-E3, H3, repeated transfers, curved-motion priors,
rim/horizon refusal boundaries, large error boxes, or other JS runtimes.
Reference-path op order differs from interval path, so this is sampled
evidence, not proof.

## Checks (LeoPC linux WSL, node v22.23.2, base 017901c)

- `node portal-transfer-truth.test.js`: PASS (36/36, nonunit 36/36).
- `node tools/test.js`: 131/131 suites passed, including new file. No failures.
- `node tools/host-probe.js`: browser checks UNAVAILABLE (see above).
- Writes limited to the two allowed files; no commits/pushes; no agents used.

ACCEPTED BY LEAD (corrected revision)

Lead acceptance at base323aa73: focused36/36 rerun and isolated mutation
reproduced; see live-transfer-review.md.
