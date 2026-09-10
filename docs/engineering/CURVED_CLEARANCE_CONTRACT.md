# Intrinsic clearance, not a fitted wall-offset warning

Astra decision, 2026-09-10. Authoring diagnostics contract, not an implemented UI.
MUSE-40 establishes face-limited exactness in its sampled hallway, not global
exactness of every S3 cell/Boolean distance query. Corners remain conservative.
Do not promote scene capabilities or claim universal safety from the 720 samples.

## What the author specified

A geodesic-cell is a center c, orthonormal construction axes a_i and face offsets
h_i, with curvature radius R. Face normals in the unit S3 embedding are
n_(i,s) = s*cos(h_i/R)*a_i - sin(h_i/R)*c, for s = +/-1.
The solid satisfies p.n <= 0 for all six faces. Its face height is
R*asin(clamp(p.n,-1,1)). This is a great-sphere construction; varying side lengths
clips the faces but does not bend their supporting spheres differently.

For a point expressed in center-local exponential coordinates v, let l=|v|.
p=cos(l/R)*c + sin(l/R)*v/l, with the continuous l=0 limit.
Thus p.n = s*cos(h_i/R)*sin(l/R)*v_i/l - sin(h_i/R)*cos(l/R).
Use the actual decoded p for scene-origin author coordinates: they are generally
NOT center-local v. Confusing those two charts recreates the scale error.
This exact relationship is the reference; a fitted 'peel' curve is unnecessary.

Same position numbers in two geometries preserve a chosen coordinate convention,
not clearances, lengths between arbitrary points or traversal intent. E3 boxes
must be explicitly converted to S3 cells; changing a geometry enum does not make
unsupported constructions valid. Never silently alter source scene data.

## Three diagnostic outcomes

At a point p for player radius r and margin m:
- CLEAR CERTIFIED: a valid exterior lower bound d satisfies d >= r+m.
- BLOCKED CERTIFIED: an exact query or an occupied witness within the player's
  metric ball proves insufficient clearance. Label a failed margin separately
  from actual overlap when the exact distance lies between r and r+m.
- UNRESOLVED: the conservative bound fails clearance but no collision witness
  or exact query proves blockage. Show the bound and its guarantee, not 'wall hit'.

For an isolated cell exterior point, a face can certify exact distance: project
p to its supporting great sphere q=(p-(p.n)n)/sqrt(1-(p.n)^2). If the active
violated face's q lies in every cell half-space and in the supported patch, q is
an attained lower bound, hence exact. Near singular projection or ambiguous
containment, return unresolved. This certificate does not automatically apply
to a cell cut by other solids or to the whole scene union. Use the existing field
as a bound unless a query-specific certificate establishes more.

For routes, fixed sampling is evidence only. A certificate needs intervals:
an endpoint's lower bound minus interval arclength bounds every point on that
interval by the metric triangle inequality. Subdivide uncertain intervals within
a budget, or use conservative advancement. Exhaustion is unresolved. A negative
sample proves blockage only with the guarantee/witness described above.

## First editor implementation

Show construction dimensions separately from intrinsic player clearance.
Measure at an author-selected point or route, with region, R, r, margin and
certificate status visible. Highlight the responsible face/primitive if known.
Do not predict walker step cost from clearance alone: contact response and solver
budgets also matter. No automatic resizing, no universal warning distance and no
unqualified 'safe route' badge from a sampled grid. Whole-scene modifier semantics
and nested-cutter conservatism remain independent open work.
