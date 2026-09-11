# Claude's next bounded task: integrate whole-segment cell exclusion

Start from Astra's exclusion commit. Read WORKING_RULES and
S3_EXCLUSION_CONTRACT.md. Previous connected fixture accepted; see
../qa/astra-exclusion-review-2026-09-11.md. MUSE-53 independently owns the helper
audit. Do not edit the helper while Muse audits it; report defects to Astra.

Implement the contract in engine/world/s3-ray-cast.js. Use
excludeSphericalCell before occupancy/root requests; excluded cells are constant
false throughout this segment. Preserve Boolean scoping, validation, numerical
refusals, owner/normal semantics and one honest maxWork budget. No host or shader
changes. No new primitive-event behavior or epsilon perturbation of ray poses.

Allowed writes: engine/world/s3-ray-cast.js, s3-ray-cast.test.js,
connected-s3-query-truth.test.js (only the known-refusal regression upgrade
specified in the contract), connected-sight-fixture.test.js (same narrowly
necessary upgrade), docs/qa/claude-cell-exclusion-integration.md. Do not change
fixture placement to avoid a failing query, or modify other task/status files.

Pin an actual compiled cutter-plane pose resolved by a full-span witness, a
longer ray that later reaches that cell, global/scoped subtract and intersect,
additive exclusions and no-witness refusals. Verify new work accounting without
loosening caps; ball-only budgets unchanged. Keep the raw primitive refusal
check where applicable; upgraded scene checks assert independently derived
answers rather than accepting hit OR unresolved.

Rerun focused/full Node. Produce an isolated fail-before demonstration. Regenerate
both diagnostic views with tools/connected-sight-probe.js, inspect, and report
status/reason/work differences against the previous packet. Add a deterministic
pose sweep including points on authored face planes; report unresolved frequency
by pose class, not just average work. Avoid claiming a GPU performance gain.
One report, stop for review. No connected GPU/editor gate changes.
