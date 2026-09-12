# Experimental H3 solid and aperture queries

Not admitted by scene/portal/GPU factories yet. Use the explicit experimental
H3 adapter. A bounded miss means the requested ray segment was checked; reaching
the adapter domain first is unresolved/domain-exit, never a sky or wall.

## Additive balls (implemented)

hyperbolic-balls.js exports sampleHyperbolicBall and castHyperbolicBalls.
Ball centre must be inside the author domain, radius in (0,R]. Sample is signed
physical metric distance minus radius; normal is outward at the query point.
At the centre normal is null/nonunique. No Boolean exact-distance claims.

Ray input is a unit physical tangent, explicit finite nonnegative maxDistance,
and optional finite integer maxTests. Starts inside/on a ball refuse. Tangencies,
coincident nearest surfaces and roots close to the range boundary refuse. A
nearer well-separated surface may beat a later uncertain event. Work exhaustion
refuses the whole query, without treating untested balls as absent.

Analytic centre separation uses A cosh(t/R)+B sinh(t/R); closest approach gives
the entry root. Existing floating-point guard bands are heuristic, not interval
proofs. Independent sweeps must precede scene use. Report a counterexample rather
than widening tolerances to make CPU/GPU agree. No shader implementation yet.

## Finite aperture helper (implemented; integration gated)

hyperbolic-aperture.js is separate from compileFramedPortals (gate stays).
queryHyperbolicAperture(space,{center,normal,radius},p,u,{maxDistance,bodyRadius=0})
returns hit with physical distance/point, bounded miss, or unresolved with reason.
Validate centre in domain, positive radius <=R, unit spacelike normal tangent at
centre, unit ray direction, finite nonnegative range/bodyRadius. Height is
R*asinh(Lorentz(p,normal)); the plane is totally geodesic through the centre.

An entering crossing goes positive to negative. Its plane equation is
A cosh(t/R)+B sinh(t/R)=0, with A=<p,n>, B=<u,n>. Use the positive finite root
only; a back-side start cannot produce a later entering crossing on an H3
geodesic. On-plane starts, near-asymptotic coefficients and range/rim ambiguity
must refuse rather than claim a confident miss. Keep tolerances explicit in
physical units and report tested scale range. Do not normalize invalid inputs.

Compute radial aperture clearance using intrinsic distance(center,intersection)
plus bodyRadius. A negative clearance outside the uncertainty band is a miss;
rim ambiguity is unresolved. Domain-before-root yields unresolved/domain-exit;
requested range strictly before all events can miss. No portal transit/camera
mapping, schema admission, renderer work or host motion changes in this helper.

Current guard policy: coefficient band max(1e-10,128*machine-epsilon*
(1+abs(A)+abs(B))); physical residual/range/rim base band 1e-9R. Rim band
also includes the heuristic arclength root spread. Tested scales .5/8/10000.
Every unresolved result exports uncertaintyFrom:0; distance is diagnostic only.
This deliberately makes no safe-prefix claim based on a heuristic interval.

## Consumer integration gate

Current portal consumers accept hit-or-null, not the helper's three outcomes.
Never adapt unresolved to null, or treat its distance as a confirmed crossing.
Before integration, define an earliest-uncertainty distance: a finite lower bound
in physical arclength before which this aperture cannot affect this query. If
no such bound is established, use zero. A numerical root estimate alone is not
that bound. No new metadata may upgrade the existing heuristic guards to proofs.

A definite solid or portal can win only when strictly before every competing
uncertainty bound (including tie tolerance). Otherwise return unresolved, retain
the responsible aperture/region and reason, and perform no speculative transit.
Domain-exit uncertainty must not conceal a definitely nearer solid. Movement
may consume only an independently certified safe prefix; do not spend remaining
time or create correction debt by treating uncertainty as a contact normal.

Required consumer regressions: a near solid before remote uncertainty, unknown
at the origin, uncertainty tied with a portal/domain event, reversed portal
array order, and preservation of movement time/state on refusal. These are
future integration requirements, not claims about the currently gated runtime.
