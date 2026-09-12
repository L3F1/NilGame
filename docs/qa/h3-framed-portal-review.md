# Experimental H3 framed portals

Lead implementation, base 46c51be, LeoPC / Node24.20.0.

`compileHyperbolicFramedPortals` opts into H3 at the physical-frame boundary.
Default compiler, scene schema, editor and GPU gates stay closed. Transit reuses
the existing radial correspondence and metric transport; no duplicate mover.

Integration exposed the blanket on-plane refusal: the destination offset starts
on its reverse aperture and points outward. The new B>|A|+band branch establishes
strictly increasing height, hence no future entering crossing. Range/domain
limits still apply. Inward/tangential starts remain unknown. The previous test
expecting refusal for a strictly outward origin ray was updated to this explicit
contract and supplemented with inward/tangential refusals, not removed.

`node hyperbolic-portal.test.js` passes at R=.5/8/10000: translated/rotated H3
anchors, offset inverse transit, physical signed height, speed/frame preservation,
E3/H3/E3 and reverse routes, destination ball refusal, default gate rejection.
These use explicit runtime region descriptors and the existing metric-ball
sampler, not saved/compiled H3 scene documents. Two crossing offsets predict
the final E3 position independently of the carried path.

`node hyperbolic-aperture.test.js` passes 27 crossings plus edge cases;
`node hyperbolic-aperture-truth.test.js` retains 30/84/42 sampled outcomes.
`node portal-geometry-gate.test.js` passes. Isolated previous outward rule fails
the new suite (unresolved vs miss), script .agent-bridge/review-h3-framed.mjs.
No production mutation used for the fail-demo.

Remaining: independent outward-policy audit, scene field/schema integration,
CPU sight H3 dispatch and GPU implementation. No visual H3 milestone claimed.

Integration: node tools/test.js 116/116 suites, h3-framed-suite.log. Queue
page-check --connected-global 52 checks, real GPU, cold cache, 8.1s on LeoPC,
no page/boot error. This validates existing E3/S3 browser behavior, not H3 GPU.
