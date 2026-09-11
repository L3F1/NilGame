# Connected sight: first CPU contract, 2026-09-10

traceRegionSight(world, {regionId,position,direction}, options) in
engine/world/region-sight.js is host-free. Directions have unit physical norm;
maxDistance is physical arclength across all regions. Default maxCrossings=4,
maxWork=2048. Work counts domain queries, aperture queries, analytic field
queries, endpoint samples, bound samples and transits. It is not a CPU-time
estimate: one analytic query has scene-dependent cost under compile-time caps.

Results: hit / miss / unresolved, current region/point/tangent, committed distance,
remaining range, work, segments and crossing records. A miss only means empty
within the requested range. Domain exits, budgets, ambiguous sides/events and
uncertain fields are unresolved. Inputs are not mutated. For unresolved S3
sampling, certifiedLocalDistance/candidate describe progress within the uncommitted
leg; distance and position stay at the last committed endpoint.

The first source solid occludes a portal. Coincident solid/aperture and competing
apertures refuse arbitration. The exact portal point and transported tangent
use existing compiled motion anchors, but sight has zero body radius and NO
player exit offset. Only the newly mapped reverse endpoint gets a side tag;
an unrelated on-plane start is unresolved. Destination solids require no player
clearance. Remaining physical range and one work budget cross regions together.

## Deliberate partial capability

E3 uses existing analytic CSG queries. S3 uses conservative exterior advances.
A tiny positive bound does NOT prove a nearby surface: it returns unresolved /
surface-candidate, even for a simple ball. This is a diagnostic/reference stage,
not permission to enable connected GPU rendering. Next Astra work is a verified
S3 surface-intersection query (great-sphere/metric-ball roots and Boolean event
classification), retaining this conservative path as a reference/fallback.
Never shade a surface-candidate as if its normal/owner were certified.

Endpoint subtraction across several regions can round an exact requested-range
hit out of the local interval. E3 miss endpoints within surfaceTolerance of the
field are unresolved/range-boundary. No extending the ray and reporting an
out-of-range hit. This may refuse more often on conservative fields; it does not
claim their value is exact clearance.

## Checks

LeoPC, Node v24.20.0: node region-sight.test.js, 13/13. Central E3-S3-E3 ray
has independently calculated total travel 1+2+1.5=4.5. Thin destination box entry
is 0.000015 after exit. Tests also exercise occlusion, range, work/crossing limits,
domain exits, side/tie refusal and aperture body/ray distinction.
An isolated temporary copy adding 0.0004 outgoing-direction exit offset fails
7 of 13 checks (exit 1); repository source untouched by mutation.

node tools/check-queue.js page-check --region-lab: 88 passed, real RTX 5070 Ti
ANGLE D3D11; saved walking doorway image inspected. 0.65 ms/frame over 30 frames
at 604x505 is the existing single-region renderer probe, NOT connected sight
performance or input latency. CPU sight is not wired into that renderer.
Final rerun: node tools/test.js, 66/66 suites passed, including sight 13/13.
node tools/scene-check.js also passed document/origin-transfer checks; it is not
proof that the old connected fixture compiles in the bounded runtime.

No claim yet about general offset portal routes, grazing S3 boundaries, broad
clearance guarantees, GPU parity or useful connected-scene frame rates. Muse's
independent task must target these boundaries rather than duplicate the central
route formula.
