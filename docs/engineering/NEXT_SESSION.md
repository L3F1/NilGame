# Lead next session

Start from actual status. That working tree is now INTEGRATED: everything
described below was reviewed, verified and pushed to origin/main on 2026-09-09,
so start from a pull and the new HEAD rather than from b9b42e7. Read
docs/qa/opus-integration-2026-09-09.md first for the verdicts, the one defect
found at integration and the full verification table; then
docs/qa/astra-review-2026-09-09.md for the preceding round. Preserve .codex/ and
other agents' work. Do not repeat passed checks without a relevant change or
unresolved concern.

Two environment facts to carry forward. Headless Chrome on the Windows host is
WORKING again (real-GPU cold `page-check --worlds` gave 346 checks, exit 0), so
the "headless is non-functional" verdict in overnight-results.md is history, not
today's state. WSL's socketpair block is unchanged, so browser and GPU checks
still run only from Windows while Node suites run on either host.

## Completed this session

- Windows page-check profile-lock failure fixed; real GPU 346 checks pass.
  WSL's socket restriction is separate. POSIX process-tree cleanup is now
  accepted and verified on a real POSIX host (29/29, grandchild reaped,
  out-of-group sentinel untouched); its profiles are still not published for
  warm reuse, because that needs one real Chrome run on POSIX and WSL cannot
  launch one. A Windows-only hang and process leak in that suite's own probe was
  found and fixed at integration - see the MUSE-06 verdict.
- F4 closed: Sol/SL2R K restarts the lab without hidden H3 courses.
- Scene-v1 E3 ball reaches browser/native authoring inspectors, signed
  distance queries and a shared preview shader; edits, undo/redo, save/load
  and unsupported-input rejection work. See docs/ball-lab.md.

## Main job: DONE - the first-person query boundary holds

`engine/world/collision.js` is the portable, host-free collision contract:
swept motion by conservative advancement, contact normals, spawn clearance and
overlap resolution, consuming only the distance-bound and normal capabilities
from docs/rendering-contract.md. 21 closed-form tests; the browser ball lab
plays through it. The edit/play transaction policy is chosen and written down
in docs/ball-lab.md - an edit is never refused for standing in the way; the
probe is pushed clear, or respawns when there is no honest push.

Next, in order:

1. An authored FLOOR primitive, then gravity and ground contact. The lab's grid
   is deliberately NOT in the collision field, because the document has no floor
   entity; a field that disagrees with the picture is the failure this boundary
   exists to prevent. This is the first schema addition since v1.
2. Curved balls behind an H3/S3 `space` (step, transport, project) and metric
   distance/normal. The solver already takes that interface; `e3Space`'s
   transport is the identity and a curved space MUST override it or the probe
   is silently steered.
3. Selection, a gizmo and more than one entity, so the editor authors a scene.
4. Then same-geometry authored portal transit, with swept crossing, remaining-
   time integration and a blocked-exit policy - the sweep already returns
   travelled distance, which is the remaining-time budget a crossing needs.

Godot's flat physics may serve as an independent E3 control, not as an implicit
solver for curved geometry. Keep the portable collision contract host-free.

Then add H3/S3 metric balls behind explicit distance, ray-hit and normal
capabilities. Account for curvature radius and point/frame types; do not infer
these from host Transform3D. Native ball_document.gd currently mirrors a small
subset validator; use shared conformance cases before extending either runtime.
The scene validator/schema remains the reference. Avoid two evolving schemas
or silently treating unsupported geometry as E3.

After one usable edit/play loop, design same-geometry authored portal transit
with swept crossing, remaining-time integration and blocked-exit policy. Only
then extend to E3/S3 apertures. The S3 bubble needs a separately chosen boundary
and terrain-transfer contract; a region switch alone cannot implement it.

## Other migration gates

Refresh H3/S3 native parity after current shader changes; measure real input
latency and Sol/SL2R long-ray convergence. Test two native network instances.
The E3 authoring slice does not settle Godot migration or whole-game parity.

## Muse's help

MUSE-06 and MUSE-07 are accepted and integrated. The open queue is MUSE-08
(a cross-platform regression guard for the browser-test lifecycle, closing the
defect that reached integration), MUSE-09 (shared JS/GDScript conformance cases
for the two ball runtimes, which NEXT_SESSION asks for before either is
extended) and MUSE-10 (a host/runtime runbook for the checks). All three are
Node-only and run without Chrome. Keep geometry, collision guarantees, frame
transport and connection policy with the lead.
