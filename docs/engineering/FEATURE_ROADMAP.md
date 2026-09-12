# Connected geometry: milestone order and effort

Decision update 2026-09-12. This is sequencing, not authorization to implement
every feature concurrently. Keep the browser reference and existing dependencies
until a separately scoped host trial. Read THREE_GEOMETRY_MILESTONE.md for the
current acceptance gate, CURVED_INTERFACES_AND_TRANSITIONS.md for future math.

## Where we actually are

The visible E3/full-S3 editor has connected sight/movement, property editing,
history and saved data. Bounded H3 has an experimental CPU/GPU path and a saved
three-region fixture; the normal editor now exposes it as an experimental preset, with browser
edit, persistence and bidirectional flight checks. Visual polish remains work. This is a geometry kernel and editor, not a complete general game engine.
Renderer precision, diagnostic coverage and frame-time measurement remain open.

MUSE-73's corrected CPU census finds chart exits in four sampled E3/S3 views.
That is not GPU pixel evidence and does not authorize suppressing numerical
refusals. The three-geometry preset now has explicit experimental scope, persisted model
policy and browser edit/traversal checks. Next are architecture/scale cues and
GPU artifact diagnosis, followed by representative timing evidence.

## Estimated sequence

A cycle means a bounded lead task, implementation, independent checks and review.
It can take several messages and agent runs. These are rough estimates from the
current code, not guarantees about prompts, tokens or calendar time. Difficulty
is relative to this project (1 routine, 5 research-heavy). Ranges cover the first
useful, tested version stated here, not unrestricted production support.

| Order / milestone | Difficulty | Remaining cycles | Acceptance scope |
| --- | --- | --- | --- |
| 1. Visible three-geometry editor | 4/5 | 4–8 | E3/S3/H3 preset, route both ways, edit/save/reload, diagnose representative purple patches, measure input and frame latency |
| 2. Godot host trial | 4/5 | 3–6 | Same scene and query semantics, custom viewport, input, one property edit with undo/save; compare answers, images and timings |
| 3. Authoring workflow | 4/5 | 6–12 | Metric measurements, player-clearance display, direct manipulation, supported construction tools and visible objectives |
| 4. Basic gameplay physics | 4/5 | 5–10 | Spherical bodies/projectiles, explicit gravity/support policy, whole-body crossings with transport, collision and remaining-time preservation |
| 5. First paper-style matched interface | 5/5 | 6–12 | One supported pair, likely using H2×R, with equal intrinsic seam metrics; CPU/GPU and crossing tests |
| 6. Static spherical portal | 5/5 | 6–12 | Closed two-sided interface, explicit correspondence and crossing directions, finite-radius clearance and bounded repeated ray crossings |
| 7. Static gradient corridor | 5/5 | 8–16 | One positive-definite metric in a common chart, numerical geodesics/transport, error-bounded collision and rendering |
| 8. Delayed self-images | 4/5 | 4–8 | Static world, bounded pose history and light delay, region/portal event history, explicit history horizon |
| 9. One gravitational lens | 5/5 | 6–12 | Fixed symmetric source and declared optical model; reuse established solutions/lookup techniques |
| Later: moving spherical ability | 5/5 | 15–30+ | Terrain transfer/clipping, original ownership, reversible activation, collision-safe expiry and moving boundary rules |
| Later: general rigid bodies across seams | 5/5 | 15–30+ | Bodies spanning both regions, contacts, inertia, constraints and joints; not covered by whole-body teleportation |
| Later: dynamic spacetime optics | 5/5 | 20–40+ | Moving sources/objects and retarded states; research scope, no confident completion estimate |

Rows 4–9 can be reordered around a compelling playable experiment, but avoid
starting them all. A single visible playtest should follow each capability.
Full polish can substantially exceed these ranges. Difficult counterexamples
can invalidate an estimate; no prompt count measures the complexity of a proof.

Add geometries through adapters and shared capability checks. Product spaces
H2×R/S2×R are useful next because of the matched-interface goal (roughly 4–8
cycles for a first restricted adapter). Nil/Sol/SL2R authoring and connected
rendering each need explicit constructions and measured numerical guarantees
(roughly 8–16+ each). Quotient manifolds are a separate topology layer: start
with one verified fundamental-domain identification, not an 'all manifolds'
checkbox. Multiplayer follows stable serializable region events and a small
playable loop; it must not dictate a premature host rewrite.

## Godot: trial before a large custom editor investment

Run the host trial after milestone 1, before building an extensive browser
gizmo/asset pipeline. Adopt if authoring benefits and parity are demonstrated;
budget another 6–12+ cycles for a limited host integration if the trial succeeds.
Do not wait for every geometry, and do not throw away the browser oracle.

Godot supplies editor plugins, scene/resource management, input, audio and native
rendering access. It does not supply this curved geometry, geodesic collision or
cross-region ray traversal. Its ordinary physics remains Euclidean. A custom
RenderingDevice path is native-renderer work: compute requires Forward+/Mobile,
not Compatibility. A web export is not automatically the same rendering path.
See [Godot compute documentation](https://docs.godotengine.org/en/stable/tutorials/shaders/compute_shaders.html).

Godot is the first trial because its extensible editor and accessible rendering
backend fit a custom kernel. This is not evidence it will outperform Unity.
Unity remains a candidate if a specific asset, profiling, platform or tooling
requirement wins a measured comparison. Neither engine makes non-Euclidean
physics or portals correct automatically; changing CPU languages does not
automatically accelerate the current GPU bottleneck.

## Interfaces are three separate features

Current gameplay portals map aperture coordinates and transport state under
explicit policies. The [Bridges portal paper](https://archive.bridgesmathart.org/2022/bridges2022-297.pdf)
provides precedent for matching intrinsic interface geometry, including useful
intermediary product spaces. Reproduce one construction before generalizing.
A spherical portal specifies a surface shape, not automatically an isometry
between its two sides. A gradient region is an actual intervening metric, not
interpolation between the shaders or their embedding coordinates.

## Light bending and seeing the past

The current renderer already traces geometric rays; stochastic path tracing is
not a prerequisite. Optical bending can integrate a refractive-index field.
Physically modeled gravitational lensing requires a specified spacetime/null-ray
model. Keep those labels distinct. Locally measured vacuum light speed remains
constant in relativity; an adjustable gameplay speed needs explicit units and
rules rather than a claim that gravity changes that local constant.

[Bruneton's black-hole renderer](https://ebruneton.github.io/black_hole_shader/)
is a strong implementation precedent for a specialized, accelerated lens model.
[MIT OpenRelativity](https://gamelab.mit.edu/research/openrelativity/) provides a
Unity precedent for low-light-speed visual effects; it is not a general curved
world physics solution. Check licensing before copying implementation code.

Ray tracing cannot reconstruct a past state that was neither retained nor
reconstructible. Keep a bounded ring buffer of poses, animation state and portal
events, not rendered frames. Static terrain needs no repeated snapshots until
edited. As an illustrative payload estimate, 100 bytes × 30 samples/second ×
60 seconds is 180 KB per body before indexing/animation overhead. More complex
deformation and edit history cost more. Deterministic replay is another option,
trading memory for computation and strict reproducibility.

Closed ray paths can produce multiple arrival times and unbounded older images.
Specify maximum optical delay/crossings and an honest unavailable-history policy.
Start delayed self-images in a static scene before coupling them to dynamic
gravity, moving portals or arbitrary physics. No full-scene video buffer is
required, but 'no history because rays are traced' is not a valid shortcut.
