# Measurements: one place where the numbers live (MUSE-24)

Every number below was re-produced for this table on 2026-09-10 (or is
marked with the dated run it comes from). "Quoted at" lists live
documents; dated QA logs are evidence, not claims, and are listed
separately rather than per line.

The rule used throughout: a row exists iff the number claims something
about the CURRENT tree that a command (or a grep of a constant) can
re-produce. Dated evidence stays in its dated log. Math constants (eight
Thurston geometries, 4x4 matrices), host identity (GPU model, tool
versions), example inputs (300x200, zoom ranges, viewport sizes as
params), UI readout examples, historical anecdotes and hypotheticals
(the 212 s link, the 160x paste), line-number pointers, archive and
legacy reference, and design targets are not rows — the migration
judges scope statements, and nothing here can re-produce a hypothetical.

## Counts (fresh 2026-09-10 unless marked)

| Quantity | True value | Producing command | Quoted at |
| --- | --- | --- | --- |
| Root suites | 31/31 | node tools/test.js (any; 9 s) | runbook:34 says 23, stale |
| page-check --worlds | 346 | queue page-check --worlds (win32; 32 s) | NEXT_SESSION:13,20; runbook:17,26,43 |
| page-check --ball-lab | 69 | queue page-check --ball-lab (win32; 2 s) | ball-lab.md:239; TODO:89; runbook says 57, stale since carve render |
| page-check --sw --worlds | 346 | queue (172 s, 2026-09-09) | runbook:45 |
| net-check | 9 | queue net-check (7 s, 2026-09-09) | runbook:39 |
| shader-check programs | 11 compile; 10 covered + 1 exception, 64 names | queue shader-check (2026-09-09) / node uniform-coverage.test.js (1 s today) | runbook:40 says 10, true as covered |
| sdf-check | 21 cases, 3072 pts each | queue sdf-check (7 s, 2026-09-09) | runbook:41; ball-lab.md:275 (7.33e-7, log says 7.321e-7) |
| march-check | 0 / 29913 exhausted | node tools/march-check.js (any; 3 s) | runbook:38 (no count); dated logs |
| link-time programs | 9 + 2 ball = 11 input rows | queue link-time (win32; 30 s) | link-time-2026-09.md; runbook:42 |
| ball-conformance cases | 22 | node tools/ball-conformance.js (any; <1 s) | runbook:36 |
| document-invalid | 60 + 4 atomicity | node document-invalid.test.js | invalid/manifest.json (data) |
| boolean.test.js | 14 | node boolean.test.js | muse-log:988 (dated) |
| boolean-corpus | 18 | node boolean-corpus.test.js | carve/manifest.json (data) |
| march-truth | 9 checks | node march-truth.test.js (1 s) | MUSE-25 report (dated) |
| presets | 13 across 8 curvs | node import levels/presets.js | stale-claims:179-180; astra-batch-review:50 |
| render fixtures | 3 views | read render-regressions.json | render-fixture-guide:12-14,18 |
| geometries covered | 8 curvs in presets | node import levels/presets.js | map:22; what-this-is:120; TODO:126 |
| nil.test.js | 47 | node nil.test.js | TODO:257 |
| collision / scene-field / portal | 21 / 26 / 24 | suite files | ball-lab.md:280,292,313,334,359,380 (dated lines, still true) |
| browser-process | 35 passed, 1 skipped (WSL) | node browser-process.test.js (1 s) | muse-log (29/25, dated) |
| Sol/SL2R era totals | 16 suites / 316 checks etc. | none — era claim | TODO:257-262 (superseded: 31 suites, 346 checks, 11 programs) |

## Timings and measured values

| Quantity | True value | Producing command | Quoted at |
| --- | --- | --- | --- |
| Hyperbolic cold link | 10.1 s (2026-09-10; lead 8.5 s median) | queue link-time | map:103,144 (8.4); link-time-2026-09 |
| Editor ball program link | 0.7 s | lead Windows run 2026-09-09 | map:151 |
| ball-lab page cost | 1.8 s for 69 checks | queue page-check --ball-lab | ball-lab.md:238-239; TODO:89 |
| page-check report timeout | 300 s default | grep browser-process.js:15 | runbook:50 |
| play-check default | 3x3000 frames, 10 crossings | queue play-check (win32; 30 s) | crash:108 (shape) |
| Mesh edges / interiors | 6.00e-15 / 0.114% E3, 1.622% H3 at 5120 tris | node tools/mesh-probe.js | TODO:108-111 |
| Carve query ratios | dist 0.21-0.73, rayHit cliff 20-50x (MUSE-23; SUPERSEDED below) | node tools/carve-bench.js | carve-cost-2026-09.md |
| rayCast analytic vs march | 1-3us analytic; march same order except graze 3-5x, 22x one plane-rider; 0 indet either method (the 2 analytic-indet MUSE-35 saw were a bug, fixed) | node tools/raycast-bench.js | raycast-cost-2026-09-10.md |
| S3 walk steps curved/flat, r=0.25 | open 6/6, wall-1.1 6/6, wall-0.6 13/11, wall-0.35 2778/36, doorway 11/11, jamb-hug 44/35, corner common-prefix 26/6 | node s3-walk-cost.test.js | overnight MUSE-38 |
| March tolerances | closer 1e-4, over 1e-9, plain 1e-12 | node march-truth.test.js | march-truth.test.js |
| Godot parity prep | 8444 ms browser vs 721 ms native | one-off parity run (decision record) | 001-runtime-strategy:148; map:144; TODO:180-181 |

## Rows with no producing command

These will rot by construction until something prints them:

- 70 transits in 200 steps (ball-lab.md:165,343) — no tool prints
  transit counts; world-probe has no such output. Needs a
  transit-counting probe mode.
- Lie-lab GPU comparison, 3,072 samples/case, flows 0-4
  (lie-labs.md:44) — no per-case counter like sdf-check's. Needs
  the same shape: print the count with the result.
- Collision substeps at most 0.01 s (lie-labs.md:30) — the constant
  was not located by grep in engine/world, and the audit's pointer
  for the samples (stale-claims:183 → lie-labs.js:6) lands on
  LAB_BOXES, not a count. Needs a source pointer or a test pin
  before either can be a row.
- link-time-inputs columns (11 parsed-source rows) — parsed by a
  scratch analyzer (MUSE-18), never committed. Needs the parser as
  a tool before the columns are re-producible.

## Dated evidence logs (point-in-time by construction, not migrated)

muse-log.md, overnight-results.md, astra-review-2026-09-09.md,
opus-integration-2026-09-09.md, astra-batch-review.md,
muse01-review-history.md, crash-2026-09-09-geom-apply.md,
play-sweep-2026-09.md, ball-editor-checklist.md, controls-review.md,
editor-readiness.md, stale-claims-2026-09.md. Their numbers were true
at their dates and stay there. One-off measurement records
(link-time-2026-09.md, carve-cost-2026-09.md) keep their own
provenance and are referenced, not repeated, above.
