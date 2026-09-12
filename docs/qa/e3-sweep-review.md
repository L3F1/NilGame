# Active E3 refinement sweep (2026-09-12)

Base b1ac7d0. Added24 yaw increments through +/-0.18 radians at the actual E3
spawn, returning to the initial heading before the existing E3/S3/H3/S3/E3
flight. This is camera rotation at a fixed spawn followed by transported flight,
not a new lateral-motion corpus. All25 sweep poses are timed. Seven sweep poses
(including repeated headings on the return arc) are checked at160x120; route
samples remain48x36.

The test requires generated refinement for each checked E3 pose and at least
one newly resolved pixel overall. Every newly resolved answer is checked against
the CPU query. All previously settled status/region/owner/distance values must
remain identical. New E3-only timing distributions prevent the83 skipped S3/H3
poses from hiding the active pass cost. No shader or runtime behavior changed.

## Results

Commands: node tools/check-queue.js page-check --three-geometry --timeout=90,
then the same with --sw --timeout=180. Both passed. Logs:
.agent-bridge/e3-sweep-real.log and e3-sweep-sw.log.

On LeoPC, RTX5070Ti / ANGLE D3D11, all111 timings per arm were collected.
The25 E3 sweep GPU samples had p50/p95 .078304/.087008ms off and
.221120/.247200ms on at320x240, AA off. These are GPU draw costs, not FPS
or end-to-end latency, and are not compared against prior sessions' clocks.

Each backend checked158592 pixels, including134400 in the E3 sweep.
Hardware recovered170 uncertain pixel observations; SwiftShader recovered198.
These are observations across seven poses (some repeat headings), not unique
world features. Every recovery passed CPU comparison, and no settled result
changed. Backend refusal/recovery counts need not match; confident wrong answers
are still forbidden.

SwiftShader timing failed to collect the second query in both arms. Timing
status is INCOMPLETE and all distributions are null. This is no performance
acceptance for software rendering. Do not restart that diagnosis based only on
this unchanged symptom.

Full pose/counter/timing evidence: [e3-sweep-evidence.json](e3-sweep-evidence.json).
No screenshot change claimed; this task extends numerical and cost coverage.
The earlier primary-ray variation remains open despite these passing samples.

## Next bounded task

Make refinement compatible with anti-aliasing through per-sample certificates.
First specify the sample identity and compare against separate supersampled
reference rays; centre-pixel certificates must NEVER be reused for other AA
samples. Prototype the smallest separate-pass path and measure before broad
integration. Preserve current AA refusal until that path passes both backends.
Keep refinement default-off; high-resolution and broader translation/edit
coverage remain admission gates. No new geometry or host migration yet.

Validation:136/136 Node suites passed on LeoPC (log
.agent-bridge/e3-sweep-suite.log); git diff --check passed.
