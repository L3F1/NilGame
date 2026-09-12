# Next adapter: bounded H3

Status: NOT enabled in scene authoring, portals or connected GPU rendering.
Experimental `createHyperbolicSpace` now exists in hyperbolic-space.js, separate
from createMetricSpace. Domain extent <=2R; finite point representation <=4R
from origin and signed per-step travel <=4R. Out-of-envelope queries throw;
these are deliberately narrow numerical policies, not geometric singularities.
The adapter exposes ambientDot for off-tangent frame repair and validated dot
for tangent products. Existing camera code still needs to consume that metric.
The existing arena hyperboloid code is a reference, not connected-runtime support.
Finish the current removal/orientation UI review before adding a visible preset.

## First supported construction

An origin-centred bounded H3 region, metric balls, spawn and finite totally
geodesic portal discs. Keep current explicit physical units and curvature radius.
Do not reinterpret boxes/cells, import a quotient, or add gravity in this slice.
Use the arena convention: upper unit hyperboloid in four components, timelike
last coordinate, Lorentz signature (+,+,+,-); physical tangent speeds scale
position advancement by curvature radius. Author coordinates remain physical
radial coordinates. Region extent is a numerical coverage limit, not a wall.

## Blocking adapter leaks found in current code

- metric-space.js admits only E3/S3. Add a separately tested H3 adapter using
  the established geometry(-1) mathematics where its units/conditioning fit.
- camera-frame.js uses ambient Euclidean projection, including off-tangent
  repair. Expose an adapter-owned ambient pairing/tangent-repair operation;
  do not bypass validated tangent dot with a mislabeled Euclidean fallback.
- region-portal.js uses raw dot for construction coefficients, plane height,
  and ray roots; every non-E3 root formerly took the S3 branch. It now explicitly
  refuses unsupported kinds. Frame coefficients need metric dot; plane height
  and first entering root need geometry-owned implementations with range limits.
- connected-global-model.js uses raw dot for reference-up coefficients and
  elevation. Move these to the point's metric; norm(raw) must also be intrinsic.
- scene fields, query normals, GPU packing/shaders and finite-domain crossing
  need explicit H3 capabilities. Search all flat-versus-curved branches before
  extending schema acceptance. Do not make unknown kinds inherit S3 behavior.

## Ordered implementation and acceptance

1. Host-free H3 metric adapter: point/tangent validation, encode/decode,
   physical distance, exp/log, stepWithTransport, frame and numerical-domain
   exit. Pin independent radial/perpendicular identities, round trips,
   transport norm/dot preservation, large-radius flat limit, and range refusal.
   Choose finite numerical limits from measured residuals; do not copy S3 limits.
2. Remove ambient-metric assumptions from camera and portal frame assembly,
   retaining E3/S3 parity. Add H3 ball distance/ray and disc entering queries.
   Distinguish bounded miss from unresolved numerical/range failure. Domain
   events still compete with portal events on the same actual movement leg.
3. Scene-v2 region support and a saved E3/H3/E3 centre route, including reverse
   crossing, carried camera, collision, blocked exits, editing and JSON history.
4. GPU H3 dispatch with explicit numerical envelope and CPU comparisons,
   real/software backend images and representative frame-time distributions.
   Only then expose the preset. Generic shaders must refuse unsupported kinds.

No engine migration is required. Nil/Sol remain later: their numerical geodesic
and solid-query contracts are a different task from constant-curvature H3.
