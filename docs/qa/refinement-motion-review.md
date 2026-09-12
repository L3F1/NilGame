# Connected-flight refinement check (2026-09-12)

Base6db576e. New browser-only app/refinement-motion-probe.js generates494
poses with actual motion and transported cameras along E3/S3/H3/S3/E3, then
replays87 timed poses at320x240 with AA off. Correctness samples25920 pixels
at48x36, preserving exact settled packet/distance equality and checking any
newly resolved answers against CPU queries. No shaders or motion code changed.

Initial hardware run passed: RTX5070Ti / ANGLE D3D11 GPU p95 .255424ms off,
.276256ms on (87 each). Only4 enabled poses generated the pass;83 skipped it
in S3/H3. This is mostly a region-transition check, not adequate E3-active cost
evidence. No moving-view recoveries at the sampled resolution. GPU costs exclude
readback and20ms pacing and are not FPS.

Final SwiftShader correctness passed25920 pixels. Its timers were incomplete
in BOTH arms at pose6: expected2 results, got1. No software distribution is
reported. Single-query retirement and a discarded warming trial did not resolve
this. The probe explicitly records incomplete timing and proceeds with independent
correctness checks. This is NOT a performance pass or grounds for default enable.
The initial harness also failed cloning geometry functions; capture now copies
only renderer pose fields. These failures are harness/measurement evidence, not
new geometry defects.

## Important failure in the final hardware run

The EXISTING unrefined resize guard failed BEFORE the motion probe executed:
2.594223976135254 ->2.594233274459839 at(6,43). Both reads requested refinement
OFF. Shader/world hashes match the prior passing captures. The first repeated
off primary-ray read also differs; subsequent on/off reads return to the old
values. All debug8 omission counts are zero and on candidate texels are zero.
This narrows the problem to baseline draw stability; it does not establish a
driver cause or rule out effects of earlier pass use in the full page sequence.
Separate debug draws cannot identify arithmetic in the exact failing invocation.

The two captured directions have Euclidean lengths .9999999757713309 and
1.0000000610904465. connected-shader.js unitize calls GLSL normalize; the E3
ball quadratic assumes unit length. An illustrative double-precision calculation
for the authored marker gives an8.71e-6 root difference with a=1 and1.98e-7
with a=dot(u,u). This suggests sensitivity worth investigating, not a proven
GPU repair: authored doubles are not packed float32 operation sequences.

Durable data: [motion evidence](refinement-motion-evidence.json) and
[baseline failure](distance-drift-baseline-failure.json). Local logs use prefix
.agent-bridge/refinement-motion-: real2 (initial pass), sw-final (correctness
pass/timing incomplete), real-final (baseline FAILURE). Final hardware motion
acceptance remains outstanding. No equality guard was weakened.

Next: isolate primary normalization and E3 quadratic sensitivity at this exact
ray using the packed coefficients. Do not repeat whole-scene timing until a
small reproducer or a justified numerical contract change is ready. Keep the
refinement opt-in, and retain all strict failures.

Node regression validation:136/136 suites passed (LeoPC), log
.agent-bridge/refinement-motion-suite.log. git diff --check passed.
