# Claude next: authoring markers, then a bounded host-service proposal

Read shared rules, NEXT_CAPABILITIES.md section 4 and the current region-lab
marker/selection code. Do not reread historical region-motion assignments.

1. Implement visible spawn/objective authoring markers in the S3 editor, using
   overlays/list labels rather than field or shader primitives. Intrinsic
   distance plus a selectable list entry is acceptable when projection is
   ambiguous. Distinguish editor aids from solid visibility; hide in play.
   Allow selection through the existing property/undo/save workflow. Do not
   implement new objective gameplay or enlarge shader uniform capacity.
   Allowed writes: app/region-lab.js, tools/region-lab.html, a focused marker test,
   docs/qa/claude-markers-2026-09-10.md. No kernel/schema/geometry edits.
   Test real selection, placement, undo, reload and play hiding through the
   actual handlers. Use host-probe and the browser queue; save/inspect an image.
   If selection already exists, reuse it rather than make a second transaction
   path. Report unsupported persistence visibly; do not drop entity fields.

2. After marker checks, inspect experiments/godot/ball_document.gd and ball_lab.gd
   against docs/host-capability-map.md. Write docs/qa/godot-host-slice-plan.md:
   the smallest version-2 S3 document/inspector/custom-viewport prototype and its
   parity checks. Identify native UI/undo/resource services to reuse. Do not
   port math, add dependencies or start migration in this assignment.

The new region-sight.js is a partial CPU reference. S3 surface-candidate and
range-boundary are unresolved; do NOT color them as surfaces or enable connected
GPU views. Astra owns the next certified S3 ray/Boolean contract.

Run focused checks and tools/test.js for implementation. Stage only your allowed
files, commit the tested marker change separately from the host proposal, and
report commands, failures, limitations and commit IDs. Preserve Muse's work.
