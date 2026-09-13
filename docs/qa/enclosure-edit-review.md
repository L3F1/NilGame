# Enclosure editor lifecycle acceptance (2026-09-13)

Base 70032dc. Test-only addition; the default editor/renderer is unchanged.

The isolated editor model uses its real installWorld transaction callback to
replace both candidate and ordinary renderer worlds. At a fixed E3 spawn view
(65x49), resize north-landmark from radius 0.6 to 0.78, undo, redo, undo again,
load the saved edited JSON, then refuse a negative radius. The caller's world
is restored in finally; its model/history/player are never edited.

Successful transactions must increment the revision exactly once and clear
lastAssociation with world-replaced before the next draw. Rejected edits must
leave both unchanged. The rendered geometry must actually change after resize;
undo must restore the baseline packet, redo/load the edited packet exactly.
Every pose preserves camera/player state. Candidate-off equals ordinary output;
candidate-on preserves all resolved status/owner/region/distance packets.
Recovered pixels receive the existing CPU owner/region/distance check.

Certificates are generated every draw, not cached. This verifies transaction
bookkeeping and rendering after uploads, not a cached-payload replay attack.
The independent ordinary program is a cross-program reference, not independent
mathematical truth. One object and pose do not cover arbitrary edits or portals.

Initial harness radius 1.1 was refused by the existing angular-radius range;
the test was corrected to 0.78, without widening renderer admission.

GPU verdict: passed on RTX 5070 Ti / ANGLE D3D11 and SwiftShader. Seven
records on each backend, zero offChanged/settledChanged. The resize visibly
changed the packet; undo/redo/load restored the corresponding packet exactly.
Successful revisions advanced 0 through 5; invalid edit stayed at 5. Baseline
and undone scenes recovered one pixel; the resized scene recovered none.

Commands: node tools/check-queue.js page-check --three-geometry --timeout=300
and the same command with --sw. Runs completed in 89.0 and 198.7 seconds.
[Compact evidence](enclosure-edit-evidence.json) contains both lifecycle records.
Existing motion, AA, payload corruption and portal expiry checks also passed.
This batch adds no new image improvement and does not close software AA timing.
Full Node-suite result follows below.
Next: intended-resolution images and startup/frame cost before UI exposure.

Final validation: 139/139 Node suites passed. Syntax and git diff --check passed.
