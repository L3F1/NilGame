# First spherical walking slice

Base 556cd5f; shared tree contained Muse's MUSE-46 status/report/test, preserved.
Host LeoPC, Windows, Node v24.20.0. Work left uncommitted.

## Review and triage

Correction resumption accepted for its bounded scope. Reran correction-resume
11/11 and Muse's S3 domain counterexample 1/1. The edge IS reachable after a
slide; the code's correction-phase refusal is correct. MUSE-46 accepted as
evidence, not proof that its sampled 'holds' are universal theorems.

Stationary center-in-solid was also real: region-motion's zero-speed branch
could report rest without inspecting occupancy. It now returns unresolved /
stationary-center-in-solid for a positive-time stationary request whose signed
field is negative, preserving position and time. Zero dt remains identity.
A positive but insufficient bound is not labeled proven overlap by this change.

## Implemented

engine/world/spherical-walker.js exposes createSphericalWalker(world), returning
support(state), step(state,dt,options), look(state,angles). One S3 region without
portals; descriptor.floorId names an additive unmodified great-sphere floor.
Global modifiers or modifiers targeting that floor are refused. Other solids
obstruct motion but do not become supported walking surfaces.

Physical gravity and support derive from R*asin(p.n) and its unit tangent
gradient. Requested velocity is projected into the CURRENT floor horizon.
Bounded substeps (default <=1/120 s, at most 240 per call) use moveRegionProbe;
there is no second collision solver. maxSteps/maxContacts apply per substep;
the total finite work allowance is bounded by maxSubsteps times those caps.
Reported counters aggregate the actual work. Integrator exhaustion preserves
remaining time; a host does not accumulate it into subsequent frame requests.

Jump is accepted only from measured support; positive separating velocity
disables support. All camera axes travel with the motion coordinator. Walking
yaw uses local floor up, pitch uses its horizon and a 1.5-radian clamp; alignment
eases separately at rate 8/s. Free flight is unchanged. An owed correction returns
its exact suspended state/token; the walker does not resume it automatically.

Support failure distinguishes a center known inside solid from unproven radius
clearance, singular up and domain exit. It does not force a push from an invalid
start. A changed scene compiles a new walking policy and resets through the
editor's existing transaction policy.

Editor: Movement selector offers Free flight (default) or Spherical walking.
WASD follows floor, Space is an edge-triggered jump; Q/E roll is free-flight only.
Existing pause, Finish correction and Resume controls retain their behavior.
This is not support on stairs/balls, curved portals or a general rigid-body solver.

## Evidence

- spherical-walker.test.js: 9/9, including sustained rest/walking, jump,
  obstacle blocking, initial invalid state, tilted-floor yaw/clamp, physical
  scaling and translated floors at R=.5/8/100, and analytic free-fall convergence.
- Isolated gravity-sign mutation: exit 1, only 4/9 pass. Repository source was
  not mutated; temporary modules used absolute imports and were removed afterwards.
- node tools/test.js: 65/65 suites passed, including Muse's pending audit corpus.
- Queue page-check --region-lab: 88 checks, real RTX 5070 Ti / ANGLE D3D11,
  no boot/page error. New checks exercise the real mode selector and advance
  handler, rest, doorway passage, jump key and return to free flight.
- Inspected page-check-shot-s3-walking-doorway.png from beyond the passage.
  Existing renderer timing (~.68 ms for its 30-frame draw probe at 604x505) is
  not a measurement of walking latency or force-integration cost.
- git diff --check clean. No new shader or scene schema changes.

## Follow-up roles

Muse: independently audit support and motion against intrinsic references,
including degenerate camera directions, held jump/relanding, edits and correction
resumption. Keep sampled claims and analytic guarantees separate. MUSE-47 scopes it.

Claude: review/integrate this slice and add authoring spawn/objective overlays
per NEXT_CAPABILITIES.md section 4. No new SDF/collision primitive. Keep changes
to editor/overlay modules and tests. Mark always-visible overlays as editor aids;
hide them in clean play view. Do not silently project ambiguous curved images.

Next Astra task: assess independent walking findings, then implement the CPU
cross-region sight-query contract before a connected GPU path. No automatic
redefinition of box/cell geometry, unresolved rays as misses, or host migration.
