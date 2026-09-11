# Connected-query cost and ownership review

Base 320d92e plus this commit's benchmark/test changes. Production kernel unchanged.
Windows LeoPC, AMD Ryzen 7 9800X3D (16 logical CPUs), Node 24.20.0.

MUSE-55 accepted after local review corrections: rename per-pose cold samples to
first-for-pose, distinguish warmed later poses, remove unsupported GC attribution,
reject inherited option names/non-option arguments, record CPU compile wall time.
Muse's WSL results remain attributed separately in muse55-connected-cost.md.

Host command: `node tools/connected-sight-bench.js --out
.agent-bridge/connected-cost-host.json`. 96x72 rays, vertical FOV 70, range 32,
work cap 2048, 2 warmups and 9 measured repeats per pose, plus first-for-pose
samples. Counts/work match across repeats; this is not per-ray answer equivalence.

| Pose | Wall ms min/median/p90/max | Query-only ms min/median/p90/max |
| --- | --- | --- |
| Entry | 42.60/47.53/52.91/56.04 | 36.34/41.07/45.86/49.18 |
| Doorway | 144.70/147.19/152.39/161.72 | 134.35/137.17/142.14/151.33 |
| Far | 27.33/28.91/33.16/33.99 | 21.40/22.23/23.79/26.93 |

At-budget count is zero for all three poses. Unresolved counts are 2771, 1250,
3417 respectively, all domain-exit. CPU sampling includes diagnostic bookkeeping;
query-only instrumentation also has overhead. Neither measure is GPU frame time.
Do not infer a new render budget or a universal scene guarantee from these views.

Decision: retain on-demand CPU preview as the browser reference. Increasing
maxWork cannot resolve these chart exits and does not address measured latency.
Next GPU work must establish float-precision refusal rules and measure actual
frame-time distributions; do not mechanically copy JS-double guards. Broader
authored-face pose coverage remains open before promotion.

New ownership regression adds 36 combinations: three curvature radii (.5, 8,
10000), two additive orders and six additive/global/scoped modifier cases.
Expected ball intersections use radial center-distance minus radius, independent
of the Boolean event implementation. Distance, surface/additive owners and normal
orientation are asserted. Focused spherical classifier: 24/24.

Isolated mutation globalizing every group's modifiers fails this new check and
the older scoped-cutter check (22/24, exit 1); main engine files were untouched
and scratch removed. CLI argument refusal probes: 4/4. Full-suite outcome is
recorded below after completion.

Final host regression: `node tools/test.js`, 80/80 suites passed, exit 0.
Single CPU scene compile measured 3.49 ms, excluded from per-pose sample timings;
this does not measure GPU compilation or an OS-cold compile distribution.

Deployment correction: the previous four local commits were pushed to main.
Public Pages returned HTTP 200 for both tools/connected-preview.html and
app/menu.js, with the preview title and menu link present, on 2026-09-11.
