# Fresh-chat handoff for Astra

Current work follows cedfdd2: visible three-geometry gallery has paired portal
markers and an E3 return landmark; sparse numerical fixture remains unchanged.
Read WORKING_RULES.md, then the relevant TASK_ROUTER.md row only.

## Next task

Repair the S3 BALL tangency/root precision, not the global E constant. Read
 docs/qa/gallery-ray-census-review.md for the bounded contract and concrete ray.
Current shader ratio guard abs(ratio)>1-4E with E=.00003 covers all52 sampled
numerical refusals at gallery entry; CPU resolves18 hits/34 misses. Both GPU
backends agree. This is a candidate mechanism, not a proven tighter error bound.
Account for packed coefficients, camera/portal drift and reduced trig. Retain
true tangencies, half-space behavior, event ordering and unresolved semantics.

Durable census runs with page-check --three-geometry [--sw]; packets include
scene/pose/raw status counts/crossings and replayed guard candidates. Root
regression injects owner/distance/lost-hit faults. No shader change this turn.

The visible gallery uses14/16 primitive slots. Do not pile on more marker balls.
Keep the sparse connected-three-geometries.nil.json unchanged for reference.
Worlds menu opens tools/connected-global-preview.html?preset=three.

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
