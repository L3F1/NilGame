# Astra handoff - connected renderer

Read WORKING_RULES.md; select references through TASK_ROUTER.md. One active
outcome: visibly reduce false purple fringes in the E3/full-S3/H3 editor without
wrong intersections. No new geometry or precision helper milestone meanwhile.

## Next implementation

AA refinement integration and a correlated E3 diagnostic landed in this batch.
Read docs/qa/aa-refinement-review.md and AA_REFINEMENT.md, not the full history.
The editor can combine Smooth edges with optional spherical refinement up to
its device/64 MiB payload limit (640x480 fits;960x720 refuses). Default is OFF.
It still only covers eligible additive S3 balls after a first E3-to-S3 transfer.
At160x120 AA,34/46 purple pixels recovered on hardware/software; numerical
samples stay purple. Total hardware AA GPU median at320x240:1.292ms baseline,
1.922ms refined (12 samples), not FPS. See JSON for full attribution.

IMPORTANT: an earlier integration run again failed the strict UNREFINED
resize baseline at pixel6,43 (2.5942287445 ->2.5942289829). Preserved in the
new evidence JSON. Do not call the drift fixed because the instrumented run
passed. The joint replay then captured both input variants. readE3RayDistance captures
primary XYZ and distance from one debug11 invocation; old readPrimaryRays
combines four independent invocations. Joint captures are additional draws,
not a reconstruction of preceding debug2. E3 primary W is zero.

Shared explicit raw/sqrt(sum-of-squares) primary normalization now passes the
captured sequence on both backends. H3 and transported directions are unchanged.
This is sampled stabilization, NOT a cross-driver determinism proof. Hardware
loses12 prototype recoveries to safe exact-identity refusals; report that honestly.

Next difficult task: review REFINEMENT_ENCLOSURE_NEXT.md. The producer already
proves a state band but exports only its nominal state. A consumer membership
check against the actual proved enclosure could accept more useful proofs
without a guessed epsilon. The proposal is not implemented. Keep exact matching
until independent enclosure/conservative-membership checks and GPU cost pass.
Then address remaining hit-side fringes. Do not blindly chase identical floats,
embed interval arithmetic in the main shader, or weaken settled-pixel guards.

Internal helper reviewed atlas ownership, timer isolation and joint capture.
No external agents running; do not redispatch the completed Claude manifest.
Muse is unavailable until its reported Sept14 UTC reset.

Bind outputs to exact portal/object, packed world revision, pose, viewport and
AA sample. Consume only at the matching eligible first crossing. Regenerate on
edits/motion/resize; invalid/unaffordable cases retain the existing query policy.
S3 packed ball rows are -centre/-cos(radius/R); reverse BOTH signs for exclusion.
Keep original hit/root ordering; this miss-only path targets34 sampled false
alarms. The18 hit-side fringes need root intervals later, not midpoint guesses.

## Reading only when needed

- Exclusion evidence/limits: docs/qa/spherical-miss-small-program.md.
- Contracts: PORTAL_TRANSFER_PRECISION.md; SPHERICAL_ROOT_PRECISION.md.
- Stable transfer already live: docs/qa/live-transfer-review.md.
- Existing code reuse: RENDERER_COMPARISON.md. Shader specialization and CPU
  packing are useful; no requirement that all surfaces use one analytic shader.
- Other safeguards: SUBSYSTEM_RULES.md relevant heading; REGION_MOTION_CONTRACT.md
  for motion. Do not alter movement while changing this rendering path.

## Coordination

Muse76 returned429 with no delivery, reset advertised2026-09-14T00:00Z; no retry
until available. Claude's `claude-live-miss-pass` at94f0a44 is delivered and
reviewed; do not redispatch that manifest. Bridge now uses auto-compaction100k,
medium effort and usage reporting. Give smaller implementation slices; the last
batch took80 turns/75k output tokens. No agent is currently assigned more work.
Run without automatic review to save tokens. Accepted72-75 are
in docs/qa/muse-log.md; do not reread them routinely. MUSE72 code-license gates
are in docs/research/geometry-implementation-sources.md before external reuse.
Run host-probe once; use current queue verdict. Never assume an old worker PID.

Preserve numerical refusals until resolved. Global S3 and a bounded S3 chart
are coverage policies, not different geometries. Existing body/portal transport,
correction-debt semantics and save/load are not part of this rendering change.
