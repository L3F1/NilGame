# H3 ball query increment — 2026-09-11

Base2e44c7b, Windows LeoPC Node24.20.0. Host-free experimental ball sampling
and first-entry casts. Normal at centre is explicitly nonunique; ray result
separates hit/miss/unresolved. Domain/range, budget, start and tangency policies
are specified in H3_QUERY_CONTRACT.md. No scene/GPU/collision admission.

Focused hyperbolic-balls.test.js passed at R=.5/8/10000: physical distance,
outward normal, right-triangle-derived intersection, root at requested range,
inside start, closest-hit order, coincident roots, tangency, domain and budget.
Isolated tangency-as-miss mutation fails the check; production remains untouched
(.agent-bridge/h3-balls-fail.mjs). Guard bands are heuristic numerical policy,
not proven error intervals. Wider independent ray corpus is the next review.

MUSE-66 source reviewed and rerun:7/7 checks pass on18 envelope points. Report
accurately limits its radius sweep and short inward carries; no counterexample
found does not certify the whole envelope. No camera fixes needed.

Full host node tools/test.js:110/110 passed; .agent-bridge/h3-balls-suite.log.
No browser run for this scene-inaccessible helper; renderer behavior unchanged.
