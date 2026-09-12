# Next adapter: bounded H3

Status: NOT enabled in scene authoring or connected GPU rendering. Explicit
CPU-only compileHyperbolicFramedPortals now supports H3 experimental connections.
Experimental `createHyperbolicSpace` now exists in hyperbolic-space.js, separate
from createMetricSpace. Domain extent <=2R; finite point representation <=4R
from origin and signed per-step travel <=4R. Out-of-envelope queries throw;
these are deliberately narrow numerical policies, not geometric singularities.
The adapter exposes ambientDot for off-tangent frame repair and validated dot
for tangent products. Camera-frame assembly now consumes those operations.
logAt may describe endpoint displacements longer than4R; a single expAt/step
still refuses travel exceeding4R. Round-trip claims must respect query limits.
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
- camera-frame.js has been converted to adapter-owned ambient pairing for drift
  repair and validated metric dot for tangent frame coefficients. Tested H3
  cameras now retain aim, orientation and transported holonomy off origin.
- region-portal.js now uses metric dot for construction/transit frame coefficients.
  The default compiler retains its E3/S3 gate. The named experimental compiler
  adds H3 physical plane height and explicit entering query packets.
- connected-global-model.js now uses the point's metric for reference-up,
  elevation and movement normalization. This preserves current E3/S3 behavior;
  it does not admit H3 worlds.
- region-sight.js now preserves explicit aperture uncertainty through
  aperture-result.js and orders it against nearer solids/gates. region-motion.js
  also preserves uncertainty, time and correction debt. MUSE-69 independently
  audits that consumer boundary. See H3_QUERY_CONTRACT.md.
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
