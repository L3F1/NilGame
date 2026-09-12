# Astra handoff - connected renderer

Read WORKING_RULES.md; select references through TASK_ROUTER.md. One active
outcome: visibly reduce false purple fringes in the E3/full-S3/H3 editor without
wrong intersections. No new geometry or precision helper milestone meanwhile.

## Next implementation

The separate exclusion pass is now integrated behind draw's
`sphericalMissPass:true`, default false. Claude's candidate needed lead repairs
to its acceptance pose and total GPU timing. See docs/qa/live-miss-pass-review.md.
The editor now exposes an explicit refinement checkbox (default off), with
visible refusal while Smooth edges is active. Non-E3 camera regions now skip
the inapplicable pass on the host. A near-tangency scheduling experiment was
REJECTED: little timing benefit and repeatable settled-distance change on the
hardware backend; see live-miss-pass-review.md. Do not revive it as accepted.
Fixed eligibility/group scanning is now precomputed per packed world and
updated transactionally on edits. No measured frame-rate benefit claimed.
Next: isolate the intermittent hardware settled-distance difference at(6,43)
before further precision/performance changes; diagnostics now repeat primary
rays and baseline distance on failure. See eligible-owners logs in the review.
Then AA/sample policy and sustained movement
cost checks. Do not enable globally from a single view. Do not embed interval
arithmetic in the main shader (prior300s/60s no-report failures).

New raster experiment: at320x240, one portal/ball GPU pass p95~.023ms RTX5070Ti
versus~45.9ms SwiftShader (12 samples each). This is not total frame cost.
See docs/qa/render-loop-review.md. Actual GPU queries, not gl.finish call time.
The live pass resolves34/52 gallery fringes on both tested backends;18 remain.
Default play still uses the original path. Costs at playable resolutions and
AA remain to be measured before default admission.

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
