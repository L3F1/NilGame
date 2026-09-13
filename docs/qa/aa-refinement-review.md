# Smoothing and portal refinement (2026-09-12)

Base e45aec5. The editor can now use its optional spherical-edge refinement
with Smooth edges. It still starts off. Scope remains eligible additive S3
balls seen through the first stable E3-to-S3 crossing; this is not a repair
for every purple pixel or every geometry.

Each of four quarter-pixel samples has its own atlas tile and sample stamp.
The consumer also checks the exact transferred point, tangent and portal.
Neither a centre-ray certificate nor another sample's certificate can be
borrowed. Ordinary debug/diagnostic views remain centre rays. See
[the contract](../engineering/AA_REFINEMENT.md).

The atlas uses three attachments, 48 bytes per texel, with a nominal 64 MiB
payload cap and device texture/viewport checks. At the menu's 640 x 480 size,
the AA payload is 56.25 MiB; 960 x 720 exceeds the cap. Refusal retains ordinary
AA rendering and explains how to lower resolution. Partial allocation never
records a successful size, so a later smaller request can recover.

## Evidence and scope

RTX 5070 Ti / ANGLE D3D11 and SwiftShader, LeoPC, cold browser profiles:

- At 65 x 49: hardware/software recover 10/11 purple pixels and compare
  921/922 resolved reference pixels.
- At 160 x 120: hardware/software recover 34/46 pixels and compare 5,866/5,878
  resolved reference pixels. All four sample tiles contribute exclusions.
- Resolved colors match an independent renderer at twice the width and height
  to less than one color byte; the acceptance tolerance remains two bytes.
- Remaining numerical uncertainty stays purple. Screen-space domain decoration
  is excluded from color comparison; it is not a claim of empty space. The
  recorded `remainingNumeric` count is not a new refusal caused by refinement.
- Centre/AA transitions and resource refusal/recovery are checked. A deliberate
  mutation mapping upper atlas samples into the lower row fails the resolved
  reference comparison at (32,12) in the 65 x 49 view. Source was restored.

Exact certificate-count equality between independent shader programs is not
an invariant: an exact transfer-identity check can safely refuse in one program
and accept in another. An initial count-equality assertion exposed this, rather
than a wrong hit. Explicit sample stamps, per-sample participation and strict
resolved-image comparisons replace that invalid assertion; no ray epsilon or
image tolerance was increased.

At 320 x 240, with AA and the same gallery pose, 12 total GPU-query samples per
case measured median/worst 1.292/2.195 ms without refinement and 1.922/2.031 ms
with refinement on the RTX 5070 Ti. These include both programs, not just the
exclusion pass, and are not FPS measurements. Draw-plus-finish wall time is
reported separately. Timings drain pending queries before switching cases;
unavailable/disjoint/incomplete results are not silently assigned to a new case.

The independent reference and the numerical evidence are in
[aa-refinement-evidence.json](aa-refinement-evidence.json). Saved
[before](aa-refinement-off.png) and [after](aa-refinement-on.png) images were
inspected (final SwiftShader build): visible fringes shrink, with remaining
magenta retained. Software GPU timing was incomplete (4/12 baseline queries);
the refined timing case was skipped, so there is no software cost comparison.

## Correlated drift capture and normalization stabilization

An integration run caught the previous unrefined resize/timing drift again:
2.594228744506836 to 2.594228982925415 at (6,43). It is preserved in the evidence,
not dismissed as an AA failure or relabeled fixed. The old primary-vector
capture combined components from separate invocations.

The added E3 diagnostic writes primary XYZ and traced distance together to an
RGBA32F target in one invocation (E3 primary W is zero). Eight alternating
refinement-off/on captures in the instrumented hardware run were identical;
their traced distances differ from independent packed-sphere sign-bisection
brackets by 1.06e-8 or less. This is better evidence about those invocations,
not proof that earlier invocations used the same rays. The strict original
resize and settled-pixel guards remain. The instrumented hardware run passed;
the shader was changed for diagnosis, so that pass does not close the drift.

A subsequent replay captured BOTH variants jointly: each distance is accurate
for its own represented ray (independent sign-bracket errors 5.05e-8 and
1.06e-8). The subsequent candidate shares an explicit raw/sqrt(sum-of-squares)
primary normalization between the E3/S3 display and proof programs. H3 keeps
metric normalization; transported directions and all root formulas are unchanged.

That candidate passes the strict hardware/software checks and the same captured
sequence. It is sampled stabilization evidence, not a cross-driver determinism
proof. No tolerance or exact certificate guard was weakened. A stale Node
source assertion was updated to require the new H3 branch explicitly.

There is a measured tradeoff: hardware refinement recovers 34 instead of the
prototype's 46 pixels at160x120; more exact nominal-state matches are refused
safely. Software still recovers46. Do not misreport this as an across-the-board
image improvement. The next bounded proposal is to export the enclosure the
proof actually covered, rather than demand identical nominal states:
[REFINEMENT_ENCLOSURE_NEXT.md](../engineering/REFINEMENT_ENCLOSURE_NEXT.md).
It is NOT implemented; current exact matching remains.

Logs under .agent-bridge/: aa-explicit-normal-real, aa-explicit-normal-sw,
aa-shaders, aa-worlds. Shader compilation passed; world/input checks346/346.
The earlier failed runs, initial prototype figures and joint captures remain
in the evidence JSON. Final acceptance uses its explicitNormalizationReal and
explicitNormalizationSoftware records, not the earlier prototype records.

Final Node suite:137/137 (.agent-bridge/aa-accepted-suite.log). Focused pass
checks290; timing isolation checks34. git diff --check passed.
