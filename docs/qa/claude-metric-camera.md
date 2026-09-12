# Metric-aware camera frame assembly (H3 adapter)

Base `f52251c`. Scope: `engine/geometry/metric-space.js`, `engine/world/camera-frame.js`,
`hyperbolic-camera.test.js`, this file. No scenes, portals, renderers or schemas touched;
H3 remains unadmitted by scene factories.

## Change

`createMetricSpace` now exposes `ambientDot(a, b)`: two finite vectors of the adapter's
dimension, Euclidean scalar, off-tangent vectors accepted (that is its purpose). It takes no
point and does not validate tangency, so it cannot be confused with `dot`. `spherical-cover`
inherits it through its existing `{...metric}` spread. `hyperbolic-space.js` already exposed a
validated Lorentz `ambientDot` and was not modified.

`camera-frame.js` no longer writes the ambient product itself. `toTangent` takes its basis
coefficients with `space.ambientDot`; `createCameraFrame`'s cross-product coefficients use
`space.dot(position, ...)`, valid because `f` and `u` are already repaired tangents. A space
without `ambientDot` is refused by name — there is no Euclidean fallback for an unknown metric.

## The bug this fixes, isolated

Verified against the pre-change file loaded as an in-memory data-URL module (the two changed
call sites reverted, nothing written to disk, so no scratch to restore):

| author radius | old aim error | new | old `right` vs new |
|---|---|---|---|
| 0.00 | 0.000° | 0.000° | 0.000° |
| 0.30 | 4.992° | 0.000° | 5.066° |
| 0.80 | 28.812° | 0.000° | 35.495° |
| 1.44 | 52.908° | 0.000° | 38.160° |
| 1.80 | 74.992° | 0.000° | 0.000° |

The failure is not the obvious one and is worth recording. The Euclidean projector still returns
a *tangent* vector — every frame axis is Lorentz-orthogonal to `p`, so any combination of them is
tangent — and therefore `validateTangent` never fires and nothing downstream refuses it. It
simply returns the **wrong** tangent vector: given an already-tangent unit input, a projector must
be the identity, and the Euclidean one rotates the aim instead, by zero at the origin and by up to
75° at the domain edge. Any test written at the origin passes. This is pinned in
`hyperbolic-camera.test.js` under *"H3 repairs an off-tangent input..."*, which fails if reverted.

## Tests added — `hyperbolic-camera.test.js`, 16 checks

Every H3 claim is measured with a Lorentz form written in the test file, never the adapter's own
`dot`, and every geometric claim is made off the origin.

- **ambientDot contract**: Euclidean value on E3/S3 including a vector S3 rejects as non-tangent;
  agreement with `dot` on tangents; arity/finiteness refusals on E3/S3/H3; `spherical-cover`
  inheritance; a space stripped of `ambientDot` is refused, not approximated.
- **Frame assembly** off-origin: Lorentz Gram matrix and tangency, worst residual **8.88e-16**.
- **Handedness**: `right = -y` for the lab's forward `+x`/up `+z`; independently, the oriented
  4-volume `det[p, right, forward, up]` equals that of the construction frame, and reverses for a
  mirrored aim. Degenerate/parallel aims are refused.
- **Turns**: yaw and pitch reproduce `cos`/`sin` against the original axes to 1e-13; yaw and pitch
  do not commute (0.6/0.5 either order differ by ≫1e-2); roll survives and `rollAgainst` reads it
  back; `alignUp(…, 0.5)` leaves exactly half the roll without re-aiming forward.
- **Carry / holonomy**: a frame carried round a closed hyperbolic equilateral triangle picks up
  the angle defect `π − 3A`, `cos A = cosh(a/R)/(1 + cosh(a/R))`, for R ∈ {1, 1.25, 4}, three side
  lengths, both senses, to **1e-11** — the closed form computed in the test, not by the adapter.
  The identical code with `cosh → cos` on S3 gives the same formula with the opposite sign
  (excess −0.495595), which is what shows the H3 number is curvature and not a harness artefact.
- **Carried, not rebuilt**: after turn/step/turn/step the frame differs from `space.frame` at the
  arrival point while remaining orthonormal and tangent. A 400-step walk holds tangency and norm
  to **2.22e-15**.
- **E3/S3 parity**: the previous Euclidean-ambient implementation is restated as `legacyAxes` and
  15 frames across E3/S3 match **to the last bit** (`assert.equal`, not a tolerance). E3/S3/cover
  frames still survive a 25-step walk and are still not rebuilt from construction.

## Checks run

| Check | Result |
|---|---|
| `node hyperbolic-camera.test.js` | 16 passed, 0 failed |
| `node camera-frame.test.js` | 9 passed, 0 failed |
| `node metric-space.test.js` | 18 passed, 0 failed |
| `node hyperbolic-space.test.js` | passed, worst scaled distance error 7.28e-16 |
| `node spherical-cover.test.js` | passed |
| `node connected-camera.test.js` | passed |
| `node cross-region-frame.test.js` | 6/6 |
| `node motion-carry.test.js` | 2/2 |
| `node metric-truth.test.js` | 29 passed, 0 failed |
| `node metric-stability-truth.test.js` | 7 passed, 0 failed |
| `node region-sight.test.js` | 17/17 |
| `node region-motion.test.js` | 46/46 |
| `node connected-global-render.test.js` | passed |
| `node engine-foundation.test.js` | 33 passed, 0 failed |
| `node --check` on all three changed/added JS files | clean |
| `node tools/host-probe.js` | chrome starts, no queue worker; no browser run required |

Full suite, browser queue, commits and push deliberately not run, per the handoff.

## Out of scope, observed not changed

- `region-portal.js` and `connected-global-model.js` still take construction coefficients,
  reference-up and elevation with a raw Euclidean sum. They now have `ambientDot` available and
  need the same treatment; contract step 2 is only half done until they do.
- `spherical-cover.js` keeps a private `dot` for chart encode/decode and its orthonormality gate.
  Correct for S3, but it is another ambient-Euclidean assumption in an adapter-shaped file.
- `hyperbolic-space.js` normalization does not repair tangency. Correction from lead review:
  it DOES validate tangency through norm; off-tangent inputs outside tolerance are refused.
  Projection/repair is a separate operation. No production change was needed for this note.

## READY FOR REVIEW

Lead review: source and focused tests rerun on Windows Node24.20.0. 16 camera
checks and Muse's metric corpus pass. Executable corpus measured old-projector
aim error up to37.6 degrees on its chosen inputs; the separate table above is
agent-reported evidence, not that corpus's output. Corrected the test header's
claim that the erroneous projection cannot be tangent. E3/S3 parity is exact
on15 sampled frames, not a universal floating-point theorem.
