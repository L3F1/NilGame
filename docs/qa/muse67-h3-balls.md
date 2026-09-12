# MUSE-67 H3 additive-ball truth corpus (rev 2)

Reference: bisection on g(t)=distance(step(p,u,t),center)-radius from a
dense 2000-scan bracket. Independent of the production A/B/C/D/H root
formula ONLY; shares production distance/step. A bracket supports the
observed entry; scan-only no-hit is sampled evidence, not a certified
miss; earlier narrow dips/tangent touches between samples are not
excluded.

Lead-review fixes: aim offset now truly perpendicular (ray direction
transported to the aim point, parallel component projected out, asserted
<1e-9); ref no-hit renamed sampled-miss; production miss plus
sampled-miss counts as sampled agreement, not proof; production hit plus
sampled-miss falls back to direct entry verification (on-surface plus
interior-just-beyond) instead of a false-hit claim.

## Results

- `node hyperbolic-balls-truth.test.js` -> 66 observed hit-hit
  (distance <1e-6R, id match), 33 sampled miss-miss, 0 narrow scan-miss,
  21 unknowns each tallied vs reference (21 inside-start refusals,
  0 hit-refused, 0 sampled), 0 false confident answers, R=.5/8/10000.
- `node hyperbolic-balls.test.js` (lead, untouched) -> green:
  "physical signed distance/normals, independent intersections,
  tangency, range, domain and budget passed".
- Fail-demo (isolated /tmp copy, production untouched): +0.01R
  hit-distance bias -> AssertionError `R=0.5 seed=0: hit at
  0.33165..., reference 0.32665...`; scratch removed; focused pass
  above restored.

## Limits

- host-probe: browser checks UNAVAILABLE (no AF_UNIX socket, no queue
  worker). Node-only; no factory/GPU/collision claim.
- Guards remain heuristic bands, not interval proofs; corpus pins
  behavior, not rigor. Production files untouched.

READY FOR REVIEW
