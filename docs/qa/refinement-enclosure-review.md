# Enclosure arithmetic prototype (2026-09-12)

Base 9c3a3ed. This is a standalone experiment, not a new live rendering path.
Follow-up: [actual transfer encoding](refinement-transfer-enclosure-review.md)
supersedes the original endpoint-domain limitation below.
The existing exact-identity consumer and its three attachments are unchanged.
Factoring out FLOAT_BANDS_GLSL preserves both expanded production proof strings
byte for byte; it does not alter their arithmetic or compiler input.

## Implemented boundary

The prototype exports one scalar component radius around each nominal point and
tangent. It recomputes the S3 sinusoid amplitude exclusion over outward-rounded
symmetric boxes, then checks membership of the candidate state conservatively.
These are ambient component-error radii, not physical lengths or player clearance.

The membership encoding permits signed zero or magnitudes from 2^-100 through
2^100. Nonzero differences between permitted binary32 inputs are normal, and
subtraction cannot overflow. One outward neighbour bounds a round-to-nearest
binary32 difference. This arithmetic assumption is explicit; sampled GPU passes
are not a theorem about every implementation. Unsupported values refuse a
certificate, not a scene or a movement request.

Domain classification must use bits: floating comparisons can flush subnormal
values to zero. The real GPU reproduced a false acceptance of the minimum
positive subnormal into a zero-radius box around zero before the bitwise repair.
The new tests require those cases to refuse. Dot, square and sum intervals must
also be finite BEFORE square root can clamp a NaN to zero; extreme finite and
nonfinite field cases exercise that refusal.

## Independent checks

The reference represents each finite binary32 number as an exact BigInt multiple
of 2^-149. Membership uses exact subtraction. For the exported boxes it evaluates
the exact supports A=|dot(C,qp)|+rp*sum(|C|) and B=|dot(C,qu)|+ru*sum(|C|), then
compares A*A+B*B with c*c without a square root or rounded products.

This catches two deliberately unsafe shortcuts on the GPU:

- Ordinary abs(value-centre)<=radius accepts an outside state when subtraction
  rounds the excess away. Even JavaScript doubles hide the 1-(-2^-100)>1 case.
- Reusing an exclusion proved for an anisotropic box after expanding it to a
  symmetric box wrongly excludes a surface. Reproving over the exported box
  refuses that certificate.

The GPU probe includes 517 membership cases with 128 deliberately interior
cases, eight encoding-domain refusals, 257 box cases, and four invalid/overflowing
field refusals. Each exported radius must cover its original input interval.
Every accepted miss is checked against the exact box oracle. Distinct-state
counts require membership AND a miss certificate from that same invocation,
checked using its own returned radii. The initial mixed corpus had too few
guaranteed interior samples for its participation threshold; dedicated interior
cases fixed the harness without reducing the threshold.

The exact-reference Node suite has 56 checks, including signed zero, subnormals,
extreme floats, boundary equality and the expanded-box counterexample.

## What this does not establish

The target is one RGBA32F pixel carrying radii and decisions. It is not the
proposed four-attachment producer plus separate consumer. Nominal inputs are
binary32 uniforms; cross-program attachment serialization, stale world/sample
rejection and actual first-transfer payloads remain to be tested. The producer
corpus uses a fixed point/tangent basis with varied fields and asymmetric widths;
it is not coverage of every transported camera frame.

The current encoding restriction also applies to original band endpoints. Actual
transfer bands around zero can have endpoints near the existing 2^-126 pad,
outside that supported domain. They safely refuse today. Integration must first
outward-widen such bands and reprove, or verify a wider-domain exporter; it must
not clamp actual states. This fixed-basis corpus does not close that issue.

The proof concerns p*cos(t/R)+u*sin(t/R). Rounded trigonometry, occupancy queries
and any later reprojection/normalization require their own argument. No full-frame
cost, editor admission or additional purple-pixel recovery is claimed. Compile,
link and first readback times describe only this small arithmetic program.

Next: audit that curve interpretation, then test actual serialized transfer
enclosures in the separate producer/consumer prototype described in
[REFINEMENT_ENCLOSURE_NEXT.md](../engineering/REFINEMENT_ENCLOSURE_NEXT.md).
Keep the live fallback and existing guards until those checks pass.

## Final verification

`node tools/test.js`: 138/138 suites passed. The focused exact-reference suite
passed 56 checks; the existing spherical-miss suite passed 290 checks.
`node tools/check-queue.js page-check --three-geometry --timeout=150` and the
same command with `--sw --timeout=240` both completed successfully on LeoPC.
RTX 5070 Ti / ANGLE D3D11 and SwiftShader returned identical prototype counts:
517 membership cases, 185 accepted, 89 exact-inside conservatively refused;
eight domain refusals; 514 radius-containment checks across 257 boxes;
73 certified distinct-state acceptances; both unsafe mutations caught; four
invalid-field refusals. These are one-pixel arithmetic checks, not image-quality
or full-frame performance acceptance. The existing connected browser checks also
passed. Production expanded proof GLSL stayed byte-identical.

Machine-readable timings, renderer attribution and before/after shader hashes:
[refinement-enclosure-evidence.json](refinement-enclosure-evidence.json).
