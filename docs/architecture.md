# Geometry expansion guide

## Current state

The root application is plain ES modules and WebGL2, served without a build
step. Keep its mathematics DOM-free and its level data shared between CPU
collision and GPU rendering. `CLAUDE.md` contains the detailed numerical and
rendering constraints; `TODO.md` contains the larger gameplay backlog.

| Layer | Current implementation | Expansion constraint |
| --- | --- | --- |
| Geometry math | `geom.js`, `product.js` | Products require their own operations; curvature alone cannot describe every geometry. |
| Hyperbolic topology | Groups and mutable solid selection in `hyp.js` | Separate identification rules from the local metric before adding more manifolds. |
| Worlds | `level.js`, `s3.js`, `h2r.js`, `s2r.js` | Scene data, collision, and generated GLSL must agree. |
| Gameplay | `physics.js`, `modes.js`, world-specific movement | The full grapple/combat kit currently depends on H3. |
| Application | `main.js` | Input, option rules, simulation dispatch, drawing, and HUD are still coupled. |
| World browser | `menu.js`, `worlds.js` | DOM controls and preset data are extracted; the application supplies actions and effective settings. |
| Registration | `spaces.js` | Menu choices, shader IDs, program labels, and shader check enumeration share one list. |
| Rendering | `shader.js` | Separate compiled programs keep unreachable geometry out of driver compilation. |
| Networking | Root `net.js` and `tools/relay.js` | Existing game uses two-player WebRTC. |
| Server experiment | `server/` | Separate Colyseus/Vite/TypeScript application with flat 2D movement; not the curved game's server. |

Four geometries are playable: H3, S3, H2 x R, and S2 x R. E3 is implemented
and tested as mathematics only. H3 offers two identifications: the octagon
surface quotient (compact horizontally, unbounded vertically) and the closed
Seifert-Weber dodecahedral manifold. Geometry, topology, and course are distinct
choices, even though the current UI and globals partly conflate them.

## Boundaries to introduce next

These are proposed interfaces, not capabilities already implemented by the
registry. Adding a row to `spaces.js` does not implement a new world.

1. **World sessions:** move spawn, reset, simulation step, and HUD into one
   adapter per playable world. Pass input and session state explicitly. First
   extract S3's small flythrough, then the two product courses, then H3. Keep
   option locks and reset behavior covered when extracting them.
2. **Quotients:** extract H3's group data and fold operations behind a topology
   object with point reduction, placement reduction, and nearby-copy queries.
   Reduction must return the identification transform so velocity frames,
   ropes, projectiles, and other carried objects change copies consistently.
   A world without identifications supplies an identity implementation.
3. **Scene authoring:** share number/array emitters first, then introduce a
   small primitive vocabulary with per-geometry CPU and GLSL implementations.
   Do not treat a Euclidean distance formula as a curved-space SDF. Extend
   CPU/GPU agreement checks to each world's scene; `sdf-check.js` currently
   covers the hyperbolic level.
4. **Capabilities:** let each world declare supported locomotion, gravity,
   grapple, combat, course, and networking features. Replace scattered option
   locks only after adapters exist. A metric does not by itself supply a
   gravity field, a quotient-compatible field, or an implementation of a weapon.
5. **Network integration:** define geometry, topology, level/version, and
   placement serialization before porting curved simulation to `server/`.
   Its current x/y movement cannot simulate these worlds. Prediction must run
   the same simulation and folding rules as authority.

The shared boundary should expose operations such as point extraction,
distance, geodesic stepping, frame transport, and placement composition, not
assume that every placement is a Lorentz matrix. Product height is affine;
generic 4x4 multiplication is not valid for its current packed representation.
Future Nil or Sol implementations should own their geodesic and transport
algorithms rather than being forced into `geom.js`'s constant-curvature model.

## Suggested implementation order

Start with world adapters and the quotient interface, then build a playable
flat box and 3-torus as a simple integration control. Next, generalize the
existing surface-group construction to another validated polygon pairing.
Only then tackle a new family such as Nil or Sol. More complicated H3
manifolds need validated fundamental-domain data and pairing checks; they are
not just another set of face normals pasted into the current marcher.

For every new space, verify distance and geodesic identities, frame preservation,
spawn clearance, collision, and CPU/GPU agreement. For quotients, additionally
verify inverse pairings, seam continuity, reduction, and carrying every live
object through a fold. Test gravity invariance under the identifications when
gravity is enabled. Preserve the shader's compile-time specialization and
measure link time on the real GPU.

## Development commands and tools

Run `node tools/test.js` from any directory using the script's path. It discovers
all root `*.test.js` suites, runs each in a separate process, continues after
failures, and returns a failing exit code if any suite fails. The existing
per-file test commands remain valid. Server tests remain separate:
`npm test --prefix server` after installing that project's dependencies.

Run `node tools/shader-check.js` after shader edits and
`node tools/page-check.js` for real module loading and startup. Add `--worlds`
to visit all seven presets and check placement constraints, resets, course
pausing, input isolation, cached programs, transient cleanup, and resolution.
This appends `tools/world-probe.js` to the served main module only for the test;
the shipped application exposes no test globals. Use
`node tools/link-time.js` after changing scene complexity or renderer calls.
Both shader enumeration tools now consume the playable-space registry.
Use `sdf-check.js`, `march-check.js`, and `net-check.js` for their respective
subsystems, as detailed in `CLAUDE.md`.

No extra service, plugin, rendering framework, or package manager is required
for this stage. Node and an installed Chrome/Edge support the existing tooling
(some helpers currently search only for Chrome). Browser developer tools and
real-GPU checks remain necessary because software shader compilation cannot
establish driver performance. The all-world smoke check now covers presets and
key transitions, but does not exhaust every option combination, play complete
courses, or establish multiplayer behavior across geometry changes.

The world browser pauses offline simulation and skips covered rendering;
network connections keep simulation live. This pauses course time, not
wall-clock-based ability cooldowns. Resolution is now a visible setting using
the existing render scale. This reduces pixel work, not shader link time.
Cold world selection yields two animation frames to paint preparation status
before the existing synchronous link. Asynchronous driver compilation remains
a separate future improvement.

## Reference examples

The [Thurston geometry examples](https://3d.wlu.edu/vr/examples/) include
quotient spaces as well as universal covers: a Euclidean three-torus,
a cusped torus times a circle, and Nil mapping tori. Entries labeled
orbi-torus are orbifolds and should not be treated as smooth manifolds without
examining their singularities. This is useful reference material for the
planned topology interface; no external renderer code was imported here.
