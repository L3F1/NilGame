# Gallery entry refusal diagnosis, 2026-09-12

Base cedfdd2; LeoPC, Windows, Node24.20.0. Production rendering, geometry and
colors unchanged. Test-only census runs before the three-editor flight checks.

Commands: `node tools/check-queue.js page-check --three-geometry` and the same
with `--sw`. Both pass7 browser checks. Packets are regenerated in
.agent-bridge/three-editor-{real,sw}.json: saved document, camera vectors,
resolution/range, counts and up to128 numerical-refusal samples. Samples include
CPU crossing records and a double-precision replay of the spherical ratio guard.
This replay is a candidate explanation, not internal float32 branch tracing.

## Measured result

Entry camera,160x120 center rays, physical range64. RTX5070Ti/ANGLE D3D11 and
SwiftShader agree on counts:

| Result | Rays |
| --- | ---: |
| GPU hit, CPU agrees on region/owner/distance within .001 | 2118 |
| GPU miss, CPU miss | 3924 |
| GPU coverage refusal, CPU domain-exit | 13106 |
| GPU numerical refusal, CPU hit | 18 |
| GPU numerical refusal, CPU miss | 34 |
| Confident GPU hit disagreement or GPU miss losing a CPU hit | 0 |

All52 numerical refusals end in sphere; all have an S3 ball within the current
GLSL ratio guard on the replayed first E3-to-S3 leg. CPU-hit owners are
return-landmark6, north-landmark8, and the two exit marker balls2 each.
This diagnoses the sampled center-ray fringe, not every camera or every
four-sample smoothed pixel. Coverage exits must not be conflated with these52.

Concrete example: pixel(78,31), bottom-up coordinates, CPU hits return-landmark
at physical39.53536140242926 after entering sphere. Ratio replay is
0.999910690730073, inside the guard1 +/-0.00012. The shader's solve() uses
E=.00003 and refuses abs(ratio)>1-4E (until its definite-miss threshold).
CPU resolves this ray, but this alone does not prove float32 can safely do so.

## Next repair contract

Keep the global E unchanged: it also handles root ordering, segment endpoints,
plane events and portal safety. Replace the S3 BALL tangency/root calculation
with a specifically justified coefficient/root error model, preferably a stable
closest-geodesic formulation. Retain half-space behavior unless separately
verified. Account for packed ball centers/cos(radius), carried camera drift,
portal transfer and the reduced shader trig functions. Do not infer a rigorous
error bound from CPU/GPU agreement alone.

Pin both near-tangent hits and misses, true tangencies, inside/on-surface starts,
antipodal/repeated roots, segment horizons and foreground-vs-portal ordering.
Use this census as a baseline: lower refusal counts are useful only with zero
new confident disagreements and preserved genuine ambiguity. Broaden to
multiple poses/resolutions and both GPU backends before admitting a fix.

## Instrument checks and limitations

gallery-census.test.js injects wrong owner, lost hit and wrong distance; each
must throw. Conservative GPU refusal against a CPU hit remains recorded as a
refusal, not counted as a confident answer disagreement. Unknown GPU status
also throws. CPU unresolved versus GPU miss is recorded but not asserted wrong
without establishing why CPU refused. Normals are outside this census; existing
renderer probes cover them. No improvement in visual output is claimed yet.

Full approved-host validation: node tools/test.js,128/128 suites passed;
log .agent-bridge/gallery-census-suite.log.
