# Rendering contracts for future engine work

An approximate distance sample is not a surface intersection. Keep these
concepts separate when adding primitives or porting the renderer:

1. **Distance bound:** permits safe travel toward a surface; it may underestimate.
2. **Ray intersection:** returns the first positive hit in arclength along a
   geodesic. Analytic primitives should provide this when possible.
3. **Shading sample:** position/normal on the surface, not the point where a
   pixel-footprint threshold happened to stop the marcher.

The dropper's striped ceiling demonstrated why (3) matters: baffle material
was sampled up to 0.22 units from its actual surface. The discontinuous height
texture amplified that stopping error into radial bands. H2R now projects the
shading sample along the normal and carries that normal along the projection.
The flat baffle material uses the stripe colors' mean to avoid a discontinuity
exactly at a constant-altitude surface, where roundoff can select either band.
Fog uses the plane's resolved ray distance on horizontal baffles as well;
otherwise its far fade reproduces the marcher's changing iteration count.

Nil vertical cylinders now implement (2) in
`engine/geometry/nil-cylinder.js`. Their horizontal ray is a circle; a
half-angle substitution gives a quadratic. This avoids subtracting huge circle
radii near horizontal directions. CPU tests check returned hits against the
independent Nil flow; GPU checks compare first-hit distances.

Columns are composited with the marched decorative beacons by nearest hit.
They no longer depend on the 70-unit beacon march range, and Nil has no forced
range fade. The preset disables fog. A 4096-unit numeric guard remains on
analytic column hits; this is not unlimited-precision rendering.

The compact Nil program lives in `engine/geometry/nil-renderer.js`. Combining
the analytic intersection with the legacy full-scene shader triggered an ANGLE
D3D11 compiler error on the first draw, despite successful initial linking.
The separate program avoids that expansion and passes real world-switching
checks. `page-check` captures driver logs; `world-probe` checks GL errors at
uniform uploads and draws so this failure is observable.

`levels/fixtures/render-regressions.json` stores named camera views and explicit
coordinate conventions. Run `node tools/render-fixture.js nil-close-column`,
`nil-horizon`, or `dropper-ceiling` to reproduce them. These are review images,
not an automated image-difference assertion or scene-document v1 levels.

Next engine step: give authored primitives explicit distance/intersection/
normal capabilities, then consume the same scene data in Godot. Avoid forcing
every geometry through a constant-curvature exponential/logarithm interface.

Validation on 2026-09-08: 18 Node suites, nine shader programs, 20 GPU field/math
cases, the quotient marcher check, and 316 cold-cache real-GPU world/input
checks passed. Nil linked in 0.3 s and H2R in 6.2 s on the RTX 5070 Ti / ANGLE
D3D11 test host. Link time is compiler cost, not frame latency. The saved Nil
close-up and dropper ceiling views were also inspected after the fixes.
