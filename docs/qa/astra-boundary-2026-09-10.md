# Cross-region camera boundary and focused context

Base inspected: 7c68a62, initially clean tree. Host: LeoPC, Windows,
Node v24.20.0. Changes are local; no commit or push made by this review.

## Decision and change

Claude's carried camera retains roll but mapFrame used camera.space for its
destination. E3-to-S3 transfer therefore rejected a valid four-component point;
S3-to-S3 transfer could silently retain the wrong curvature radius.

mapFrame now accepts an explicit fourth destinationSpace argument, defaulting
to camera.space for existing same-space callers. It validates mapped tangents
before roundoff repair can hide an incorrect mapping. The portal owns the
mapping; the camera does not infer a metric from vector length or rebuild roll.

cross-region-frame.test.js exercises off-center radial-aperture correspondence
at R=0.5, 8 and 100, physical speed, view/velocity angle, tangent validity,
orthonormality, inverse position/frame mapping and destination ownership.
Equal-dimensional S3 instances with different radii have a separate check.
Speed preservation is a gameplay policy, not the position map's differential.

Fail-before command: node cross-region-frame.test.js on unchanged camera-frame.js.
Initial five checks: 1/5 passed, exit 1; three transfers failed with
"point must contain 3 finite numbers" and invalid destination tangent handling
failed its expected diagnostic. After the fix those five passed. The added
equal-dimensional ownership regression is included in the final run.

This does not integrate cross-region collision, rendering or editor state.
The next contract is region-owned motion, preserving remaining time and checking
destination clearance while carrying the existing solver's actual path.

## Documentation

Shared rules decreased from 1316 to 321 whitespace-delimited words, measured
against the base with Node. This is a word count, not a token/usage prediction.
Mathematical/graphics/testing sections were extracted byte-for-byte into
SUBSYSTEM_RULES.md; coordination rationale into COORDINATION.md. Extraction
equality was checked against git show HEAD:docs/engineering/WORKING_RULES.md.
TASK_ROUTER.md selects relevant sections instead of mandatory broad reading.
The stale handoff is archived, with a short current NEXT_SESSION.md replacing it.

## Validation

node tools/host-probe.js: direct Chrome unavailable; no queue worker serving.
No GPU or browser validation claimed. This change introduces no shader/UI path.
node tools/test.js: 47/47 suites passed, exit 0 (includes the initial five
cross-region checks). After adding the equal-dimensional ownership check,
node cross-region-frame.test.js: 6/6 passed, exit 0. No production code changed
between these runs. node camera-frame.test.js: 9 passed, 0 failed.
git diff --check: clean. Numerical checks do not establish the yet-unimplemented
connected-room runtime's visual correctness.
