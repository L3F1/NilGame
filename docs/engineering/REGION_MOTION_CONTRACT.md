# Region-owned motion contract

Accepted design, Astra, 2026-09-10. Implementation pending except the path-carry
prerequisite below. Scope: E3/S3 scene kernel, not arena portals or other metrics.
Read this instead of reconstructing policy from the chat.

## Existing foundation and gaps

- metric-space.js owns physical norms, geodesic advancement and segment transport.
  S3 positions are unit four-vectors; tangent norms are physical speeds, independent
  of curvature radius. Never infer a metric instance from vector dimension.
- region-world.js owns independently compiled spaces/fields and region IDs.
- region-portal.js supplies radial aperture correspondence and an orthogonal
  tangent map. Equal physical speed/radius is gameplay policy; it is NOT the
  differential of an isometry between finite E3/S3 apertures.
- collision.js sweep already composes actual path transport. This task adds
  moveProbe.carry and contactSamples with their original contact positions.
  Carry includes lift/settle corrections, but excludes velocity projection.
- camera-frame.js mapFrame accepts explicit destinationSpace; default means
  same space. Use the transit map for all three axes, preserving roll.
- IMPORTANT: walker.js is still three-component/world-up code. It is NOT a
  curved walker. collision.js's legacy portal branch is E3-only. Neither should
  be fed cross-region descriptors merely because their interfaces look similar.

## One owner and one clock

Implement a host-free moveRegionProbe(world, state, dt, options) coordinator.
The state owns regionId, position, velocity, radius and camera (the immutable
camera-frame object). camera.space must equal the region's space and its position
must match state.position. Convert region-world.spawn's initial frame once;
never recreate a canonical frame at an ordinary move or transit.

Return a new state/result without mutating the input. Results include status,
timeConsumed, timeRemaining, events and contactSamples tagged with regionId.
Status distinguishes complete, stopped, domain-exit, blocked-exit,
budget-exhausted and unresolved. Invalid arguments throw before movement.
Require finite dt >= 0, finite positive radius, valid point/tangents and owner.
Zero dt is identity; do not teleport a stationary player on a portal plane.

The first implementation is constant-velocity motion plus collision, NOT a new
gravity integrator. Every regular travelled segment of length d at speed s>0
consumes d/s seconds. After collision projection changes s, multiply REMAINING
TIME by the new speed for the next sweep. Never reuse the original distance
budget as time. Portals consume zero time. Lift/settle and the exit offset are
bounded numerical corrections, logged separately and consume zero gameplay time.
If projected speed becomes zero, consume the rest as rest (complete/stopped),
without another geometric query. Unresolved queries retain their unconsumed time;
the host must not silently replay it automatically on the next frame.

## Stop the existing solver at events

Extend sweep/moveProbe with an optional event-stop interface; keep the old API
defaults unchanged. Do not copy their conservative advancement/slide loops into
region-motion.js. It coordinates ownership, not another collision algorithm.

An event provider receives the current point, unit tangent, proposed physical
distance and phase (travel or correction). It returns the first event distance
and descriptor, or none. Query it on EACH actual geodesic leg, including the
touching-but-leaving nudge; never test a chord between moveProbe endpoints.
Use region-portal.crossing and space.boundaryDistance. Recompute after contacts.
Validate event distance in [0, proposedDistance]; do not round an event beyond
the requested range into a crossing. An event at the exact end is processed once
even when no movement time remains afterwards.

Stop before any surface/domain/event that limits the proposed leg. A surface
blocking arrival wins over a portal. Indistinguishable competing portals or a
portal/domain tie within the stated numerical tolerance return unresolved;
entity iteration order must not choose a destination. Initial defaults: skin
1e-4 physical units, exit offset 4*skin, safety margin skin/2. Event tie tolerance
is max(1e-9, 64*Number.EPSILON*L), where L is the largest of 1, proposed travel,
curvature radius and absolute E3 coordinates involved. It decides uncertainty,
not permission to travel farther. Expose skin as a validated positive option;
fixtures must have player radius and intended clearance comfortably above it.

moveProbe must yield the event before post-move settling can move it away from
the aperture. Return remaining time and composed carry up to that point.
Existing lift corrections remain local to the source region. Cancel outstanding
settle debt on a transit; never apply a source floor's correction in the destination.
Corrections may not teleport. A correction reaching a portal boundary stops and
reports correction-boundary/unresolved; domain checks apply to corrections too.
Do not let a lift silently move across an aperture and bypass its crossing test.

All loops share finite per-call budgets: advancement steps (default 96), contacts
(default 4), crossings (default 8); configurable nonnegative integers.
Include lift/settle steps; do not grant a fresh global budget on every crossing.
Budget exhaustion stays at the last validated state with remaining time reported.

## Transactional crossing

1. Prove source travel to the aperture with the existing collision bound.
   Check radial fit using the physical player radius, not only the center ray.
   Source solids remain authoritative; portals do not implicitly carve walls.
2. Compute destination point and tangent map with portal.transit(at).
   Validate point, destination domain and tangent norms before committing ownership.
3. Prove destination clearance: field.distance(point) >= radius + safety margin.
   A conservative lower bound failing this test means UNPROVEN clearance, not
   proof of intersection. Both cases block transit; report the distinction.
   Never use overlap resolution or respawn to force a failed transit through.
4. Advance a small bounded exit offset along the destination exit normal using
   a swept destination query. Check its whole path for domain exit and collision.
   Carry velocity and camera through BOTH the portal map and this correction.
   A failed offset fails the whole crossing; no partial destination state escapes.
5. Commit regionId, position, velocity, camera together. Preserve radius and
   speed across the map. Continue for the remaining time in the new region.
   Gravity alignment, if later enabled, is separate from this map.

On refusal, retain source ownership and the last source-safe point just before
the aperture, stop this call, and report blocked-exit plus unconsumed time.
Finding 4 decision (2026-09-10): this means a STRICTLY source-side checkpoint,
not the aperture plane. Free-standing portals are supported; requiring a wall
or letting the next frame pass through the source-side plane is not acceptable.
The final source approach is provisional until the destination transaction commits.

Before advancing the final event leg, retain its start and transport/time prefix.
Choose a checkpoint on this already-validated leg, initially skin physical units
of arclength before the crossing (or its start if the leg is shorter). Validate
that it is strictly on the entering side, outside the crossing predicate's
on-plane tolerance. For grazing/numerically inseparable cases, use the leg start
that qualified the crossing; do not nudge backwards along a guessed normal.
If even that side cannot be certified, return unresolved without committing
the questionable leg. Side classification must use the portal's geometry and
physical signed height, with a documented tolerance shared with crossing().

On success commit the whole approach and charge its d/s time normally. On
refusal restore checkpoint position, velocity, full camera, pending correction
state and their transport prefix; refund only the discarded travel time.
Do NOT undo solver work counters: speculative queries consumed real budget.
Keep an event's attempted aperture point separate from its returned stop point.
No source contact is invented. Repeated fresh frames must stop again while the
exit remains blocked; removing the obstruction permits a subsequent crossing.
Retreat and lateral departure remain possible. No persistent cooldown is needed.

Use the same safe checkpoint for an uncommitted portal stopped by crossing/step
budget exhaustion, and retain the pre-leg checkpoint for unresolved portal ties
or correction-boundary events. Otherwise these outcomes can leak next frame too.
This does not change deliberately initialized on-plane states with no approach
history; their existing one-sided convention remains until an authoring policy
explicitly addresses them. It does prohibit returning such a state after a
known uncommitted approach.

If retaining a pre-aperture point rolls back tentative travel, its carry and
elapsed time must roll back too; no discarded leg enters the committed result.
Do not invent a contact normal from the source field at an empty aperture or
silently slide along a blocked portal. The offset and one-sided crossing rule
prevent zero-distance recrossing. Do not suppress a real later return crossing
with a multi-frame cooldown. Keep any armed-side state scoped to its aperture.

## Domain and contact meaning

A chart extent is a numerical/authoring domain, NOT a solid. Stop just inside
the domain, return domain-exit and the limiting event point/distance. Do not
project velocity, set grounded, add a collision normal or invent an invisible wall.
The host may pause/report/request a chart transition; automatic re-entry is not
implemented. Scene edits that strand the player require the separate edit policy.

Contact normals live at their contact positions and region IDs. Never dot a
historical normal with final-position up. Later walking must use metric products,
sample gravity at the current point and re-evaluate support after transit.
Do not persist source grounded state in a destination region. Destination ground
support needs its own swept/local proof, not an endpoint-down sample through a floor.

## Acceptance cases (independent references where possible)

- Free E3 -> S3 -> E3: speed, radius, roll and remaining time; multiple radii,
  off-center and tilted apertures. Include two S3 regions with different R.
- Collision BEFORE portal; contact changes direction so a different portal is
  reached; tangential speed loss uses remaining time correctly.
- Exact frame-end crossing, zero dt, initially on-plane, legitimate return,
  too-small aperture, blocked destination, offset obstruction and domain failure.
- Domain wins before portal; tied events are unresolved, never order-dependent.
- Global step/crossing exhaustion and large dt leave a valid state with honest time.
- Carry matches composition along actual legs, not shortest endpoint transport;
  include correction legs and roll. Contact samples remain tangent at their points.
- Input state unchanged, invalid input rejected, destination ownership atomic.
- Refusal repeated for many fresh frames cannot pass the source plane; clearing
  the exit permits entry, and retreat/lateral departure stay possible. Include
  E3/S3, grazing incidence, tilted/off-center apertures, failed exit offsets,
  frame-end refusal, correction/tie/budget stops and a retry after budget increase.
- Checkpoint rollback refunds discarded travel only, preserves camera transport
  to the checkpoint, and retains all spent work counters. Exact budget caps:
  zero permits zero work of that kind, including corrections and contacts.

CPU motion acceptance does not establish rendered portal parity or GPU performance.
The editor, renderer, gravity walker, saved runtime state and connected playable
room are later integrations, not success claims for this bounded task.
