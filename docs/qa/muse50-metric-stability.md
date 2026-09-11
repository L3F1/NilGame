# MUSE-50: independent S3 numerical transport repair audit (2026-09-10)

The repair (3207536, `engine/geometry/metric-space.js` only): `normalize`
validates first, strips radial roundoff, then normalizes;
`stepWithTransport` retracts point/direction representatives on each
nonzero leg and carries every vector through one linear map with radial
cleanup, never renormalizing carried vectors; zero travel is exact
identity. Region spaces ARE these metric spaces (`region-world.js`
builds each region space with `createMetricSpace`), so this unit-level
audit rides the same kernel as the walker, the probe, and the camera.
No engine/app changes. Durable test: `metric-stability-truth.test.js`
(7/7). Old pre-repair code fails exactly the two repair-targeted checks.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 275fd4d
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
VERDICT: browser checks run THROUGH THE QUEUE here.
```

(Node-only task; no browser checks needed.)

## References (all test-local: own dot/hypot/acos; single-shot closed forms)

```text
R=.5/8/100 h=R*1e-4/R*.02 to 0.6 rad: worst pos err=3.25e-14 dir err=3.25e-14
e3+s3 zero travel: exact position/direction/carry, invalid carry still throws
norms {0.01, 2.47, 3.7} kept to 8.88e-16, linearity to 0.00e+0; non-unit direction throws
normalize: 1e-16..1e-10 cleaned, 1e-6+ throws; steps absorb 1e-9, refuse 1e-3; inputs never mutated
50 forward + 50 reversed legs at R=.5/8/100: worst return err=3.33e-16
triangles a=0.1/0.3 at R=.5/8/100: worst close err=3.05e-16, worst holonomy err=1.05e-13 (0.005008/0.045676 rad both sizes)
6000 legs with 1e-12 radial sown per leg: worst err=3.25e-14 (unretracted: 1.75e-9)
```

- Repeated legs: up to 6000 chained production legs totaling 0.6 rad vs
  ONE closed-form rotation — never a recomposed copy of the stepping.
  `step` (position-only) deep-equals every `stepWithTransport` position.
- Zero travel is `deepEqual` identity for position, direction, and carry
  on E3 and S3; S3 carry still validates tangency and both reject NaN.
- Speeds are not reset to one: carried norms 0.01/2.47/3.7 survive to
  8.88e-16, a+b linearity is exact, and a non-unit DIRECTION still
  throws `unit physical norm` — no silent velocity normalization.
- Boundary behavior was probed, not assumed: normalize cleans radial
  1e-16..1e-10 (output unit, tangent, direction unbendable, caller
  array byte-identical) and throws `/tangent/` at 1e-6+; steps absorb
  off-sphere 1e-9 by retraction and refuse 1e-3 (`/unit sphere/`).
- Inverse legs (50 forward + 50 reversed) return to 3.33e-16: the
  retraction has no directional bias.
- Closed geodesic triangles (right angle at origin, legs 0.1/0.3) rotate
  carried vectors by exactly the Girard area: 0.005008/0.045676 rad at
  every R in {.5, 8, 100}. Holonomy is area/R^2, R-independent in
  radians — the same angular loop gives the same angle on all three
  spheres. Aiming uses production `logAt` as fixture setup (closed-form
  geodesic, not the repaired transport); the angle reference and the
  measurement are own arithmetic.

## Old-code fail-demo (isolated, repo untouched, removed after)

`/tmp/m50old`: current `geom.js` + test, with ONLY `metric-space.js`
reverted to d3160ba (the repair touched no other kernel file). Result:
5 pass, 2 fail — exactly the repaired behaviors:

```text
FAIL tiny radial roundoff accepted, invalid input rejected, callers untouched: output not tangent at eps=1e-12
FAIL seeded per-leg radial residue does not accumulate: radial residue accumulated (1.7470437341893866e-9)
```

The old `normalize` divided by length without stripping radial error
(the 1e-12 survives in the output), and unretracted stepping compounds
sown residue linearly to 1.75e-9 over 6000 legs where the repair holds
3.25e-14. The other five checks pass on old code too — they pin
behavior the repair preserved, not behavior it changed.

## Reference limitations

- The closed-form rotation reference shares the rotation formula with
  production; its independence is single-shot-vs-chained (one cos/sin
  for 6000 legs), not a second derivation of spherical geometry. The
  Girard reference is a genuinely different formula.
- Loop aiming uses production `logAt`; a `logAt` defect near-antipodal
  inputs would bend the triangle. Legs here stay below 0.43 rad.
- Validation thresholds (accept ≤ 1e-10, reject ≥ 1e-6) pin observed
  behavior each side of a probed gap, not the implementation constant.
- No counterexamples: every sampled behavior holds. Drift beyond 6000
  legs, near-antipodal loops, and E3 holonomy (identically zero, not
  exercised) remain open.
