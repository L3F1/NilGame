# MUSE-42: intrinsic clearance checks (2026-09-10)

Task: independent checks for the curved-clearance contract
(`docs/engineering/CURVED_CLEARANCE_CONTRACT.md`). Verdict: the contract's
analytic relation and face-foot certificate hold as stated on every seeded
probe; all three refusal paths (off-slab, singular, union-transfer) refuse
loudly; the negative-clearance counterexample is confirmed. No engine, app,
or schema changes. New durable test: `curved-clearance-truth.test.js`
(9 checks). Full suite: 58/58.

## Analytic face-height relation: HOLDS

Field vs independently rebuilt `R*asin(p.n)` max-plane, 25 seeded
center-local probes per config, translated and rotated cells:

- `R8-rot30: n=25 exterior=24 maxErr=0.0e+0`
- `R8-axis: n=25 exterior=24 maxErr=0.0e+0`
- `R0p5-rot30: n=25 exterior=25 maxErr=0.0e+0`
- `R10000-rot45: n=25 exterior=24 maxErr=0.0e+0`

The contract position identity
`p.n = s*cos(h/R)*sin(l/R)*v_i/l - sin(h/R)*cos(l/R)` verified per probe to
1e-12. Chart distinction is non-vacuous:
`field=0.134905 decoded=0.134905 author-as-v=-0.048635` — feeding
scene-origin author numbers as center-local `v` even flips the sign.

## Face-foot certificate: EXACT on interior, REFUSES off-slab

Positives (foot == field == sampler to 6 digits, transverse margins quoted):

- `R8-rot30 face0: foot=0.300059 sampler=0.300059 margin=0.600`
- `R8-rot30 face3: foot=0.250050 sampler=0.250050 margin=0.400`
- `R0p5-rot30 face0: foot=0.048062 sampler=0.048062 margin=0.084`
- `R0p5-rot30 face3: foot=0.040042 sampler=0.040042 margin=0.064`
- `R10000-rot45 face0: foot=0.300000 sampler=0.300000 margin=0.600`
- `R10000-rot45 face3: foot=0.250000 sampler=0.250000 margin=0.400`

The `R*asin(a) == dist(p,q)` identity holds to 6e-17; active-face
containment holds to 2.3e-16 (pure FP, hence the 1e-9 slack).

Refusals (exactness NOT claimed, conservatism quantified):

- `v=[-0.8,-1.2,0.1]: field=0.302634 truth=0.427248 gap=0.124615 over=0.301`
- `v=[0.75,1.25,-0.2]: field=0.352266 truth=0.436014 gap=0.083748 over=0.253`
- `jamb-adjacent: over=0.0519 status=unresolved`
- `1-a^2=1.0e-14 status=unresolved bound=12.5664` (singular path; the pole
  sits pi*R/2 from the face, unreachable in-patch by construction)

## Supporting sphere vs clipped extent: DISTINGUISHED

`same-h0: 0.300022766 vs 0.300022766 | moved-h0: 0.200033` — halving the
transverse half-extents leaves the field bit-identical; deepening h0 moves
it by 0.10.

## Negative clearance is not collision proof: CONFIRMED

Cube corner, r=0.36: `conservative clearance=-0.0588 truth clearance=0.0656`
with `t16=t32=0.425601` (12-digit two-grid agreement; third grid 0.425599).
The bound reads overlap; the nearest occupied point is 0.066 beyond the
ball; the certificate refuses. UNRESOLVED, not BLOCKED.

## Union transfer: REFUSED as required

Wall-alone certificate passes deeply contained and claims 0.200260, but its
foot encodes to `[0.000,1.201,0.999]` — strictly inside the door void — while
the union field reads 0.701298. Transferring the single-cell conclusion
would err by 0.50.

## Fail-demo (isolated, engine untouched)

Flipped-sign normal in a local copy: `control=exact(0.3001)
flipped=interior(interior)`. The corrupted certificate cannot reproduce the
field value.

## Reference tolerances and convergence

Sampler: per-face grid + top-4 multi-start descent, slab-filtered.
Single-start descent was caught trapping 0.048 high at NT=32 during this
task and replaced. Gate for every quantitative claim: NT=16 vs NT=32 agree
to 1e-6 (observed 1e-12 interior, exact on the counterexample corner).
Near jamb edges the min sits on the patch boundary and grids can disagree
at 1e-3; such probes are excluded from exact claims, not averaged in.

## Limits

Seeded probes, not a proof: no universal safe-distance or step-cost claim.
Truth legs are converged-sampler evidence (margins exceed reference noise
by 4+ orders), not proven lower bounds. Singular projection is unresolved
by design. Nested-cutter conservatism and whole-scene modifier semantics
remain open per the contract.
