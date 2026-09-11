# Claude: S3 Boolean event classification, CPU only

Read WORKING_RULES, docs/qa/astra-s3-events-2026-09-10.md and this contract.
Your marker correction is accepted. Keep runtime/GPU paths unchanged here.

Implement castSphericalRegion(region, position, direction,
{maxDistance,maxEvents=512,maxWork=2048}) in engine/world/s3-ray-cast.js.
Allowed writes: that new module, s3-ray-cast.test.js, a dated QA report only.
Use existing sphericalBoundaryEvents; do not change root equations, metric,
world compiler, scene format, or renderer. Report contract defects to Astra.

1. Region must be S3. Validate inputs/budgets. Clip maxDistance to the caller's
   explicit range only; this query does not own portals or chart exits. The
   future sight coordinator must arbitrate those first. Refuse unsupported
   query spans rather than silently subdividing them.
2. Classify initial primitive occupancy from atomic inequalities, independent of
   conservative distance magnitude. Plane/cell faces: dot(p,n)<=0. Ball:
   dot(p,c)>=cos(radius/R). Use S3_RAY_ROUNDOFF and a coefficient-scaled guard
   consistent with event generation. Near-boundary classification is unresolved.
3. Represent cells as ALL face constraints inside. A global/scoped modifier
   applies exactly as field.groups specifies. Group occupancy is base inside
   AND every intersect inside AND every subtract outside. Union groups with OR.
   A subtract cell is NOT the conjunction of inverted face constraints.
4. Definitely occupied origin returns hit at t=0, contact='inside', normal=null.
   This is an occupancy convention, not a surface normal. If classification is
   uncertain, return unresolved; don't guess from a small distance bound.
5. Collect all required primitive events under shared finite budgets. Any
   unresolved collection propagates unresolved; partial candidates must not
   certify an empty prefix. Merge ordered candidates; overlapping guard intervals
   refuse as coincident-events. Do not impose arbitrary primitive ID precedence.
6. Apply an event to its atomic face/ball occupancy, then reevaluate the Boolean
   expression. An outside-to-inside change is a hit. Inactive cutter/face roots
   are skipped. Outside-to-outside zero-width/degenerate clusters remain refused
   by the coincidence policy. No epsilon steps that skip thin cuts.
7. Hit carries additive owner and surface owner separately. Normal is primitive
   outward normal, reversed for a subtraction boundary. No unique normal claim
   at seams. Return nearest hit within range; no events + clear occupancy is a
   miss within range. Budget/exhaustion/ambiguity return unresolved, never miss.
8. Count and expose work and events honestly; validate limits before spending.
   Document what one work unit means under existing compile-time scene caps.

Tests: independently known ball/plane/cell routes, a passage cut in a cell,
intersections and global versus scoped modifiers, inactive infinite-face events,
inside origins, thin cuts, range endpoints, coincident faces, subtraction normals,
all statuses and exhausted budgets. R=.5/8/100 with physical scale. Isolated
fail-demo, focused/full Node suites. Leave report and commit explicit files.
Do not expose field.rayCast, change advertised capabilities, enable portals in
region-lab, or add shaders. Astra reviews query guarantees before integration.
