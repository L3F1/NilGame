# Fresh-chat handoff for Astra

Current work follows cedfdd2: visible three-geometry gallery has paired portal
markers and an E3 return landmark; sparse numerical fixture remains unchanged.
Read WORKING_RULES.md, then the relevant TASK_ROUTER.md row only.

## Next task

Read SPHERICAL_ROOT_PRECISION.md: shared CPU root-interval reference now exists
in engine/geometry/spherical-root-bounds.js.241 independently bracketed roots
pass; removing amplitude input uncertainty fails. No GPU behavior changed.

E3-to-S3 interval transfer reference now exists in portal-transfer-bounds.js;
read PORTAL_TRANSFER_PRECISION.md.90 reference crossings and central ball-root
composition pass; bypassing parallel transport fails. No renderer change.

Isolated GPU stable transfer evaluation now passes60 cases/540 components on
real GPU and SwiftShader; missing-transport mutation caught. Read
 docs/qa/portal-transfer-gpu-review.md. Candidate lives in portal-transfer-gpu.js;
live connected shader still unchanged. Not a universal backend proof.

Interval-aware additive event selector now exists in additive-event-order.js
with CPU and GLSL variants. Both GPU backends pass8 isolated ordering cases and
catch an omitted-overlap mutation. See docs/qa/additive-event-order-review.md.
No live renderer change; additive/outside-start/completeness assumptions matter.

Next: GPU propagation of upstream error and spherical root intervals, then wire
one supported path to interval-aware ordering. Transfer evaluation and ordering
are separately GPU tested; their live error propagation is still missing.
MUSE-74 rev1 NOT accepted: oracle compared raw carry(v) with normalized output.
Revision dispatched; check bridge status, review corrected output normalization,
and integrate only after checks. Do not duplicate Muse's corpus work.

Read docs/qa/gallery-ray-census-review.md for the baseline:52 sampled numeric
refusals,18 CPU hits/34 misses, all with S3 ball tangency-guard candidates.
Census runs via page-check --three-geometry [--sw]. Keep diagnostic colors.
Visible gallery uses14/16 primitive slots; sparse reference remains unchanged.

## Current evidence and limits

- H3 GPU admission is opt-in. Stable span, material and refusal provenance fixes
  are integrated; review h3-stable-span-review.md, h3-material-review.md and
  h3-refusal-provenance-review.md under docs/qa when touching those paths.
- Historical latest GPU: 13 views / 23569 rays per backend, 22 extra refusals,
  one lost hit, no checked answer disagreements. Existing connected-global52
  passed. These counts are attributed evidence until rerun.
- MUSE-73 corrected CPU census rerun twice on LeoPC/Node24.20.0: 12740 rays,
  1241 hits, 8357 misses, 3142 domain exits. NOT proof that GPU purple pixels
  are coverage. Refusal classifier regression caught false domain labels.
- This review: full approved-host Node suite126/126 passed (census-suite.log).
- Driver GPU timing and representative interactive latency remain open.
- Godot trial follows visible three-geometry acceptance, before a large custom
  gizmo/asset workflow. Keep browser as reference. Future optics/portals/physics
  estimates and distinctions live in FEATURE_ROADMAP.md.

## Coordination and durable traps

MUSE-73 accepted with lead corrections; MUSE-72 research awaits source/license
review in its isolated checkout. No duplicate dispatch. Claude remains quota
limited until user renews availability. Run host-probe once each new session;
use its current queue verdict, never historical worker PIDs.

Do not hide numerical refusals. Keep metric transport across actual motion,
portal and correction paths; recompilation is not movement. Do not replay
unspent motion when settling correction debt. Preserve reduced S3 shader trig,
CPU/GPU tolerances, and no derivatives in divergent material branches.
Construction coordinates are not ambient tangents. Global coverage and bounded
charts are different policies, not different S3 geometries.

Older status entries were archived in docs/archive/next-session-through-2026-09-12.md;
read only for historical provenance, not current instructions.
