# Saved H3 CPU regions

Base 0caa0a0; lead on LeoPC / Node24.20.0.

compileHyperbolicRegionWorld explicitly opts into the existing saved scene-v2
format. H3 author coordinates already validated through charts.js; no new format
or geometry reinterpretation was needed. The runtime restricts H3 to additive
balls, spawn, objective and anchors, extent <=2R, ball/disc radius <=R and no
floor policy. The default compiler still refuses H3. renderData throws for an
H3 world instead of handing unsupported packets to a renderer.

hyperbolic-field.js decodes balls once, snapshots their data, and exposes samples
and explicit bounded ray queries. Exterior union distance is exact in the metric;
interior magnitude remains conservative. Ball centres have no unique normal;
equal field winners are marked seams. Existing analytic query guard limitations
apply. No CSG construction is silently treated as an additive ball.

Fixture: levels/fixtures/connected-h3-cpu.nil.json. hyperbolic-region.test.js
loads it, traverses E3/H3/E3 and back, saves/reloads without changing document
data, and tests a blocked destination, invalid author intent, field identities,
ray budget exhaustion, and rendering/default-runtime gates. It also pins the
cross-compile camera ownership refusal caught by the first test draft.

MUSE-69 reviewed and integrated separately as consumer evidence; no production
repair was found. Lead strengthened its unused input snapshot and S3 progress
control. Isolated unresolved-to-miss mutant fails truth 3. A new-field distance
overestimate of .01 fails the radial reference (.21 vs .20). Script:
.agent-bridge/review-h3-region.mjs; main production files never mutated.

Next: CPU connected sight H3 dispatch, then GPU; this fixture cannot yet be
opened for rendered play. compileHyperbolicRegionWorld.document is persistence,
not editor integration or undo history evidence. Independent numerical audits
remain sampled evidence rather than proofs over all authored inputs.

Integration: full node tools/test.js 118/118, h3-region-suite.log. Queued
page-check --connected-global 52 checks, cold real GPU, 8.8s on LeoPC, no boot
error. This is existing E3/S3 regression evidence, not H3 GPU rendering.
