# E3-to-S3 transfer uncertainty reference

Implemented 2026-09-12, base6739145. Modules:
engine/geometry/float32-interval.js and portal-transfer-bounds.js.
Neither is wired into the live renderer. The current gallery image and shader
refusal policy are unchanged.

## What the calculation owns

e3S3TransferBounds receives an E3 point and direction, their explicit component
error bounds, a compiled source/destination aperture frame, an explicit frame
error, physical curvature radius and travel horizon. It encloses the source
plane crossing, mapped position and parallel-transported normalized direction.
It does not choose between portals, certify an unobstructed path, move a body,
or permit an ambiguous aperture rim crossing. Those remain caller decisions.

Scalar intervals expand outward to adjacent binary32 values at every operation.
Input enclosures include representational rounding as well as the supplied
upstream errors. Dot products, division, vector length, normalization, frame
mapping and transport all propagate intervals. A denominator containing zero,
overflow, ambiguous entering direction, horizon contact or uncertified aperture
clearance returns an explicit unresolved reason. Missing input errors are errors
in the caller, not silently zero uncertainty.

The spherical exponential uses a stable small-angle evaluation of
center*cos(m/R) + (mapped/R)*sinc(m/R). Taylor interval evaluation includes
remainder enclosures for |m/R|<=.25: sinc through degree6 and cosine through
degree8. This avoids dividing by m at the aperture center. Parallel transport
uses the sphere's ambient formula with its denominator bounded away from zero;
the resulting tangent is interval-normalized. Outside the angular envelope,
the reference refuses rather than extrapolating a polynomial guarantee.

## What it does not prove

This is an outward binary32 REFERENCE execution model. It is not a statement
that an existing GPU instruction stream follows this operation order. The live
shader uses another trig/range-reduction sequence. Shader compiler
reassociation, native sqrt behavior, fused operations, and subnormal handling
need separate consideration. Host elementary operations are assumed to have
normal IEEE accuracy; this is not a formal verification of every JS runtime.

The caller must provide a legitimate E3/S3 compiled frame and input uncertainty.
Unit-length residuals cannot establish directional error. Zero frameError means
the compiled binary64 frame is treated as the reference, with binary32 encoding
covered by interval construction; it does not assert exact recovery of arbitrary
real-valued author intent. Frame validation is owned by the geometry compiler.

Only one E3-to-S3 transfer is implemented. S3-to-E3, H3, repeated transfers and
error in prior curved motion are not automatically covered by this function.
The mapped intervals can feed sphericalBallRootBounds, but that reference uses
its own binary64 operation allowance. Neither module is GPU admission alone.

## Tests and next integration

portal-transfer-bounds.test.js compares90 perturbed-point crossings with the
existing metric/portal implementation, across the original and rotated/translated
frames. Maximum position interval width in this corpus is9.5367431640625e-7.
Central rays, rim/horizon ambiguity, parallel directions, missing errors and
division-through-zero are checked. A generated ball3 physical units beyond a
central crossing has both its2.4 and3.6 boundary distances enclosed after feeding
the transfer intervals into the spherical root API.

Mutation: replace the transported direction by the untransported frame vector.
The reference enclosure check fails on direction component0; restored passes.
This evidence is sampled, not proof for every aperture and error box. In
particular, all corners of simultaneous frame/direction perturbations are not
exhaustively sampled here.

Next: implement the chosen stable transfer evaluation and its uncertainty
tracking together in an isolated GPU path. Compare returned point/direction
against both reference intervals and the existing CPU portal before connecting
spherical root intervals to width-aware event ordering. Keep the current global
E and half-space guards. Admit only with real-GPU/SwiftShader tests, tangencies,
range boundaries, and no new confident disagreements in the saved gallery
census. Do not claim the reference encloses the old shader merely because the
geometric formulas are algebraically equivalent.

Validation: LeoPC/Windows/Node24.20.0, full approved-host node tools/test.js
130/130 suites passed (.agent-bridge/portal-transfer-bounds-suite.log). No
browser rerun: these reference modules do not change the live rendering path.
