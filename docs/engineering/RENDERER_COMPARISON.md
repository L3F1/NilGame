# Why the old worlds look cleaner

Code review2026-09-12, base26c0a43. No fresh visual/performance comparison claimed.

There are two useful older references, with different tradeoffs:

- Arena/spherical-flight path: shader.js + s3.js + main.js. Geometry-specific
  compilation (#define GEOM) removes unused branches. The marcher accepts a
  surface within a distance/pixel-footprint threshold (HIT_EPS=.0015, footprint
  caps in its hit loop), then shades with lighting/AO/fog. It does not display
  the connected query system's explicit unresolved status. A clean silhouette
  does not demonstrate identical first-hit or portal-order accuracy.
- Standalone spherical-cover-renderer.js: analytic balls over a full S3 orbit,
  no cross-geometry portals or CSG. packSphericalCamera projects ball centers
  into a camera basis and precomputes (a-c)*(a+c) in CPU double precision before
  upload. This avoids subtracting separately rounded nearly equal GPU squares.
  It still has tangency/tie refusal bands and can draw magenta. Do not claim
  that all older renderers silently guess or that analytic S3 is itself broken.

The connected shader selects among objects, cuts, chart boundaries and portals,
then maps a ray into another region and repeats. The portal exit point depends
on the pixel, so a single per-frame camera-origin precomputation cannot simply
be pasted in for all outgoing rays. That extra difficulty is real. It does not
require a giant shader, broad fixed guards, weak materials or ugly graphics.

The current connected shader uses a broad spherical ratio guard near tangency.
Some ordinary grazing rays are classified unresolved and shown purple. Saved
entry-census evidence found52 such candidates, with CPU reference18 hits/34
misses. Those are implementation limitations, not exotic spherical optics.
Recent inline interval candidates also exceeded report timeouts; no evidence
identifies compile vs link vs first draw yet. See spherical-miss-attempt.md.

Direction: preserve region/portal event semantics, reuse specialized metric and
shading functions, test small GPU programs, and evaluate CPU precomputation or
separate precision passes where inputs permit. The old marcher is a legitimate
candidate for region-local rendering if hit intervals, clipping and uncertainty
are made compatible with portal ordering. Analytic queries are useful, not an
obligation that every visible surface must use the same huge program.

Ray marching vs analytic ray intersections is the relevant distinction here.
This is not a migration to stochastic path tracing. Polished lighting can be
shared independently, but adding AO does not resolve a ray-ordering ambiguity.

Before more elaborate math infrastructure, require a working small-program
experiment and a visible gain in the saved gallery, measured at stated hardware,
resolution and uncertainty policy. Keep diagnostics until their cause is fixed.
