# Complete spherical runtime, bounded authoring charts

2026-09-11. Implemented in engine/geometry/spherical-cover.js and the standalone
tools/spherical-cover.html browser fixture. Now also connected to E3 with CPU
collision and a GPU flight host via nil-connected-cover (separate from scene-v2).
See COVER_REGION_FORMAT.md and docs/qa/connected-global-gpu-review.md for current
integration; evidence and next-step notes below describe the original foundation.

## Runtime ownership

S3 runtime points are unit four-vectors everywhere on the sphere. A local
authoring chart is not the runtime domain. `createSphericalCover` reuses the
arena-derived metric adapter's physical distances, geodesics and segment carry,
but has no domain boundary. It is a separate opt-in adapter. Existing scene-v2
compilation and connected GPU open-hemisphere refusals remain intact.

Global `decode`/`encode` refuse. `chartAt(center, {basis, extent})` supplies an
explicit local chart, including at the original chart's antipode. Its three
coordinates are physical tangent components. Extent must fit an open hemisphere.
Chart construction metadata must eventually be serialized with placements;
do not silently reinterpret existing three-component scene-v2 coordinates.

The cover's construction basis is the smooth unit-quaternion basis q*i, q*j,
q*k in (x,y,z,w) order. This removes the origin-to-antipode singularity of the
old radial construction frame. It defines coordinates/handedness, NOT the
camera's physical orientation. Movement continues to use actual segment carry.
Endpoint-only transport and shortest logarithms still refuse antipodal pairs:
the endpoint does not identify the travelled geodesic. Never replace segment
carry with them at a half or full revolution.

## First global sight subset

`castSphericalBalls` handles static additive metric balls of radius less than
πR/2, globally placed with unit-four-vector centers. Along a great circle,
ball occupancy is periodic with physical period 2πR. Search at most one period
for the first entry; no entry over a whole period certifies an empty longer
orbit for this subset ONLY. This does not authorize truncation across portals,
moving objects, or future non-periodic query state.

Return hit, miss, or unresolved. Hit distances are physical travel, not shortest
endpoint separation (a hit can be beyond πR). Starts inside/on a ball, tangencies,
coincident ownership, range-boundary ambiguity and exhausted primitive budget
refuse explicitly. A later uncertain tangency cannot erase a nearer hit.
Normals are tangent, outward surface normals at the reported intersection.
The 1e-10 scalar comparison band is a provisional double-precision guard, not
a portable GPU error bound. No distance-field stepping or body collision is
introduced by this query.

## Evidence and next implementation

spherical-cover.test.js covers R=.5/8/10000: camera traverses antipode and full
loop, local chart around south pole, unchanged ambiguous endpoint transport,
far-side first hits, finite ranges, periodic misses, ownership/tangent refusals.
96 ray cases compare against independent chord-membership sampling + bisection;
the reference is a converged numerical oracle, not a universal proof.
Muse MUSE-56 independently checks original segment transport and triangular
holonomy. A full great-circle loop returns the frame; arbitrary closed loops
generally do not. Do not flatten the latter to make a camera test pass.
Integrated verification on Windows Node 24.20.0: 84/84 suites passed, including
both new suites. Muse's identity-carry fail demonstration was rerun independently.
No browser/GPU checks were run for this CPU-only, unconnected foundation.

Implemented: GPU/CPU global-ball fixture with near-side, antipodal and
far-side landmarks, plus an animated full straight-loop control. It keeps the carried frame;
offer a stable explicit look policy, not own-axis yaw with unrelated pitch clamp.
No great-sphere floor has a nonsingular height gradient over all S3, so do not
claim the bounded room's floor-up policy works everywhere. For the initial loop
test, carry a reference up along the trajectory and apply look relative to it.
After the complete-sphere image/motion parity checks, the next task is global-region scene
persistence and connect E3 portals. No gravity, CSG or broad engine migration
is implied by this foundation.

Browser renderer scope is narrower than the CPU: R=8, up to 16 balls, angular
radii .05–.1. Inputs outside those limits refuse before GL creation. Camera-relative
packing computes the cancellation-prone a²-c² term in double before float upload.
Fixed float32 guards remain provisional. See docs/qa/global-s3-preview-review.md
for actual GPU evidence; do not extrapolate its accuracy to other scenes/scales.
