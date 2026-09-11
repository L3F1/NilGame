# S3 whole-segment cell exclusion

Astra, 2026-09-11. Implemented mathematical screen:
`engine/geometry/s3-cell-exclusion.js`; integration belongs to Claude.

## Decision

An inactive face can be ignored only after establishing that the cell cannot
contribute anywhere along the requested segment. Origin occupancy, a nearby
sample, an author-coordinate AABB, or a small distance bound is insufficient.
First slice: ONE face excludes the WHOLE closed segment. This is sufficient,
not necessary. Do not try to combine changing witnesses or remove individual
ambiguous roots in this slice.

For q(theta)=p*cos(theta)+u*sin(theta), theta in [0,L/R], the face expression is
f(theta)=A*cos(theta)+B*sin(theta), A=p.n, B=u.n. Cell interior requires f<=0.
The minimum occurs at an endpoint or at phase+pi+2*k*pi, phase=atan2(B,A).
The helper includes endpoint-adjacent stationary minima within an angular guard,
then subtracts a coefficient/angle evaluation guard. Only a strictly positive
result excludes the cell. Positive pole scaling preserves the zero set; stored
compile-legal decimal poles are not rewritten.

This is floating-point numerical screening with the existing JS-double policy,
not formal interval arithmetic or a GLSL-float error bound. Range is physical,
closed, and at most pi*R. Direction remains a unit tangent at the supplied point.

## API and integration

`excludeSphericalCell(space, cell, p, u, {maxDistance, maxWork=6})` returns:

- `excluded`: face index, minimum, guard, positive lower value and work. The cell
  is absent for this exact segment. No surface normal or hit is asserted.
- `unknown`: no witness, input-roundoff or work-budget. This establishes neither
  emptiness nor occupancy; keep the normal query/refusal path.

Work is one screened face, at most six, stopping on the first witness. Validation
is uncharged as in the other query helpers. No mutation, cache or stored token.
Recompute when point, direction, range, cell or compiled world changes.

In castSphericalRegion, screened empty cells have occupancy FALSE throughout the
interval and request no roots. Propagate that constant through existing groups:
an empty base disables its group; an empty subtractor removes nothing; an empty
intersect disables its group. Do not flatten a subtracted cell into six inverted
planes. Do not remove a modifier globally because one base happens to be empty.
Do not invent a normal or owner for a skipped primitive.

Screen before origin Boolean evaluation/root requests so an irrelevant ambiguous
face cannot poison either. Charge every screen to maxWork alongside existing
classification, root and event costs, checking BEFORE spending. Balls and lone
planes keep their present path. Keep maxEvents accounting and input validation.
No witness => existing conservative behavior, including relevant tangencies and
coincidences. An optimization may decline to run if insufficient budget, but it
must not treat a budget refusal as an empty cell.

## Acceptance

Pin rays on authored cutter planes, including a ray that stays outside another
face for the full span and one that later enters it. First case may resolve;
second must never be skipped. Test additive/subtract/intersect and global/scoped
groups, short/long ranges on the same ray, zero range, guard-close endpoints,
near-coplanarity, decimal rotations, physical R scaling, work/event caps and
subtraction normals. Old raw primitive-event refusals remain legitimate.

Where a previous scene test pinned a known irrelevant-face refusal, upgrade it
to an independently verified hit/miss if the new witness applies; keep a second
case with no witness that still refuses. Never just accept either status.
Keep legacy evidence as attributed history. Independent Muse checks must not
duplicate this extrema implementation or silently normalize test poles.

## Chart exits and GPU boundary

Keep `unresolved/domain-exit` in the kernel and diagnostic colors in the tool.
No automatic sky or collision wall at a chart edge. A future explicit visual
background could be drawn while preserving that status and displaying the
authoring boundary, but no scene background policy is introduced here.

The current image colors unresolved reasons; the packet identifies the region.
That is sufficient for this diagnostic. Before GPU promotion measure a pose
corpus, not just the two images or maxWork headroom. CPU work units do not price
GPU divergence or shader compilation. Connected GPU/editor remains gated until
the integration and independent exclusion audit are reviewed.
