# Work-loop review and raster cost decision - 2026-09-12

Review at6467884. Recent10 commits built/rooted/refined precision components,
reviewed sources and tested two execution structures while the saved gallery
still had52 numerical refusals. The math tests have value, but treating each
helper as a milestone delayed a working integration and its cost check.

## Changes to working method

One active deliverable: visible fringe reduction with correct portal ordering.
Run the smallest executable GPU path before broadening its supporting machinery.
Use focused checks while developing, full suite at integration; no test removal.
Keep detailed evidence in reports and only current decisions in NEXT_SESSION
(shortened to the active task and relevant links). Do not redispatch quota-blocked agents or assign
busywork merely to keep another model active. No claim of measured token savings.

Completed research/source review remains useful and specifically requested.
Avoid more review documents for already-settled points. This report replaces
repeated discussion of the same measurement gap; next work should integrate or
reject the scoped pass, not add another isolated precision API.

## Work completed this turn

Extended the existing TEST-ONLY exclusion program to use actual fragment
coordinates across160x120 and320x240 rasters. At160x120,12 saved candidate
samples agree byte-for-byte with the one-pixel path. Existing156 classification
cases and forced-exclusion negative witness still pass. Production unchanged.

For each resolution, one warmup,12 timed draws, separate GPU timer queries and
wall time spent in draw/finish API calls. No result if timer unavailable or
disjoint; bounded wait for query availability. This is ONE directed portal/ball
pass, at the entry pose, centre samples, not an end-to-end gameplay benchmark.

Host LeoPC, Node24.20.0. Sequential queue commands:
`page-check --three-geometry --timeout=60` and the same with `--sw`.
Both passed9 browser checks plus the expanded experiment.

| Backend | Resolution | GPU p50 ms | GPU p95 ms | Samples |
| --- | --- | ---: | ---: | ---: |
| RTX5070Ti / ANGLE D3D11 | 160x120 | .012000 | .013088 | 12 |
| RTX5070Ti / ANGLE D3D11 | 320x240 | .022496 | .022848 | 12 |
| SwiftShader / Vulkan | 160x120 | 9.9495 | 11.0886 | 12 |
| SwiftShader / Vulkan | 320x240 | 44.8174 | 45.9332 | 12 |

Draw/finish call p50 rounded to0ms even on the slow backend: NOT completion
latency. The output names this drawFinishCallMs. GPU times were measured and
not disjoint. With12 samples, reported p95 equals the maximum; no population
latency claim. Local logs: .agent-bridge/miss-raster-{real,sw}.log (earlier key
wallMs there denotes those API-call times, not total GPU execution).

Decision: integrate only as a scoped, cost-aware path. The measured hardware
case warrants a full integration trial. Do NOT default to a per-object
full-screen interval pass on software rendering. Sharing transfer work across
objects may help, but do not claim or assume that speedup. Evaluate actual total
cost with all required passes and AA before defaults change.

Acceptance remains fewer false refusals in the saved image, no sampled wrong
hit/miss/portal ordering, correct edit/camera/resize/sample invalidation, and
measured total frame cost. No new standalone mathematical framework first.

Validation: full approved-host `node tools/test.js`134/134 passed once for this
integration batch (.agent-bridge/miss-raster-suite.log). Runtime shader unchanged.
