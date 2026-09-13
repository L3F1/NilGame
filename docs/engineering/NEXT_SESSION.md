# Astra handoff - connected renderer

Read WORKING_RULES.md; select references through TASK_ROUTER.md. One active
outcome: visibly reduce false purple fringes in the E3/full-S3/H3 editor without
wrong intersections. No new geometry or precision helper milestone meanwhile.

## Next implementation

Hit-side decision: read the final section of SPHERICAL_ROOT_PRECISION.md, then
docs/qa/spherical-hit-band-review.md. The CPU feasibility gate is now PASSED:
at the recorded gallery pose all 14 guard-tripping traced hits get a definite
ordered entry naming the traced owner and bracketing the traced root (band
0.0029-0.0066), all 18 traced misses certify as misses, and every leg start is
certified outside. Headroom is thin: the narrowest pixels tolerate only about a
2x wider transfer box before the first event stops being provably first.

The float32 half is now measured too, and it splits. Binary32 coefficients cost
almost nothing: same 14 entries and 18 misses, bands at most 1.129x wider. The
envelope's atan/acos carry the whole risk - a GLSL port must be accurate to
better than 2^-10 rad absolute to keep every pixel, 2^-8 to keep all but two,
which is the same order as the minimum commonly quoted for those built-ins.

That accuracy is now measured, not assumed. node tools/page-check.js
--transcendental [--sw] evaluates both built-ins over 1615 binary32 samples
against a binary64 oracle: hardware max atan 1.147e-5 / acos 6.755e-5 rad,
SwiftShader 2.533e-7 / 6.755e-5, nothing lost, both clearing 2^-10 by 14.5x and
by three orders at the coefficients the guarded pixels produce. Treat the pair
as ONE ANGLE data point: the worst acos value is identical on both.

The shading question is measured too. Enclosing the normal over the band AND
the transfer box pins it to 2.11 degrees worst case - 9.4 of 255 colour steps,
4 to 6 typically - and the ROOT BAND causes essentially all of it: the transfer
box contributes 80x less, so tightening the transfer buys nothing here. About a
third of that is enclosure slack; the two band-end normals are 0.0086 apart
where the enclosure says 0.0292.

Next: the LEAD decides the envelope route, since both are now open, and whether
a normal pinned to about two degrees is enough to call a pixel decided. Using
atan/acos is viable but must carry an admitted allowance constant (measured
worst 6.8e-5 leaves room around 2^-12) as a conditional binary32 contract like
SPHERICAL_CURVE_ERROR.md; no constant is baked in by this work. The alternative
needs no admission: certified sign brackets on the curve value, reusing the
shared-sincos contract, so neither built-in appears in the proof. After that,
the audit docs/qa/claude-s3-hit-contract-audit.md still lists the portal/edge
band, shading tolerance and FMA/backend model. Do not promote a band midpoint
to a root and do not recolour.


Current readiness: see docs/qa/enclosure-interactive-review.md. Hardware480x360 AA cost is measured and screenshots inspected; purple hit-side fringes remain. Stop expanding the miss-only acceptance corpus. Optional candidate exposure is now implemented; see docs/qa/enclosure-ui-review.md. Next delivery: fix remaining hit-side artifacts. Software performance remains qualified by actual timing status.


AA refinement integration and a correlated E3 diagnostic landed in this batch.
Read docs/qa/aa-refinement-review.md and AA_REFINEMENT.md, not the full history.
The editor can combine Smooth edges with optional spherical refinement up to
its device/64 MiB payload limit (640x480 fits;960x720 refuses). Default is OFF.
It still only covers eligible additive S3 balls after a first E3-to-S3 transfer.
At160x120 AA,34/46 purple pixels recovered on hardware/software; numerical
samples stay purple. Total hardware AA GPU median at320x240:1.292ms baseline,
1.922ms refined (12 samples), not FPS. See JSON for full attribution.

IMPORTANT: an earlier integration run again failed the strict UNREFINED
resize baseline at pixel6,43 (2.5942287445 ->2.5942289829). Preserved in the
new evidence JSON. Do not call the drift fixed because the instrumented run
passed. The joint replay then captured both input variants. readE3RayDistance captures
primary XYZ and distance from one debug11 invocation; old readPrimaryRays
combines four independent invocations. Joint captures are additional draws,
not a reconstruction of preceding debug2. E3 primary W is zero.

Shared explicit raw/sqrt(sum-of-squares) primary normalization now passes the
captured sequence on both backends. H3 and transported directions are unchanged.
This is sampled stabilization, NOT a cross-driver determinism proof. Hardware
loses12 prototype recoveries to safe exact-identity refusals; report that honestly.

Standalone enclosure arithmetic now passes 138/138 Node suites and both GPU
backends. Read docs/qa/refinement-enclosure-review.md and its small evidence JSON.
It catches rounded-subtraction and unreproved-box mutations; a real subnormal
false acceptance was repaired with bitwise domain classification. Live rendering
is unchanged; production proof GLSL extraction is byte-identical.

Actual gallery GPU transfer bands now exercise the exporter: tiny NORMAL
endpoints widen outward AFTER original order/containment validation; states
remain unchanged and subnormal endpoints refuse. See
docs/qa/refinement-transfer-enclosure-review.md for current evidence. Captured
point/direction records are independent single-invocation bands, not joint rays.

The conditional curve-error contract and prototype predicate are now implemented:
read SPHERICAL_CURVE_ERROR.md and docs/qa/spherical-curve-error-review.md.
Exact rational budgets and exact GPU integer comparisons replace the zero-error
assumption. One shared sincos pair avoids needing phase accuracy for a global
amplitude bound. State/centre component magnitudes <=2 and angle upper bound<=64
are required. Computed exterior may refine UNKNOWN; preserving old occupancy E
classification is a separate stronger promise, not required here.

Serialized producer/consumer candidate is implemented behind constructor option
enclosureRefinement:true, with a unique tag, fourth radii texture, outward
angle bound and shared-pair at(). Read docs/qa/enclosure-integration-review.md
and its evidence. Default renderer/UI unchanged. Candidate images now show real
fringe recovery; initial hardware160x120 recovered30 with zero settled changes.

Payload rejection and independent AA comparison now pass on hardware/software:
read docs/qa/enclosure-acceptance-review.md. Six deliberately corrupt payloads
fall back identically;45 sampled H3 expiry witnesses;34 AA pixels recovered
at160x120. Claude wrote the shared-checker wrapper (8 turns/4469 output tokens),
lead integrated and tested it. Do not redispatch claude-enclosure-aa-acceptance.
Software AA timings are INCOMPLETE; the refined case was skipped after baseline
queries did not drain. Do not report the partial sample as full performance.

Short local motion poses now have strict packet coverage; read docs/qa/enclosure-motion-review.md. Edit/undo/redo/load revision coverage now lives in app/enclosure-edit-probe.js; read docs/qa/enclosure-edit-review.md. Next: startup/interactive-resolution review, not another isolated math helper.
Keep current strict packet guards. Follow
REFINEMENT_ENCLOSURE_NEXT.md for memory/association and measure intended-resolution
cost and startup before UI exposure. Current fallback within the candidate uses
shared-pair at(); default-source parity is checked separately.
If the stricter predicate plus extra storage fails to improve the actual image,
retain default-off refinement and move to hit-side root intervals; do not spend
another turn fitting a tolerance to recover a historical pixel count.
Keep exact matching until those checks pass.
Then address remaining hit-side fringes. Do not blindly chase identical floats,
embed interval arithmetic in the main shader, or weaken settled-pixel guards.

Internal helper reviewed atlas ownership, timer isolation and joint capture.
No external agents running. claude-s3-hit-contract-audit was delivered, harvested
and landed as docs/qa/claude-s3-hit-contract-audit.md; do not redispatch it. The
bridge task file now holds no open assignment.
Muse is unavailable until its reported Sept14 UTC reset.

Bind outputs to exact portal/object, packed world revision, pose, viewport and
AA sample. Consume only at the matching eligible first crossing. Regenerate on
edits/motion/resize; invalid/unaffordable cases retain the existing query policy.
S3 packed ball rows are -centre/-cos(radius/R); reverse BOTH signs for exclusion.
Keep original hit/root ordering; this miss-only path targets34 sampled false
alarms. The18 hit-side fringes need root intervals later, not midpoint guesses.

## Reading only when needed

- Exclusion evidence/limits: docs/qa/spherical-miss-small-program.md.
- Contracts: PORTAL_TRANSFER_PRECISION.md; SPHERICAL_ROOT_PRECISION.md.
- Stable transfer already live: docs/qa/live-transfer-review.md.
- Existing code reuse: RENDERER_COMPARISON.md. Shader specialization and CPU
  packing are useful; no requirement that all surfaces use one analytic shader.
- Other safeguards: SUBSYSTEM_RULES.md relevant heading; REGION_MOTION_CONTRACT.md
  for motion. Do not alter movement while changing this rendering path.

## Coordination

Muse76 returned429 with no delivery, reset advertised2026-09-14T00:00Z; no retry
until available. Claude's `claude-live-miss-pass` at94f0a44 is delivered and
reviewed; do not redispatch that manifest. Bridge now uses auto-compaction100k,
medium effort and usage reporting. Give smaller implementation slices; the last
batch took80 turns/75k output tokens. No agent is currently assigned more work.
Run without automatic review to save tokens. Accepted72-75 are
in docs/qa/muse-log.md; do not reread them routinely. MUSE72 code-license gates
are in docs/research/geometry-implementation-sources.md before external reuse.
Run host-probe once; use current queue verdict. Never assume an old worker PID.

Preserve numerical refusals until resolved. Global S3 and a bounded S3 chart
are coverage policies, not different geometries. Existing body/portal transport,
correction-debt semantics and save/load are not part of this rendering change.
