# Actual transfer enclosure export (2026-09-12)

Base 25df792. Test-only extension: live rendering, motion, root ordering and
certificate consumption are unchanged.

## Defect and repair

A real-GPU capture at gallery pixel [78,31], yaw 0, gate 0 returned point
[-0.004371242597699165,0,-0.0830536037683487,0.9965354800224304]. Its zero
component had interval endpoints +/-2.350988981904268e-38. The preceding exporter
refused that otherwise valid band because its endpoints were below 2^-100.
The failing browser check is preserved locally in
.agent-bridge/enclosure-transfer-before.log; it failed at actual band export.
An earlier capture harness attempt failed shader compilation because it used a
struct-valued ternary; replacing that with an if fixed the harness, not the
export defect.

The exporter now bit-validates original endpoints as zero or normal binary32
with magnitude at most 2^100. Subnormals, infinities and NaNs refuse. It checks
original order and nominal containment BEFORE any widening. A nonzero endpoint
below 2^-100 widens outward: lower becomes -2^-100, upper becomes +2^-100.
The nominal state is never changed. Nominal state and radius domains remain
zero or magnitudes in [2^-100,2^100].

This preserves the original interval and puts subtraction operands in the
existing domain. Their smallest nonzero difference is at least 2^-123, so the
outward-difference rule does not require subnormal arithmetic. The resulting
symmetric box must still be reproved; original-box exclusions are not reused.
The independent review found no conservatism hole under the stated arithmetic
assumptions. It is not a theorem about every GPU implementation.

## What is measured

app/refinement-transfer-capture.js calls the SAME firstTransferBands GLSL with
packed gallery data and three camera yaws. Each record's nominal and both
endpoints are read from different float attachments written by ONE fragment
invocation. Point and direction records use separate invocations and are NOT
asserted to be a jointly captured ray. Only supported nominal states are sent
to the exporter; unsupported ones are counted as refusals.

The exported radius is compared with every original endpoint using exact
BigInt dyadic arithmetic. This tests actual data encoding and containment, not
transfer truth or live certificates. Existing independent transfer checks still
run in the connected browser suite. The synthetic box oracle and both unsafe
shortcut mutations remain. Invalid input checks include subnormal endpoints,
inverted bounds, and tiny same-sign intervals that do not contain the nominal
zero: widening must not turn them into accepted intervals.

## Remaining admission boundary

connected-shader.js sincos() range-reduces and evaluates polynomials; at() then
multiplies/adds rounded values. sphericalMiss() bounds an ideal sinusoid using
sin^2+cos^2=1. A box around the initial state alone does not bound subsequent
polynomial, range-reduction, position and surface-dot evaluation errors.
This is inherited by the earlier exclusion path, not introduced or resolved by
the widened exporter. The next lead task is a conservative error allowance for
the implemented curve over its supported parameter range, including occupancy
thresholds if promising live classification equivalence. No new consumer is
admitted until that contract is established. Then test serialized producer and
consumer, sample/world association and total frame cost.

No additional purple-pixel recovery or full-frame speedup is claimed here.

## Verification

Both final `page-check --three-geometry` runs passed through the host queue:
RTX 5070 Ti / ANGLE D3D11 and SwiftShader, at the existing suite's fixture
resolutions. The capture itself uses a 1x1 framebuffer and uniforms naming each
gallery pixel. Each backend captured 304 valid bands, refused eight capture
attempts, exported all 304, and exercised 152 tiny-endpoint records. No nominal
states needed the unsupported-state refusal. Three whole-box tiny-width cases
also passed, alongside seven invalid-original-interval refusals. The earlier
517 membership and 257 synthetic-box cases, exact oracles and both unsafe
shortcut mutations remained green. The existing connected renderer/motion
browser checks passed as well.

[Machine-readable evidence](refinement-transfer-enclosure-evidence.json) records
the commands, renderer strings, counters and failing-before witness. Its timing
fields measure only the small exporter program; they exclude transfer capture
and do not represent a complete rendered frame. Production renderer GLSL was
not changed; legacy world/shader sweeps were not repeated for this test-only
extension.

Full Node regression: `node tools/test.js`, 138/138 suites passed on the final
code. Syntax checks and `git diff --check` also passed.
