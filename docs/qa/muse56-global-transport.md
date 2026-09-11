# MUSE-56: global S3 transport truth for existing stepWithTransport (2026-09-11)

No engine/app/schema/queue edits. New test: `global-s3-transport-truth.test.js`
(8/8 pass). It exercises the EXISTING `stepWithTransport` in
`engine/geometry/metric-space.js` on full-sphere paths at R=0.5/8/10000.

Result: the step formula is globally defined on the whole unit S3 in R4;
`withinDomain` is a bounded runtime-patch policy (default maxDistance=pi*R/2).
Full 2*pi*R loops close to 2.45e-16; antipode/half-circle exact to 1.22e-16;
720 short steps agree with one full loop to 6.40e-16; octant triangle
(e4->e1->e2->e4, explicit pi/2 legs) closes to 6.12e-17 with signed holonomy
exactly +pi/2 forward / -pi/2 reversed, matching the independent Girard
reference (three right corners verified by test-local dots, area=3*pi/2-pi=pi/2).
Endpoint `transport` correctly throws at antipodes; segment `carry` is the
supported path. Patch guards verified intact: antipode/equator outside domain
yet stepped exactly; `encode` refuses them; hemispheric `maxDistance` cap holds.

Fail mutation (isolated /tmp copy, identity `carry`, engine diff empty):
5 passed, 3 failed -- exactly the triangle/frame checks fail with
"S3 vector must be tangent at its point". Scratch removed.

Command: `node global-s3-transport-truth.test.js` -> 8 passed, 0 failed.
Host: LeoPC (linux, WSL), node v22.23.2; repo @ 50e796b. host-probe:
browser checks UNAVAILABLE here (no queue worker); Node-only task, no
browser run needed. Limitations: evidence is unit-level on the shared kernel
(region spaces reuse `createMetricSpace`); R=10000 uses large travels
(2*pi*R) but identical angles; no full-suite run per manifest (focused test only).

Lead review, 2026-09-11: accepted after focused host rerun (8/8) and isolated
identity-carry mutation (5 pass / 3 fail as expected). Corrected “4-sphere” to
“S3 in R4,” removed an unused helper, and renamed a norm/tangency check that
did not actually measure handedness. No assertions weakened. Host rerun frame
return error 9.06e-16; 2.45e-16 above refers to point/direction closure.
