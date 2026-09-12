# Small spherical exclusion program, 2026-09-12

Base f2a3ef2, LeoPC/Node24.20.0. Test-only; live renderer unchanged.

## Result and implementation

Moving the interval calculation out of the connected shader into a separate
small program succeeds on the saved gallery samples. This answers the immediate
compilation experiment; it does not establish full-frame performance.

`app/spherical-miss-experiment-glsl.js` contains the isolated interval helper.
`app/spherical-miss-experiment.js` supplies the existing packed world, camera,
selected test portal and candidate ball to a one-pixel draw. It encloses primary
ray arithmetic and the first small-angle E3/S3 transfer, checks nominal output
containment and tests amplitude.upper < positiveConstant.lower. No roots or
ordering are replaced. The production connected shader imports neither file.
Only the three-geometry browser acceptance branch invokes the experiment.

Packing detail discovered during extraction: the connected S3 ball row stores
NEGATIVE centre and NEGATIVE cos(radius/R). Both signs must be reversed for the
positive-constant exclusion equation. The rejected prior candidate did not do
this, so its positive-constant guard would have declined these balls even if it
had completed. There is no claim that the timed-out candidate resolved pixels.

Reference classification reconstructs the primary ray in CPU double precision,
intersects the nominated source plane and transports through the compiled gate;
then compares spherical amplitude with cos(radius/R). This is a sampled analytic
reference, not an independent proof of every transfer implementation. MUSE-75
provides complementary input-perturbation evidence. Out-of-aperture cases must
refuse; the nominated gate is not certified against the rest of the scene.

## Checks and measured scope

Commands, sequential through the host queue:

- `node tools/check-queue.js page-check --three-geometry --sw --timeout=60`
- `node tools/check-queue.js page-check --three-geometry --timeout=60`

Both pass the existing9 browser checks and this experiment. Original52 candidate
rays:52 bounded,34 excluded,18 root candidates retained. Expanded corpus uses
those pixel/ball pairs in3 camera orientations (yaw0,+/-.025):156 cases,
152 bounded,94 excluded,58 root candidates retained,4 outside-aperture refusals.
There are no sampled false exclusions. A forced-exclusion uniform mutation
incorrectly excludes a root candidate and is caught on each backend.

The expanded cold runs measured:

| Backend | Fragment compile | Link | First draw + read | Whole experiment |
| --- | ---: | ---: | ---: | ---: |
| RTX5070Ti / ANGLE D3D11 | 2.2ms | 4242.9ms | 1.6ms | 4313.4ms |
| SwiftShader / Vulkan | 2.3ms | 0.2ms | 4634.4ms | 4691.4ms |

These are wall times at synchronous API boundaries, not GPU timer queries.
Work deferred by the driver can appear in link or first read. Each test draw is
ONE pixel; the reference camera viewport is160x120. These are not frame rates
or evidence that a full-screen pass is cheap. Existing gallery census still
reports52 live numerical refusals and0 confident answer disagreements.

Local logs: .agent-bridge/miss-small-{sw,real,views-sw,views-real,suite}.log.
The first expanded harness rejected a view that left the aperture; corrected
by retaining those cases as required refusals rather than discarding them.

## Next integration gate

Measure full-frame work and bounded traversal through a separate pass before
adding it to interactive play. Bind every result to exact directed portal and
packed object indices, world revision, pose, viewport and sample offset. Only
the same eligible FIRST E3/S3 crossing may consume it. Recompute on edits,
resize and camera movement; never reuse a centre ray's result for AA offsets.
Invalid/out-of-scope results retain current behavior. The18 original hit-side
fringes still need root intervals and interval-aware event ordering.

Numerical limits: outward binary32 operations plus minimum-normal padding are
an execution model. Sample agreement does not certify every backend's sqrt,
normalization, reassociation or FTZ semantics. Keep that distinction explicit;
no universal safety or complete-scene visibility theorem is claimed.

Full approved-host `node tools/test.js`:134/134 passed. Final software rerun
also passed after adding a nonzero-exclusion requirement (miss-small-final-sw.log).
