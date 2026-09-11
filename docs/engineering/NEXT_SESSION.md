# Fresh-chat handoff for Astra

2026-09-11. Read WORKING_RULES, inspect status, use relevant TASK_ROUTER row.
Latest: ball creation/removal in Full S3 portals. Read CONNECTED_EDITING.md and
docs/qa/connected-ball-authoring-review.md. Claude's ball UI batch is accepted.
MUSE-62 is assigned portal-authoring contract checks; inspect bridge status before
dispatch/retry. Manifest describes that task; do not rerun completed Claude work.

The complete E3/S3/E3 fixture now supports creating/removing balls, anchor position
and paired radius, spawn position, undo/redo, JSON download/file-input load.
Player pose is preserved and camera rebound to the new adapter; history and GPU
packet commit only after validation. Never reset to spawn as an edit side effect.
Bodies/spawns/apertures and GPU subset/caps can refuse; prior state survives.
Halted motion forbids edits until reset. Delayed file reads cannot overwrite a
newer file choice or property edit. Renderer.replaceWorld changes texture data,
not shader programs. The model.world and renderer.packed properties are getters.

Next milestone: create/reconnect explicit portal pairs through this transaction
boundary. Read CONNECTED_PORTAL_AUTHORING.md, especially final-graph swaps and
base-to-envelope migration. Form orientation is read-only;
no gizmos or global S3 floors/cells yet. CONNECTED_NEXT_MILESTONE.md gives the
sequence. Bounded H3 is the next adapter test AFTER connected authoring; Nil/Sol
require numerical contracts, not new shader tags. Godot remains a possible host.

Preserve these traps:
- Contact budgets are not permanent halts. Existing motionPause plus one bounded
  resumeRegionCorrection can settle debt; never replay unspent movement time.
- Camera up follows the actual movement/portal/correction path. Recompilation is
  not movement. Do not rebuild from world up or construction axes.
- S3 shader native trig failed SwiftShader distance by .045: keep reduced trig
  and .001 CPU/GPU distance tolerance. Do not weaken debug/refusal checks.
- fwidth in divergent material branches brightened AO: no implicit derivatives.
- Smooth edges samples four rays, retains any numerical uncertainty as magenta;
  debug/highlight remains centre rays. Known software renderers default off.
  Thin silhouette uncertainty remains unresolved, not recoloured as misses.
- Global GPU subset remains R8 additive balls angular radius .05-.1, range64.
  Dark checker coverage exits can be remote E3 boundaries, not S3 chart walls.
  A spherical image of a portal is not a second physical aperture; retain guide.

Browser checks go through host-probe's current verdict; never from agent clones.
Current queue worker50244, probe once/session. Run focused/full Node and affected
GPU checks, push user-facing changes and verify Pages. Evidence in review files.
