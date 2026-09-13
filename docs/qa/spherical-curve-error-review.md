# Spherical curve error review (2026-09-12)

Base a33e3e8. Production renderer source and live proof consumption unchanged.
This batch derives a conditional error allowance and adds a prototype computed-
exterior predicate, rather than assuming the evaluated sine/cosine pair is unit.
Contract, assumptions and next integration: ../engineering/SPHERICAL_CURVE_ERROR.md.

The GPU probe extracts sincos from CONNECTED_FRAGMENT (no rewritten polynomial),
instruments the post-fold argument, and evaluates ONE shared pair and the
position/dot in one fragment invocation. It checks 1150 angles: deterministic
random values in [-64,64], zero/endpoints, and both sides of half-pi boundaries.
Half the state/centre inputs target the unit-circle shortcut; half are varied
component-bounded vectors. This is not a full trajectory or actual portal ray.

The rational budget test establishes sine and cosine error ceilings below
2^-17, and combined polynomial/position/dot error below 2^-16 W plus the
absolute FTZ allowance. It does not prove the GPU obeys its arithmetic model.
The GPU comparison uses exact BigInt dyadic units, no rounded subtraction/sqrt:
the field excess and amplitude are squared and compared in common integer units.
The shared-pair norm is checked independently with the same exact arithmetic.

Hardware falsified both zero-error shortcuts: 604 pairs had norm above one and
205 evaluated dots exceeded the ideal amplitude. Maximum observed pair norm
was 1.0000001192107835. None exceeded the derived allowance. These are sampled
counterexamples to zero error, not fitted estimates used to select the allowance.

The new enclosureCurveExterior predicate recomputes amplitude and weighted
error over the whole exported box and outward-evaluates final subtraction.
It requires finite supported data, component bounds and a certified angle upper
bound <=64. On the existing 257-box corpus, 61 boxes retain a computed-exterior
certificate; 12 of the 73 ideal certificates now refuse. Every accepted result
passes an independent exact box-plus-error oracle. Changing the supplied bound
to65 refuses each otherwise accepted case. UNKNOWN-to-exterior refinement is
allowed when proved; equivalence to old E-band occupancy is NOT claimed.

This is deliberately conservative. Its validity is conditional on documented
binary32/FMA/FTZ assumptions. The live at() still invokes cs/sn separately;
shared-pair source integration, angle-bound production, serialized payload
ownership and visible/full-frame performance acceptance remain next. The
allowance is not automatically applied to the older default-off exact-identity
path, whose ideal-curve assumption remains attributed in the contract.

No new live pixel recovery is claimed. Compile/link/readback timings cover the
small combined arithmetic probe only, not full-frame rendering. The connected
browser checks also exercise the existing live preview, but do not admit this
new predicate into it. Legacy world sweeps were not repeated: production
renderer source was unchanged.

Final GPU checks: real RTX 5070 Ti / ANGLE D3D11 and SwiftShader both passed
`page-check --three-geometry` through the queue. Software also had604 pairs
above unit norm, with215 ideal-dot violations (hardware205); all stayed within
the derived allowance. Both certified61 boxes and refused12 prior ideal
certificates. Their arithmetic is not claimed bit-identical. Negative/nonfinite
angle guards are code-reviewed; the exercised angle refusal is65.
Commands, renderer strings, counts and local-probe timings are in
[spherical-curve-error-evidence.json](spherical-curve-error-evidence.json).

Final Node suite: `node tools/test.js`, 139/139 passed, including the exact
rational budget inequalities. Syntax and diff whitespace checks passed.
