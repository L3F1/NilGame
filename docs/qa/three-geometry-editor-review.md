# Experimental H3 editor model

Lead, LeoPC/Node24.20.0, 2026-09-12 UTC, code based on f3c0003.

`createConnectedGlobalPreview(doc,{experimentalH3:true})` retains the same
explicit compiler policy for creation, edits, loads and history. Default callers
still refuse H3. Status identifies bounded H3 correctly. No new visible preset
or GPU admission is included; the host install callback remains the atomic
rendering-capability gate.

New three-geometry-editor.test.js traverses E3/full-S3/H3 using actual model
movement, then checks H3 ball resize/create/remove, pose and camera ownership,
undo/redo, JSON no-op load, spawn-overlap refusal and host-install refusal.
Refusals retain document/world/state/history. Further motion works after edits.
Previous model fails the new test at H3 compilation in an isolated module copy
(.agent-bridge/editor-review.mjs). Existing connected-editor test also passes.

Full Node suite on the approved host:124/124, three-editor-host-suite.log.
First sandbox run failed bridge-test temporary-directory cleanup with EPERM;
no product test was weakened. Queued page-check --connected-global passes52
on real GPU, cold cache, no page error (three-editor-browser.log). Browser check
covers existing E3/S3 host regressions, NOT H3 rendering.

Claude GPU draft remains isolated and returned for four repairs; see
h3-gpu-lead-review.md. Next: repaired GPU runtime readback and then visible
three-region preset/editor integration.
