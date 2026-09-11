# Decisions after the host pause review

Astra, 2026-09-10, reviewed c4d0aa2. Implementation contracts, not delivered features.
Read only the assigned section. Order: correction resumption, spherical support,
then connected rendering. Marker overlays may be a separate bounded UI task.

## Review verdict

Agree with Claude's corrected statement: blocked-exit and domain-exit CAN owe a
floor correction. Debt is checked before status or clock. motion-pause.test.js
9/9 and motion-pause-truth.test.js 5/5 rerun here, including those real cases.
Accept the bounded pause policy and MUSE-43 evidence. Reported 61/61 full suite,
65/101 browser checks remain Claude's evidence; not rerun in this decision pass.
Physical high-DPI mouse behavior is still unverified. MUSE-44 remains independent.

## 1. Correction resumption: separate operation, no old movement time

Authorize a host-free resumeRegionCorrection(world, suspended, options) operation,
using the EXISTING sweep in correction phase. Do not run moveRegionProbe again
with the refused dt, or interpret the residual as velocity.

- A resume requires an immutable continuation issued by the kernel: region ID,
  exact endpoint state/camera, residual distance and tangent direction, and the
  originating compiled-world identity. Snapshot arrays. An arbitrary fabricated
  pendingLift object is not sufficient authority to move a player.
- The operation spends a fresh, explicit bounded query budget, but ZERO gameplay
  time. The original unconsumed travel time remains discarded. No gravity, user
  input, portal transit, new lift or contact-slide response during this operation.
- Continue along the transported residual settle direction. Transport velocity,
  camera and any residual along every committed correction leg. A completed
  residual clears debt. An actual swept contact may terminate the correction
  early at its validated contact state; it is not permission to push through.
- A stalled query retains the remaining distance/direction at its new endpoint.
  A degenerate contact or non-finite query is unresolved, never completed. A
  domain or portal event follows the existing correction-phase refusal policy:
  do not cross it, retain valid state and debt, and expose explicit recovery.
- An edit/recompile or mismatched endpoint invalidates the continuation. Return
  stale-continuation without changing state. Host offers reset/revalidation;
  never apply an old floor's correction to a new scene. No saved JSON tokens.
- Calls are functional; the host atomically replaces its active suspended result
  with the returned one and cannot apply one continuation twice to successive
  states. No generic scheduler or persistent token registry required.

Host integration: add 'Finish correction' separately from 'Resume as new request'.
Only after debt clears may normal play resume. Keeping the current debt pause
until this entire operation exists is correct. This is NOT merely changing
resumable:false: the action handler must dispatch the new operation, replace its
state/token, handle partial/stale outcomes and preserve old time as discarded.

Claude scope: region-motion.js, narrowly needed collision result plumbing,
app/motion-pause.js and region-lab.js/HTML, focused tests and a short QA report.
No gravity, shader or schema changes. Tests: repeated partial resumes equal the
same correction path; exact budgets; zero old-time replay; curved camera carry;
blocked/domain/portal endings; edit invalidation; real host handler request counts.
Muse independently checks clock, continuation identity and actual resumed paths.
Stop for review after this operation; do not start the next sections automatically.

## 2. First curved support: an authored floor, not global Z

Implemented first slice: engine/world/spherical-walker.js and editor Movement
selector. Evidence and exact scope: docs/qa/astra-spherical-walking-2026-09-10.md.
Independent follow-up is MUSE-47; broader support remains unsupported.

The first walking slice is ONE bounded S3 region, one designated additive,
unmodified great-sphere floor. Other solids obstruct motion but are not walkable
supports in this first slice. Reject unsupported floor configurations visibly;
do not silently treat carved floors, arbitrary balls or ceilings as this floor.

For unit point p and unit floor normal n, signed height is
h(p)=R*asin(p.n); local up is normalize(n-(p.n)*p). Gravity is -g*up,
with g=9 physical units/s^2 initially. At singular up, stop unresolved. Within
the supported hemisphere the player's floor clearance is h(p)-radius.

Grounded requires proximity to this floor (|h-r| <= 2*skin), no unresolved/debt
state, whole-field clearance >= -skin, and nonseparating normal velocity.
It is a query at the CURRENT point, not an old normal dotted into a new up.
Conservative whole-field failure is 'support unproven', not a collision proof.
Being grounded enables jumping; ground contact cancels only inward velocity.
Positive jump/separating velocity must disable snap-back to support.

Use bounded fixed substeps (initially <=1/120s); metric-project requested movement
into the local floor tangent plane, integrate gravity, call the existing motion
coordinator, transport carried state, then query support at the new point.
Do not constrain motion to an ambient straight line or implement a second solver.
Budget exhaustion reports remaining work; corrections use section 1.
Require convergence across smaller timesteps, sustained rest/walking, departure
from support, obstacle contact, jump, edit-induced overlap, and radius scaling.

Camera policy is explicit: walking yaw uses the local floor up at the current
point, pitch is relative to that horizon, and gravity alignment is a bounded
separate rotation. First transport the full frame; never rebuild from scene-origin
axes. Free flight retains its existing own-axis, unclamped camera.
Cross-region gravity and support carryover are NOT part of this first slice.

## 3. A portal shows its destination by the motion map

For each ray, find the first source solid or aperture event along the actual
geodesic. Source solids occlude apertures; a portal does not carve a wall.
At an aperture hit, map the exact crossing point and ray tangent using that
portal's radial position correspondence and tangent carry, switch region, and
continue with the remaining physical ray range. Radius is zero for a sight ray,
not the player's body radius. It is valid to SEE through an opening the player
cannot FIT through, or into a destination lacking player clearance.

This is an explicit optical gameplay model. It need not be the differential of
the finite-aperture position map; do not claim global isometry or physical optics.
Use destination metric/R/materials. Shader and CPU must consume the same compiled
anchors and policy. Do not render the source behind a portal as its destination.

Crossing at a plane needs a directional side tag/tolerance to suppress only its
zero-distance reverse event, not a multi-frame cooldown. Do not give rays the
player's exit-normal positional offset: it can skip thin nearby destination
surfaces. Test exact-frame/near-plane and return cases against a CPU reference.
Default maximum four crossings per ray with one shared finite work/range budget.
Ties, invalid destination, exhausted traversal or unresolved surface query render
an explicit diagnostic aperture/ray result, not sky/miss or an invented wall.

Closed/unsupported connections need an explicit visible state and matching
movement policy; no silent shader fallback. A blocked-player indicator may sit
on the rim while the destination remains visible. First acceptance is E3-S3-E3
with source occlusion, thin destination objects, nested views, body/ray aperture
distinction, correct camera crossing and inspected real-GPU images/timings.
Keep one-region rejection in place until the connected renderer passes this.

## 4. Non-solid authoring markers are overlays

Spawn/objective entities are editor selection/placement overlays, NOT collision
or world-SDF primitives. Do not spend the primitive uniform budget on them.
Use the selected region's projection; if curved projection is ambiguous, a
screen-space list/label with intrinsic distance is a valid initial fallback.
An always-visible marker is visibly styled as an editor aid, never a solid
claiming to be in front of geometry. Hide authoring markers in clean play mode;
an objective's future in-game appearance is a separate authored visual decision.

Keep renderer capacity caps explicit until measured alternatives are reviewed.
Fix connected fixtures within the supported chart; do not change curvature/domain
rules merely to load them. Nested-cutter conservatism remains a separate open item.
