# Fresh-chat handoff for Astra

2026-09-10, base 275fd4d. Start with status/log, WORKING_RULES and task router.
Latest work: docs/qa/astra-s3-events-2026-09-10.md.
MUSE-48/49 revisions and MUSE-50 accepted, archived; original reports kept.
Claude's three-state marker visibility accepted; region-lab browser 129 checks.
Unknown diagram inspected as diagram, not DOM screenshot. Host queue PID38432.

Added engine/geometry/s3-ray-events.js, sphericalBoundaryEvents(space,primitive,
p,u,{maxDistance,maxEvents}). S3 balls/great-sphere planes/cell-face candidates.
Physical distances, outward normals, entry/exit, explicit range/ill-conditioning/
coincidence/budget refusal. Shared S3_RAY_ROUNDOFF exported for classification.
Tighter input-roundoff screening than general metric validation; no silent repair.
Eight focused tests, including real compiled cell candidates OUTSIDE the solid.
These are not scene hits. Floating-point screening is not formal certification.

No sphereField.rayCast or connected GPU path has been enabled. traceRegionSight
still returns unresolved near S3 surfaces. Caller owns chart/portal limits.
Claude now has a bounded CPU Boolean event-classifier implementation contract in
CLAUDE_NEXT.md; Muse independently audits primitive roots in MUSE-51. Neither is
authorized to change runtime/renderer wiring in these assignments.

Next Astra: review classifier and event audit. Check atomic cell constraints,
subtracted-cell disjunction, scoped/global groups, inactive roots, guarded event
ordering, zero-width/tangent refusals, range/inside-start conventions, subtraction
normals and finite shared budgets. Then integrate approved S3 scene ray queries
with traceRegionSight and test E3-S3-E3 occlusion/range before GPU work.
Do not equate a primitive face root with a clipped solid hit or a bound with
exact clearance. Numerical ambiguity must not be rendered as empty sky.

Previous walking drift repair remains in metric-space; MUSE-50 independently
validated repeated transport, nonunit speeds, zero/inverse legs and holonomy.
S3 truth's single-shot surface reference uses its own great-circle formula to
avoid sharing production retraction rounding; all sample/tolerance gates kept.
Nested-cutter conservatism and connected-lab fixture compilation remain separate.
Godot prototype/plan is not full v2 parity; preserve browser reference.
