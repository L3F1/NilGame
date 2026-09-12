# E3 ray/sphere correction (2026-09-12)

Base69c090c. The captured primary rays are not exactly unit length. More
importantly, subtracting b*b-c near a tangent amplifies rounding. A scalar
float32 replay with the packed sphere shows that merely inserting a=dot(u,u)
into the quadratic can reverse, rather than reduce, the error. It was not used.

The live shader now uses closest approach for p+t*u:
centre=-dot(p-centreOfBall,u)/dot(u,u); foot=(p-centreOfBall)+centre*u;
heightSquared=radiusSquared-dot(foot,foot); roots=centre +/-
sqrt(heightSquared/dot(u,u)). This solves the actual represented line without
assuming normalization is exact. The same helper handles the E3 region's
spherical extent. Nonpositive direction norm refuses; the existing near-tangent
uncertainty band remains, now on squared perpendicular height. Ranges, event
ordering and all strict settled-pixel equality checks are unchanged.

This is numerical stabilization, NOT a new certified error bound. It does not
prove a general guarantee for arbitrary scales, resolve all purple pixels, or
prove why primary-ray values varied between separate diagnostic draws.

## Evidence

The tiny GPU probe uses the actual packed marker centre/radius and the captured
ray directions. An independent surface-sign bisection brackets the entry root.
The legacy shader reproduces BOTH historical values exactly on the RTX5070Ti:
2.594233274459839 and2.594223976135254. New values are2.594228982925415 and
2.594228744506836, versus reference2.5942289324473293 and2.5942287339815255.
Errors fall from roughly4.34e-6/4.76e-6 to5.05e-8/1.05e-8. The two new
answers need not be identical: the represented input lines differ.

The same source is used by the live shader and probe. In the final29-case
corpus, the legacy unit-length mutation fails20 cases. Candidate worst error:
6.40e-7 real GPU,2.65e-7 SwiftShader. Three exact tangent/miss/zero-direction
classification checks were added after the real run and passed on SwiftShader.
Input floats are rounded before the reference. No GPU assertion compares only
against a JS copy of the candidate formula.

Live hardware and software three-geometry checks passed, including the strict
resize baseline and motion parity. Shader compilation and --worlds passed.
Images were regenerated; the refined entry image was inspected without a
structural artifact found. These sampled passes do NOT close intermittent
primary-ray variability. Refinement stays default-off; software motion timings
remain explicitly incomplete. No claimed frame-rate improvement.

Data: [e3-ball-line-evidence.json](e3-ball-line-evidence.json). Local logs in
.agent-bridge/: e3-line-candidate-real, e3-line-live-real, e3-line-live-sw,
e3-line-shaders, e3-line-worlds (all .log). GPU: RTX5070Ti / ANGLE D3D11 on
LeoPC and SwiftShader. Full connected checks use160x120 still-view parity,
48x36 motion parity and320x240 timings, as recorded by those existing probes.

Next: preserve the captured failure and strict guards, but do not spend another
session blindly rerunning the resize loop. Focus on E3-active moving portal
views (the previous route only generated the pass on4 timed poses), keeping
CPU comparison of newly resolved answers and explicit incomplete timer status.
Any recurrence now needs new primary/distance captures, not attribution to the
old quadratic by default. AA and default admission remain later gates.

Full Node suite:136/136 passed on LeoPC (.agent-bridge/e3-line-suite.log).
git diff --check passed.
