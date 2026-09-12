# Astra handoff - connected renderer

Read WORKING_RULES.md; select references through TASK_ROUTER.md. One active
outcome: visibly reduce false purple fringes in the E3/full-S3/H3 editor without
wrong intersections. No new geometry or precision helper milestone meanwhile.

## Next implementation

Integrate a scoped separate exclusion pass for the eligible FIRST E3->S3
crossing, with cost-aware admission. app/spherical-miss-experiment.js and its
GLSL helper are currently TEST-ONLY. Do not embed interval arithmetic in the
main shader again (prior300s/60s no-report failures).

New raster experiment: at320x240, one portal/ball GPU pass p95~.023ms RTX5070Ti
versus~45.9ms SwiftShader (12 samples each). This is not total frame cost.
See docs/qa/render-loop-review.md. Actual GPU queries, not gl.finish call time.
Costs for all objects, transfers and AA remain to be measured at integration.
Do not turn this on unconditionally. Live gallery still has52 numeric fringes.

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
until available. Claude quota unavailable until user renews. Accepted72-75 are
in docs/qa/muse-log.md; do not reread them routinely. MUSE72 code-license gates
are in docs/research/geometry-implementation-sources.md before external reuse.
Run host-probe once; use current queue verdict. Never assume an old worker PID.

Preserve numerical refusals until resolved. Global S3 and a bounded S3 chart
are coverage policies, not different geometries. Existing body/portal transport,
correction-debt semantics and save/load are not part of this rendering change.
