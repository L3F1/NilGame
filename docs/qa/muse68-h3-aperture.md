# MUSE-68 H3 aperture independent checks

Base b88788b. No production changes (`git status`: only untracked
`hyperbolic-aperture-truth.test.js`; `git diff` empty).

## Counterexamples: none found (preferred result not achieved)

- 1080-query sweep (R=.5/8/10000, translated non-axis frames, offsets
  0–.6R incl. near-rim .49/.499/.5/.501/.51, slants 0–1.2, body 0/.05R/.2R):
  every confident hit/miss agreed with independent signed-height
  scan+bisection and disc membership. 0 anomalies.
- 15 initial sweep flags were my probe's strict-inequality bug (grid sample
  landing exactly on h=0); fixed probe, re-ran clean. Disclosed, not hidden.
- Falsification pressure applied: exit-polarity back-side rays, solved
  (not copied) asymptotic direction, exact-range boundary, domain-before-root,
  centre crossings, coincident points 1e-8/1e-10/1e-12 at rapidities .4/1.9/3.9.

## Checks / results (Node only)

- `node hyperbolic-aperture-truth.test.js` — PASS: 30 hit agreements
  (bisection vs entry <1e-6R, on-plane residual ≤1e-9R), 84 sampled misses,
  42 unknowns all `uncertaintyFrom:0` with known reasons. Invalid inputs
  (bad radius/normal/direction/range/body, wrong kind) all throw.
- `node hyperbolic-aperture.test.js` — PASS, unchanged (27 crossings).
- Isolated mutant (`/tmp/muse68-mut`, body radius dropped from clearance):
  truth suite FAILS at `clearance, R=0.5` as intended. Main sources untouched.
- `node tools/host-probe.js` — browser UNAVAILABLE (no queue worker); per
  handoff, Node-only, no browser run required.

## Limits

Shared adapter (step/transport/ambientDot/distance) underlies both oracle
and test, so agreement is observed consistency, never proof; sampled misses
are not proofs of all-ray misses. Sweep oracle shares `distance()` —
root/classification logic is independently checked, the metric itself is not.
No full suite, commits, or agents used. Scratch kept at `/tmp/muse68-probe.mjs`,
`/tmp/muse68-mut/`.

READY FOR REVIEW
