# S3 boundary events and agent review, 2026-09-10

Base 275fd4d, LeoPC Windows / Node v24.20.0.

## Accepted reviews

MUSE-48 revision: 4/4 rerun. Repeated transport/turn paths, tangent determinant,
Gram/tangency checks and negative controls now distinguish frame orientation
from chart projection. Oracle ambiguity is explicit (4 inconclusive, 16 hits,
15 misses), and initial/contact body clearance is checked. E3 evidence remains
an endpoint/contact detector, not a general continuous-path theorem.
MUSE-49 revision: 7/7 rerun; R=.5/8/100 crossing coverage and physical lengths.
MUSE-50: 7/7 rerun; independent great-circle chains, speed/linearity, zero/inverse
legs and area-based holonomy. Accept all three within their stated sample limits.
Original reports and fail demonstrations remain attributed to Muse.

Claude 275fd4d: accept the clear/occluded/unknown marker correction. Real-handler
page-check --region-lab rerun through queue: 129 checks, no page error, RTX5070Ti
ANGLE D3D11. Unknown marker diagram inspected; it is a canvas reconstruction of
DOM placement, NOT a screenshot of actual DOM. No connected-renderer claim.

## New kernel slice

engine/geometry/s3-ray-events.js exports sphericalBoundaryEvents and the shared
S3_RAY_ROUNDOFF screening coefficient. Input is an S3 metric, one compiled
primitive (field.primitives entry), unit point/direction, explicit physical
maxDistance in [0,pi*R], and maxEvents (default 16). Caller owns domain clipping.

For plane pole n: A=p.n, B=u.n, solve A cos(t/R)+B sin(t/R)=0.
For a ball center c: solve A cos(t/R)+B sin(t/R)=cos(radius/R).
The same equation yields every great-sphere face candidate of a cell. Ball
interiors have the opposite inequality to plane interiors, so outward normals
and entry/exit signs must reverse. Returned normals are primitive surface normals,
NOT Boolean/subtraction normals. No modification of field distance guarantees.

Result is complete/events or unresolved/reason/events. Complete means the
numerically screened candidate list, NOT a scene hit/miss. On unresolved, partial
events are diagnostic only; callers cannot infer a certified empty prefix.
Candidates contain physical distance, screening guard, point, tangent, outward
normal, primitive ID, face index and entering/exiting transition.

Coplanarity, near tangency, ill-conditioned inputs/normals, near-range roots,
coincident event guards and event exhaustion refuse explicitly. Ball radii at
or beyond pi*R currently refuse as degenerate, not empty. Metric-accepted input
drift outside the tighter root screening scale also refuses. The guards are
floating-point screening policies, not proven interval enclosures for JavaScript
transcendentals. Do not advertise formal certification or arbitrary precision.

No rayCast was added to sphereField and traceRegionSight stays unchanged.
In particular, cell face events outside the clipped cell are EXPECTED. Tests
pin this distinction so a downstream renderer cannot call each event a hit.

## Verification

node s3-ray-events.test.js: 8/8. R=.5/8/100 ball entry/exit and outward normals;
independent plane bisection; oblique angular-distance sign brackets; inside starts;
range exclusions/refusals; tangency/coplanarity; budgets; actual compiled-cell
faces, including candidates outside the solid; input validation and immutability.
Isolated ball orientation flip fails 2/8 (exit 1); source untouched by mutation.
node tools/test.js: 72/72 suites passed on this workspace, including the
accepted Muse deliveries. No GPU path or timing promoted.

## Next ownership

Claude implements a CPU Boolean event classifier under CLAUDE_NEXT.md, without
runtime/renderer integration. Muse independently audits this primitive event
layer (MUSE-51). Astra reviews both before connecting scene hits to region sight.
