# MUSE-71 independent connected H3 sight audit

Base 47dba7c. Host LeoPC (linux, WSL), node v22.23.2. `node tools/host-probe.js`
says browser checks are UNAVAILABLE (no worker serving); Node-only audit.
Production untouched; new coverage lives in `hyperbolic-sight-truth.test.js`.

Challenges (all off lead's axis line): a translated (x=+0.3) E3/H3/E3 world
where H3 geodesics curve, so every expectation is solved, never copied. Nearer
solid before remote portal ambiguity holds at ranges 2.2/3/gate-at-limit/30,
both portal orders (hit 1.7502378 vs lead's 1.75). Nearer portal before remote
uncertain solid gives a 2-crossing hit (3.6509357) with segment sum, region
order, and portal-carry-chain direction all exact. An independently built
x-axis R=2 tie world: exact coincidence refuses, 5e-3 near ties resolve to the
strictly nearer event (hit 2.995 / transit-miss, 2 crossings). Diagonal
single-region rays (R=0.5/8) agree with scan+bisection to 4e-15; at-entry range
refuses, pre-entry misses, centre starts refuse. Every smaller work budget
refuses; crossing budget refuses.

No counterexamples: the foreground policy held on all sampled cases. One
observation, not a failure: the exact tie refuses as `aperture-query` (gate
query at the foregrounded horizon is itself range-ambiguous), never as a hit
or safe prefix, which satisfies the contract.

Isolated mutation (scratch /tmp copy only): omitting the foreground bound
reproduces the original bug class on translated geometry, failing at the
gate-at-limit range with `unresolved aperture-query` instead of `hit`.

Limitations: the reference shares the space metric (not the root solver or
ordering); the scan cannot certify a miss; gate references share aperture
code; sampled scales only; no browser/GPU run.

Checks: `node hyperbolic-sight-truth.test.js` PASS;
`hyperbolic-sight`, `region-sight` (17/17), `aperture-refusal` PASS.

READY FOR REVIEW
