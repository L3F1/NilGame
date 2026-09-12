# Next visible milestone: one E3/S3/H3 editor

User direction, 2026-09-11: deliver and polish a simple editor with working
portals among E3, S3 and H3 before adding more geometries. Infrastructure work
must end in a playable capability, then take feedback back into the kernel.
Keep the browser host and current dependencies for this milestone.

Acceptance: one saved world contains all three region kinds; author can place,
resize and remove supported balls, connect/edit supported portal anchors,
undo/redo, save/reload and walk or fly the whole route without resetting on
ordinary contact. Camera, collision and image agree on region ownership.
Unsupported edits preserve the prior world and explain the limitation.
Use clearly distinct landmarks/scale cues and show the current geometry.
Do not call a bounded S3 patch a complete spherical universe; preserve the
existing complete-S3 runtime where its capabilities are available.

## Immediate GPU implementation contract

Extend existing connected-shader/renderer, not another unrelated render host.
Preserve default E3/S3 behavior. Add explicit experimental H3 opt-in through
packing/renderer options; default renderData and GPU entry must still refuse H3.
CPU geometry/schema/queries must not be weakened to make GPU comparisons pass.

Initial H3 trial envelope: R=8, extent<=12, additive balls with physical radius
.25..1, disc apertures .35..1; current total capacity caps remain. Reject outside
this envelope before touching live GL state. This is a starting experiment, not
an established float32 accuracy bound. Broaden only with measurements. E3/S3
retain their existing envelopes. General materials/AO for H3 follow diagnostics.

Add explicit geometry dispatch for point/tangent pairing, advancement, domain
boundary, transport, sphere intersection/normal, and aperture entry/transit.
Use the existing CPU H3 adapter/query implementations as contracts and existing
renderer machinery for loops, packets, limits and diagnostics. No H3-as-S3 else
branch. Share a geometry-level GLSL block where useful; don't introduce a new
framework or hypothetical universal shader plugin system.

Match CPU physical arclength and portal mapping; no player exit offset for rays.
Foreground field queries must prevent remote portal ambiguity from hiding a
nearer solid, while genuine ties and uncertain starts still refuse. Domain exit
must stay distinguishable from numeric uncertainty. Preserve global work and
crossing budgets. Float32 guard bands must be stated, tested, and may be narrower
in admitted scenes or more conservative in answers than double precision.

Deliver a browser probe using the same runtime GLSL and camera path: single H3
ball, non-axis camera, E3/H3/E3 forward/return, near solid vs remote gate and
refusal views. Report status/region/owner/distance/normal comparisons with saved
CPU reference packets. Inspect images, use real GPU and SwiftShader sequentially
through the host queue, and measure frame distributions independently of Node
query time. No shader admission based only on compile success. If browser access
is blocked in an agent checkout, provide the harness and report the block; lead
runs it on the queue before integration.

Next slice after GPU parity: wire this path into one existing editor host and
add the three-region preset. No fourth geometry before that visible acceptance.

## Extension architecture and future research

Keep metric operations, global topology/chart transitions, primitive construction,
connection surface/map, motion policy and ray propagation separate capabilities.
A geometry's implementation may support only a subset; reject missing operations
explicitly. Future additions should implement these boundaries plus evidence,
not duplicate editor, persistence, motion coordinator or renderer scheduling.

Two connection families are intended, not yet a new saved-format change:
- Current radial/frame mapping: radius/speed-preserving gameplay correspondence.
- Matched interfaces: compatible intrinsic surface metrics with an explicit
  position map/differential; regularity conditions are separate requirements.
Do not silently migrate existing connections to a different family.

A future surface adapter should own surface coordinates/embedding, oriented
side, crossing query and destination correspondence. A spherical portal is a
closed surface with coordinate-chart seams and entry/exit sides; it is not just
a larger disc. Bubble activation/expiry additionally needs reversible terrain
transfer and safe player-state handling.

Gravity-curved light is a separate ray propagation model (physical spacetime or
an explicitly artistic optical approximation). Merely changing speed along an
existing geodesic does not change its path. Do not mix a time-of-flight parameter
with a gravitational bending law without defining what is simulated.

Longer-term coverage means useful families: constant-curvature spaces, products,
Nil/Sol/SL2R, quotient manifolds with transition maps, and selected varying metrics.
It cannot mean enumerating every manifold or rendering every metric efficiently.
Research established math/code before each adapter; assess licensing and
coordinate/units/capability compatibility before importing an implementation.
See PORTAL_PRIOR_ART.md for the direct precedent and current policy distinction.
