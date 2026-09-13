# Shared spherical root uncertainty

Implemented 2026-09-12 in engine/geometry/spherical-root-bounds.js. CPU reference
contract only; not yet used to reduce GPU refusal bands. No per-object saved
epsilon or new scene field is introduced.

## General rule

Numerical bounds belong to algorithms and their runtime inputs. Propagate input
uncertainty through operations, then propagate it through the sensitivity of
the inverse query. Instances of one primitive use the same implementation.
Different primitive/geometry formulas need different derivations, not manually
tuned values on every authored object. The precedent is PBRT's
[Managing Rounding Error](https://www.pbr-book.org/4ed/Shapes/Managing_Rounding_Error).
The formulas here are our adaptation to the spherical equation, not copied code.

The pure sphericalRootBounds routine solves boundary candidates for
a cos(t/R) + b sin(t/R) = c with c>0 and explicit absolute errors da,db,dc.
Let h=hypot(a,b), dh=hypot(da,db). The coefficient rectangle lies in the disk
of radius dh around (a,b). Thus amplitude lies in [h-dh,h+dh]; if h>dh,
phase lies within asin(dh/h) of atan2(b,a). Positive c makes c/h monotone in
both numerator and denominator, so its endpoint ratios bound acos(c/h).
Combine phase and angle intervals, then enumerate periods in physical units.

If the whole amplitude interval lies below c, there is no boundary anywhere.
If the ratio interval reaches1, retain a tangency ambiguity interval. Do not
clamp it into a confident hit or silently throw away a potential intersection.
Bands touching t=0 or the requested horizon remain range-boundary refusals;
overlapping bands and exhausted event budgets remain explicit refusals.
Returned events describe surfaces, not occupied intervals or a scene hit.
For example, an inside start may have an exit event; occupancy policy is owned
by the caller and is not inferred from the absence of an entry.

sphericalBallRootBounds maps dot(position,center), dot(direction,center) and
cos(radius/R) to this contract. For a dot product, each component contributes
|x|dy + |y|dx + dx*dy to its input-error estimate. A radius perturbation dtheta
changes cosine by at most |sin(theta)|dtheta + dtheta^2/2. R is the declared
unit scale, treated as exact by this API. The caller owns valid unit spherical
points/tangents and a bound enclosing their upstream uncertainty.

## Limits that must survive GPU integration

Input errors are mandatory. Zero is an explicit caller assertion of exact input,
not a default. Errors must account for serialization, precision conversion,
normalization, carried camera state and portal transfer. Norm/orthogonality
residual alone cannot bound directional error: a wrong unit vector can have
perfect residuals. Do not fabricate a portal-error estimate from those residuals.

The geometric envelope derivation is conditional on the supplied errors. The
JavaScript implementation adds a64-epsilon binary64 engineering allowance for
arithmetic/transcendentals. This is NOT a portable directed-rounding libm proof
and NOT a justified float32 shader bound. A GPU version needs its own operation
analysis and backend checks, including our reduced trig polynomial. No claim
that every intermediate operation is enclosed on every possible JS engine.

Do not insert only interval midpoints into the existing event sweep and discard
their widths. Ordering, horizon clipping, Boolean membership and foreground
selection must respect overlapping root bands. Do not shrink global E: it also
protects unrelated portal and half-space cases. Begin with spherical balls;
retain existing behavior until a complete renderer path is verified.

## Evidence and next step

spherical-root-bounds.test.js checks241 roots against independent sign bisection
at coefficient-box corners, including phase wrap and two ball scales. Checks
also cover widening errors, true tangency, definite miss, range-boundary and
event-budget refusals, metric-ball construction, and missing errors.
Removing the amplitude input-error term causes a bracketed root to escape its
band (0.5999885532459376); restored implementation passes. These are sampled
checks of the derivation, not an exhaustive floating-point proof.

Next: propagate explicit position/direction uncertainty through one E3-to-S3
portal transfer, derive float32 coefficient bounds, and consume root intervals
in event ordering. Then compare the saved gallery census and broader tangent,
antipodal, multiple-crossing and horizon cases on real GPU and SwiftShader.
The gallery's52 refusal rays remain a baseline; none have been recolored or
resolved by this CPU-only commit.

Validation at base1eab350, LeoPC/Windows/Node24.20.0: full approved-host
node tools/test.js129/129 suites passed (.agent-bridge/spherical-root-bounds-suite.log).
No browser rerun: the module is not wired into rendering in this increment.

## Hit-side integration decision (2026-09-13)

The enclosure miss path is now exposed optionally. Its amplitude proof is NOT
a root-time proof. A quarter-turn of a shared sine/cosine pair preserves its
norm exactly but moves entry time by pi*R/2. The counterexample is pinned in
spherical-curve-error.test.js with independent entry sign brackets. It is a
counterexample to an inference, not evidence the actual shader has that phase
error. Neither the miss algorithm nor its validity is changed.

Use the existing additive-event-order.js machinery for the first hit-side
prototype, not the scalar-root CSG sweep. Restrict it to complete-S3 regions
with admitted additive balls, first E3-to-S3 transfer, and certified outside
starts for ALL competing balls. Other scenes keep their current query path.

The producer must retain upstream point/direction boxes and bound the evaluated
curve relative to arclength: range reduction, division by R, folded phase,
polynomial evaluation and packed coefficients. The current post-fold-domain
and amplitude analysis alone does not establish that bound. No new numeric
constant is admitted by this decision. Reuse existing coefficient/root envelope
formulas only after their float32 operation bounds are justified.

Select a definite entry only when its entire interval is strictly before every
competing surface event and the earliest possible portal/horizon refusal. Keep
ambiguous/tangent events as competitors; never drop them to obtain a hit. A
late uncertainty need not erase an independently certified foreground entry.
Reuse selectAdditiveEntry/firstAdditiveEntry after validating these preconditions.
Do not infer them from a valid ball ID or from CPU/GPU agreement.

An ordered entry interval certifies owner/order, NOT the shading position. Do
not feed its midpoint to the current hit/normal path as an exact root. Retain
the interval through a separately checked surface-location/refinement step and
normal evaluation. Preserve status, owner, distance, normals, range and portal
ordering checks; no global E change and no tolerance fitted to a pixel census.

Next bounded implementation: a smallest separate-program hit-band experiment
for the recorded first-transfer sphere hits, reusing transfer boxes and event
ordering. Measure whether phase/coefficient bounds leave usable separated bands
before adding a production packet format or widening the main shader. The
existing main-program compilation cliff is a reason to keep that experiment
small. Do not start another general-purpose interval helper family.
