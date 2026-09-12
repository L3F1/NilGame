# Portal removal transaction — 2026-09-11

Base f5a605c; Windows LeoPC Node24.20.0.
Added removePortalPair(connectionId) through the existing model install boundary.
Deletes one saved connection and its two actual anchors across owning documents;
refuses missing/non-anchor/shared/referenced endpoints, without cascade. Removing
all connections is permitted. Neither removal nor rotation teleports the player.

Focused `node portal-removal.test.js` and `node portal-authoring.test.js` passed.
Checks cover swapped saved endpoints, base and envelope ownership, immutable
candidate refusal, upload failure, history/file load, no remaining portals,
missing convenience-exit handling, and Undo at an unsafe current pose. Rotating
an aperture through the player also refuses; moving away permits the edit.
Partner and player camera remain unchanged during valid reorientation.

Isolated mutation leaves the second endpoint behind: test fails on the surviving
sphere-entry anchor (`node .agent-bridge/portal-removal-fail.mjs`). Main engine
untouched. New UI/GPU checks are delegated to Claude, independent cases to MUSE-64;
neither is claimed complete by this API increment.

Full host `node tools/test.js`: 103/103 suites passed, including s3-truth within
the unchanged runner deadline this time. No concurrent browser workload during
this run. Log: .agent-bridge/portal-removal-suite.log. Earlier timeout evidence
remains in portal-ui-review.md; no test logic or timeout was weakened.
