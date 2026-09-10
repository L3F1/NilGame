# Fresh-chat handoff for Astra

Updated 2026-09-10, reviewed 382ef0d. Check current diff/log; this review's
settle fix, tests and docs were left uncommitted. Preserve other agents' edits.
User wants one hard decision/fix per Astra task; Claude implements, Muse checks.

Read WORKING_RULES.md, the relevant TASK_ROUTER.md row and the latest short report.
Current verdict: docs/qa/astra-integration-review-2026-09-10.md.
Finding-4 refusal repair and MUSE-41 accepted. Astra additionally fixed discarded
partial-settle exhaustion/debt (settle-budget.test.js); 56/56 Node suites passed.
No browser check run in this review; host-probe found a working queue.

Claude's next bounded scope is in that review: one-region S3 viewport/editor,
transported free flight only. Missing region renderer/imports must be implemented
against existing APIs; no fake curved walker, cross-region rendering or gravity.
Pending corrections/unresolved motion pause play with explicit recovery; never
discard debt or replay leftover time. Conflicting portals retain deterministic
refusal and an editable diagnostic, not arbitrary destination selection.

MUSE-42 is the only open Muse assignment: independent clearance identities and
face-foot certificates. CURVED_CLEARANCE_CONTRACT.md is the accepted design.
MUSE-40 supports face-limited hallway exactness only, not global field exactness.
Use clear-certified / blocked-certified / unresolved diagnostics; no universal
fitted peel margin, no automatic map conversion. Nested-cutter conservatism is
still open separately.

S3 VIEWPORT DELIVERED 2026-09-10, awaiting review.
docs/qa/claude-s3-viewport-2026-09-10.md. New engine/geometry/region-shader.js
(GLSL plus a JS reference written in the shader's shape) and region-renderer.js
(GL only); app/region-lab.js rewritten around moveRegionProbe with no gravity and
no stubbed walker; --region-lab wired into page-check, shader-check and the queue.
Field/render parity is EXACT: over 3388 samples the packed scene the shader
marches and the field.distance the walker collides with disagree by 0.0, with
owner agreement over 1372 non-seam samples including 41 on the carved doorway.
node tools/test.js 57/57; region-render 8/8; scene-check on s3-room passed;
shader-check compiles and links the S3 program; page-check --region-lab 36 checks
on a real RTX 5070 Ti through ANGLE D3D11, cold cache, 0.63 ms/frame over 30
frames at 604x505 with 160 march steps, float32 narrowing at most 2.79e-8;
page-check --ball-lab still 90, so the E3 lab is untouched. Three screenshots
inspected. Astra's settle fix and clearance contract are preserved unmodified.
Open items in that report: the renderer caps at 16 primitives / 72 planes / 12
groups against the WebGL2 GUARANTEE of 224 uniform vectors (this GPU has 1024);
objective and spawn entities are not drawn at all, so the fixture's goal marker
is invisible; the queue worker pid 2672 predates the --region-lab allowlist and
needs one restart to accept it; connected-room never existed and
connected-lab.nil.json still does not compile.

Next Astra job: review Claude's first S3 viewport evidence and Muse's clearance
checks. Then settle curved gravity/support and correction-resume policy before
walking integration. Do not duplicate their active implementation. Connected
rendering and the spherical bubble remain later. Runtime/schema hemisphere
disagreement remains a reported limitation; fix the initial fixture within the
supported patch, do not change the geometry convention to make it load.
