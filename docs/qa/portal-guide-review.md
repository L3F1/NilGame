# Second-exit approach and guidance - 2026-09-11

User reports the second S3 exit seems unusable. Lead checks on52b70fd plus this
patch reproduced two ambiguous approach conditions, not a broken central exit:
front-to-back centered flight crosses; the aperture seen by a point ray is wider
than the opening usable by a radius.25 body. Back-to-front entry is not supported
by the existing portal policy. The user's exact pose is unknown.

Changes confined to global preview host/UI:
- Try second exit explicitly places a test pose2 units on its entering side.
  Ordinary moveRegionProbe travel crosses; no transit is forced. Reset repeats
  that chosen test placement. Normal spawn controls remain available.
- Crosshair and guidance identify nearest portal and its side, shortest distance,
  first crossing along the actual sight ray and forward-travel distance. Body-fit
  feedback accounts for radius; destination clearance remains a crossing-time test.
- Green spheres explicitly called landmarks, not portal surfaces. S3 can show
  a portal along a long route, distinct from the shortest route to its center.
- No geometry, renderer, portal policy or collision tolerances changed.

Evidence: Windows LeoPC Node24.20.0; Chrome/ANGLE RTX5070Ti. portal-guide.test.js
passes centered approach, normal movement exit, reset and .7-ish lateral shift
where sight sees sphere-exit but the body does not fit. Existing global model
602-frame route test passed unchanged. Queue page-check --connected-global passed
9 checks, including the new DOM button click and subsequent normal motion. Saved
exit-approach image inspected; portal is a circular view of flat target, not a
solid green ball. Numeric shader parity remains unchanged; thin magenta rims remain.

Muse60 was assigned independent front/back/offset approach checks. First bridge
launch failed WSL E_ACCESSDENIED before Muse ran; restarted outside sandbox once.
Agent outcome and final suite result are recorded below.

Integration verdict: 94/94 suites passed before adding Muse's test-only corpus;
then node portal-approach-truth.test.js passed all6 blocks on the same host/runtime.
No engine changes after that full run. Muse60 accepted after correcting its guard
independence/orientation claims with an isolated lead mutation: each single radial
check removal still passes, removing both fails at the .7 body assertion. Restored
scratch passes. Source remained unchanged. Final browser check9 passed with real
DOM click on the new approach button. We still do not know the user's exact pose.
