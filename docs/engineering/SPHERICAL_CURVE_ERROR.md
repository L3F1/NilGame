# Spherical curve evaluation: conditional exterior contract

Implemented in spherical-curve-error.js and the TEST-ONLY
refinement-enclosure-glsl.js predicate enclosureCurveExterior. Production
rendering/certificate consumption is unchanged. This closes the mathematical
policy decision for the next integration, not unconditional WebGL accuracy.

## Claim and domain

A consumer evaluates ONE shared pair (s,c)=sincos(theta), then p*c+u*s. Each
component of p,u and field centre C has magnitude <=2; field constant magnitude
<=2. A certified upper bound on every |theta|=|t/R| on the leg is <=64.
Nonfinite data, unsupported bounds, or a failed exterior proof refuse a
certificate. The interval exporter may retain its wider encoding domain; this
predicate imposes the narrower evaluated-curve domain.

The post-fold argument x must satisfy |x|<=1.575. Under binary32 round-nearest
arithmetic, y=fl(theta+P), d=2P (P is packed pi), mod uses y-d*floor(y/d).
For |theta|<=64, |y|<68, |y/d|<11; quotient error is <2^-20. Its floor differs
from the exact floor only by at most one near a boundary. Product/subtraction
errors each have magnitude <=2^-18; hence the residual lies in
[-2e-5,d+2e-5]. Subtracting P and reflecting about +/-P/2 puts the result below
P/2+2^-23 <1.571, within the chosen 1.575 domain. This requires mod to respect
that arithmetic model. The probe also reads x from the same invocation; sampled
domain checks do not prove a universal driver implementation.

Required arithmetic assumptions: binary32 round-to-nearest operations and
coefficient evaluation, or correctly rounded FMA contraction; no precision
lowering. Reassociation must preserve the polynomial with the stated error-path
count. Flushing subnormals to zero is covered by explicit absolute allowances.
The GLSL highp declaration alone does not establish all these assumptions.

## Why phase error drops out

For ANY common x, the ideal pair (sin(x), signC*cos(x)) has unit norm. Thus
C dot (p*cos(x)+u*sin(x)) <= H = sqrt((C dot p)^2+(C dot u)^2), including the
cosine sign fold, regardless of how closely x represents the original theta.
Separate independently evaluated phases do not supply this argument. Before
live use, change the spherical at() path to consume a single pair, with parity
checks. Do not silently treat the current separate cs/sn calls as that contract.

## Derived allowance, not a pixel epsilon

Let unit roundoff u=2^-24 and gamma_n=n*u/(1-n*u). At X=63/40, bound the
absolute sine/cosine polynomial sums by their positive-coefficient Taylor sums
(degrees 13/14). Each monomial path has fewer than 32 error factors: include
rounded denominator literals, coefficient division, repeated z=fl(x*x), Horner
products/additions and the final sine multiplication. Coefficient denominators
such as 87178291200 are not all exactly representable.

For each component, gamma_32 times that sum, plus the Taylor remainder
X^15/15! or X^16/16!, plus 2^20*MIN_NORMAL, is <delta=2^-17. The FTZ term is
intentionally generous: fewer than 32 polynomial stages with amplification
below 2.5^8 cannot reach it. Exact rational integer comparisons in
spherical-curve-error.test.js check these inequalities without evaluating sin
or cos or rounding their coefficients.

Let W=sum_i |C_i|*(|p_i|+|u_i|). The rounded position and 4-component dot add
at most gamma_9*(1+delta)*W under the same operation model. Since
 delta + gamma_9*(1+delta) < 2^-16,
 the computed dot is <= H + 2^-16*W + 256*MIN_NORMAL.
The last absolute term covers input/intermediate FTZ for the short position/dot
DAG under the component <=2 restriction. Signed packed S3 rows must convert
BOTH centre and constant signs, as before.

The predicate encloses H and W with the existing outward BI operations, adds
the allowance, and outward-evaluates constant minus that upper bound. A strictly
positive LOWER gap proves computed exterior including final subtraction. For
boxes, W uses per-component absolute maxima over their full bounds, not just
nominal vectors. Exclusions must be reproved over the exported symmetric box.

## UNKNOWN is not geometry

This contract permits an UNKNOWN result to become certified exterior. The old
occupancy E threshold denotes uncertainty; it is not a physical surface.
Do not require gap>E merely to preserve that uncertainty when exterior is
proved. If a caller explicitly promises identical old occupancy classification,
that STRONGER promise requires gap>E and must be named separately. This path
supplies neither new hits nor roots; actual hit/root ordering stays unchanged.

## Next integration and stop condition

The primitive is ready for a bounded serialized producer/consumer experiment:
use the new evaluated-curve predicate, derive an outward max-angle bound from
range/R, and use one shared pair in the consumer's spherical at() evaluation.
Retain world/sample/gate ownership, first-leg expiry, fallback and the 64 MiB
cap. Re-run settled pixels, exclusions and full-frame timings on both backends.
Record how many ideal misses now refuse due to the allowance. Do not loosen
this bound to retain a historical recovery count. If the fourth attachment plus
stricter proof yields no useful image improvement, keep the old default-off
path and move to hit-side root intervals; do not start another epsilon family.

The earlier default-off exact-identity path also inherited the ideal-curve
assumption. These new conditional bounds are not retroactively applied to it.
See docs/qa/spherical-curve-error-review.md for evidence and limitations.
