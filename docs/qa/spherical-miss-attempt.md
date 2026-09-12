# Scoped spherical miss attempt, 2026-09-12

Base d9679fb, LeoPC/Node24.20.0, queued cold SwiftShader. NOT integrated.

## Intended change

Avoid the root-ordering gap for definite misses only. Enclose E3 primary rays,
first stable E3/S3 transfer and spherical coefficients with binary32 interval
operations. If sqrt(a*a+b*b).upper < c.lower and c.lower>0, there is no root in
any period. This can discard a false tangency candidate without inventing a
hit or collapsing an event interval. Preserve every existing path otherwise.

Scope was first E3 -> full S3 crossing, small-angle stable transfer, with
actual nominal output contained in the computed bands. Reset provenance on
later crossings. Guard aperture and division intervals. No globalE change.

## Observed failure

The candidate embedded vector interval helpers in the shared tracing shader.
`page-check --three-geometry --sw`: no report within300s (exit1,300.3s).
Moving bound construction from the per-surface query to the traversal loop
also failed `--timeout=60` (exit1,60.3s). Neither run produced answer or frame
measurements. These are NO-REPORT results, not a measured compiler-only time;
we lack stage instrumentation to separate compile/link/first-draw stalls.

Restored the exact HEAD shader and removed the candidate module. The same
cold software gallery check passed9 checks in about3s. No live behavior change,
no corrected purple pixels claimed. Historical52 numerical refusals remain.
Local evidence: .agent-bridge/spherical-miss-{sw,hoisted-sw,restored-sw}.log.
Rejected sources retained locally as spherical-miss-hoisted-{shader,helper}.js
under .agent-bridge; they are not dependencies or supported implementations.

## Next decision

Do not embed full interval arithmetic in the large tracing program again
without a small-program experiment. Test an isolated precision pass, consuming
identical packed world/camera data and returning exclusion certificates keyed
to the exact first directed portal and object. Only a matching eligible first
crossing may consume one; edits, camera changes, resize and AA sample offsets
must invalidate/recompute it. Never reuse a centre certificate for AA offsets.

First establish a stage-labelled cold compile/draw probe and measure a tiny
standalone program. Then decide whether a separate pass has tolerable per-frame
cost or a smaller derived forward-error implementation is needed. Source
interval arithmetic still needs backend validation; a candidate compiling is
not a precision proof. The original18 potential-hit fringes still require
root bands plus interval-aware ordering.

Final integration validation: `node tools/test.js`134/134 passed on the approved
host (.agent-bridge/muse75-integration-suite.log), including accepted MUSE-75.
