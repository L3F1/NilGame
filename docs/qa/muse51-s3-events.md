# MUSE-51: independent S3 boundary-event audit (2026-09-10)

`sphericalBoundaryEvents` (`engine/geometry/s3-ray-events.js`) audited
with independent great-circle geometry and bisection on surface
predicates (dot products only) — never a second phase +/- acos solve.
Fixture setup uses compiled worlds and production `logAt`/`normalize` as
aiming (closed-form geodesics, not the solver); every root location,
transition, normal, order item, and length is verified against bisection.
No engine/app/test changes; Claude's classifier untouched. Durable test:
`s3-ray-events-truth.test.js` (9/9). One tolerance-gap finding with a
measured mechanism; no wrong event lists found.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 5877847
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
VERDICT: browser checks run THROUGH THE QUEUE here.
```

(Node-only task; no browser checks needed.)

## References (measured)

```text
R=0.5 oblique ball: 2 events, max resid=1.1e-16 max guard=2.7e-12 min |n.d|=5.9e-1
R=8 oblique ball: 2 events, max resid=0.0e+0 max guard=5.5e-11 min |n.d|=7.2e-1
R=100 oblique ball: 2 events, max resid=1.1e-16 max guard=8.1e-9 min |n.d|=7.1e-1
R=0.5 metric oblique: 2 events, max resid=1.1e-16 max guard=1.7e-12 min |n.d|=9.4e-1
R=8 metric oblique: 2 events, max resid=1.1e-16 max guard=2.7e-11 min |n.d|=9.4e-1
R=100 metric oblique: 2 events, max resid=1.1e-16 max guard=3.3e-10 min |n.d|=9.4e-1
R=8 r=11.2 pair: 2 events, max resid=8.3e-17 max guard=2.9e-12 min |n.d|=1.0e+0
R=0.5/8/100 r=2.5R lone exit at 3R exactly; degenerate r=piR refuses
rotated cell: 4 events, max resid=1.7e-16 max guard=5.0e-12 min |n.d|=3.4e-1
tilted plane: 1 events, max resid=2.8e-17 max guard=5.0e-12 min |n.d|=3.1e-1
thin pair 0.002000 apart resolves; hunted th*=0.12312498122384068 (sep 0.0e+0) refuses
central: 2 on-boundary; off-axis: 2/2 outside-clipped-cell; none claimed as hits
entry guard=5.5e-11: maxD+guard/2 and start-guard/2 refuse, maxD-3guard excludes
tangent / coplanar / event-budget x2 / input-roundoff: all distinct
skip miss: 0 events, 2000-sample scan has no sign change
behind miss: 0 events, 2000-sample scan has no sign change
```

Per event: residual < 1e-9, bisection agrees within guard, transition
matches bracket slope (balls: rising = enter; faces: falling = enter),
normals unit/tangent with incidence sign matching transition, outwardness
(ball pairs share an interior midpoint both normals face away from; lone
events sided; faces point along their pole), distances ordered in range,
point/direction consistent with the ray to 1e-9, no hit field anywhere.
Large-ball lengths match closed form too (entry (pi/2-1.4)R, exits 3R).

## Finding: decimal-authored rotated frames refuse every ray (tolerance gap)

A geodesic cell rotated 0.5 rad with 8-decimal frame components
(`forward [0.87758256, 0.47942554, 0]`, legal: compile requires 1e-8
orthonormality) compiles fine, but EVERY ray against it returns
`unresolved/input-roundoff`. Mechanism, measured: the lifted face poles
are off-unit by 1.97e-9, and the solver screens poles at EPS =
128*Number.EPSILON ≈ 2.8e-14 — the compile tolerance is ~70,000x looser
than the solver's pole screen. A float-exact frame (`Math.cos(0.5)`,
pole dev 2.22e-16) works: 4/4 face events verify. This is a conservative
refusal, not a wrong complete list — but anyone authoring frame angles
in decimals gets a silently unusable cell, and nothing at compile time
warns that the solver needs float-perfect frames. Repro: the `rotcell`
scene with the truncated frame above, any unit ray, any maxDistance.

## Fail-demo (isolated /tmp copy, repo untouched, removed after)

Flipping the ball outward sign (`sign:-1` → `sign:1`) in the copy only:
5 pass, 4 fail — exactly the ball checks, all on transition inversion:

```text
FAIL compiled oblique balls ... event 0: transition (rising=true)
FAIL metric oblique pairs ... event 0: transition (rising=true)
FAIL large balls ... event 0: transition (rising=true)
FAIL roots near both range ends ... event 0: transition (rising=true)
```

Plane/cell/miss/refusal checks still pass on the mutated kernel,
proving the failure is specific to ball orientation, not the harness.

## Refusals vs wrong lists; limitations

Every refusal reason was pinned on a constructed fixture:
`tangent-or-ill-conditioned` (rotated graze), `coincident-or-ill-conditioned`
(rotated coplanar ray), `coincident-events` (hunted exact face coincidence,
sep 0.0e+0), `range-boundary` (both ends, adaptive guard procedure),
`event-budget` (3-candidate ray with 2 and 0 budgets), `input-roundoff`
(1e-9 direction drift the metric absorbs), `degenerate-ball` (r = piR).
No complete list was wrong on any sampled fixture.

Limitations: bisection references share the cos/sin geodesic evaluation
with production (independence is analytic-solve vs bisection, not a second
geometry); dense miss scans are sampled, not proven; the coincidence hunt
re-derives its aim in-test and is deterministic only given identical float
arithmetic; near-antipodal inputs, E3, and multi-primitive scenes are out
of scope; guards are screening policies, and nothing here certifies them
as interval bounds.
