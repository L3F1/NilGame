# Region motion independent truth (MUSE-39)

Muse, 2026-09-10. Corpus: `region-motion-truth.test.js` — 21 checks, green.
The implementation (`engine/world/region-motion.js`) was not read for this;
the reference below is derived from the contract and the embedding math, and
the portal transit map is used only as emergence reference where noted.

## Reference (rebuildable)

Constant velocity plus collision: no forces, velocity piecewise constant,
every regular segment of length d at speed s consumes d/s. E3 free flight
`p(t) = p0 + v*t`. S3 (unit 4-vectors, distances scaled by R): physical speed
`s = norm(p0,u0)`, euclidean `e = |u0|`, unit tangent `w = u0/e`, rate
`a = s/R`, `p(t) = cos(a*t)*p0 + sin(a*t)*w`. Self-checked against
`space.distance` at R = 0.5/2/8/100 (1e-12). Round trip: reversed velocity
retraces the geodesic; transports cancel; portal maps are inverse; camera
comes home. Slide (E3): contact at `(gap)/vn`, `v' = v-(v.n)n`,
`end = contact + v'(dt-t1)`. Crossing costs no time:
`sourceArc + destArc = s*travel`, up to the ~4e-4 zero-time exit offset.

## Case table (all with the clock audit: consumed+remaining == dt and
travel+rest == consumed, 1e-9)

Free flight E3/S3 (R 0.5/8/100) vs closed form; centre-ray and off-centre
crossings with aperture-in-disc and arc sums; tilted (30°) round trip with
roll home; two S3 radii (1.5→5) with the wrong-R trap (discriminating gap
required > 1e-3); slide/head-on/deflect-into-portal vs slide arithmetic;
three blocked exits (misfit pass-through, occupied, offset-obstructed) with
input-immutability and no-destination-leak scans; frame-end crossing incl.
the `3*(2/3)` rounding trap; legitimate return with clock both ways and
camera home; tied apertures both authoring orders; maxCrossings/maxSteps/
maxContacts exhaustion plus dt=1e6; out-of-range event provider throws;
finding 4 two-frame reproduction.

## Time audit

Every case balances: `consumed + remaining == dt`, `travel + rest ==
consumed`, corrections separate and nonnegative. Observed convention: the
exit offset adds ~4e-4 arclength with zero time (arc sums land at
`s*dt + 4e-4` within 2e-3). No double-consumed or refunded path found;
budgets retain unconsumed time; `dt = 1e6` ends valid with `remaining > 0`.

## Finding 4: CONFIRMED

Free-standing gate pair, plug-refused crossing: frame 1 ends `blocked-exit`
exactly on the aperture plane (y = 2.000000). Frame 2 from there:
`crossings = 0`, region still `room`, position y = 6.000000 — walked 4 units
through the plane into source space, the one-sided rule declining the
on-plane test. The leak is real in free-standing apertures and, as Claude
noted, walled apertures are saved only by their walls. Policy for Astra;
reported, not fixed.

## Disagreements with the contract

None observed. Every probed behaviour — arc sums, slide arithmetic,
refusal ownership/immutability/leak-freedom, tie handling, budget honesty,
the event-range throw — matches the contract text.

## Fail-demo and runs

One mechanism broken in an isolated worktree (`git worktree`, real tree
untouched): the event-range throw in `collision.js` replaced by a clamp.
Corpus: 20/21, catching exactly `an event past the proposed leg is refused`.
Worktree removed; real tree green:

`node region-motion.test.js` → `34/34 region motion checks passed`
`node tools/test.js` → `53/53 suites passed` (49 baseline + 4 new corpora)
`node region-motion-truth.test.js` → `21 checks passed, 0 failed`
(WSL node v22.23.2 @ 7816d7f). Status: READY FOR REVIEW.
