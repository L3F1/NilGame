# Engine architecture

## Direction and implementation status

Build a first-person geometry engine and editor. Regions may contain curved
architecture or flat modules; connections describe how a player, ray or object
moves between regions. Levels exercise the engine rather than fixing it to a
single flagship mode. Runtime selection is covered by
[decision 001](decisions/001-runtime-strategy.md).

Implemented in this foundation pass: saved document validation, bounded
constant-curvature charts, radial point mapping and measured distortion.
The running game still selects one experiment at a time. Its H3 portals stay
within H3. New document connections are authoring data only.
The [ball lab](ball-lab.md) now connects a restricted scene-v1 E3 document to
browser/native editing, distance queries and uniform-driven rendering. It is
the first authoring slice, with player collision and curved primitives still pending.

## Separate five concepts

1. **Geometry:** distances, geodesics and tangent frames. A curvature radius
   converts model units to document units. E3/H3/S3 share constant-curvature
   math; H2 x R and S2 x R require product operations.
2. **Topology:** identifications within a region, such as a torus lattice or
   H3 quotient. Crossings carry attached objects by the same identification.
   Geometry and topology must not share one enum.
3. **Region:** a geometry instance, topology, content and simulation state.
   A world may have several regions with the same geometry and different IDs.
4. **Connection:** an explicit boundary rule. Same-geometry isometries,
   gameplay portals between metrics and smooth metric transitions are
   different operations. Changing coordinates alone cannot change curvature.
5. **Host:** browser or native runtime supplying windows, GPU submission,
   editor controls, files, audio and networking transport.

Persistent entities need stable IDs and region ownership. Runtime poses also
need chart/lift information where identifications apply. Never interpolate
matrices or calculate distances across two different geometries.

## Current files and extraction boundaries

| Area | Files | Remaining work |
| --- | --- | --- |
| Geometry | `geom.js`, `product.js`, `engine/geometry/charts.js` | Extract reference math incrementally. |
| Registry | `engine/geometry/registry.js` | Keep shader IDs stable; experience keys are not document metric IDs. |
| Topology | `hyp.js`, `e3t.js` | Remove mutable quotient selection before concurrent regions. |
| Scene data | `engine/world/document.js`, `engine/world/ball-scene.js`, `levels/fixtures/` | One E3 ball editor/query adapter runs; general region content and collision remain. |
| Reference content | `level.js`, `s3.js`, `h2r.js`, `s2r.js`, `e3t.js`, `race-track.js` | Separate authored content from simulation and GLSL emission. |
| Simulation | `physics.js`, `engine/runtime/world-motion.js`, `racing.js`, `modes.js` | Region-owned state and explicit boundary events. |
| Browser | `main.js`, `index.html`, `app/menu.js` | Extract rendering, input and session state incrementally. |
| Experiments | `levels/presets.js` | Retain controls, menu order and successful-run regressions. |
| Network | `net.js`, `tools/relay.js` | Current two-peer WebRTC; future region-aware authoritative protocol. |
| Separate prototype | `server/` | Flat 2D Colyseus simulation, not the integrated game server. |

New core modules are DOM-free and GPU-free. The existing motion adapter is an
integration bridge, not the final region contract. H3 still selects the full
`physics.js` path. Product placements are packed differently: ordinary mat4
multiplication cannot substitute for their operations.

## Terrain mapping into S3

The first mapping is radial: measure a source point's direction and distance
from a chosen frame, then follow that direction for the same distance in the
destination geometry. `createChart` exposes `encode` and `decode`;
`transferPoint` composes them.

It preserves radius and directions at the origin. It changes lateral lengths,
areas, volumes and most distances between pairs of points. `transferStretch`
reports local radial/transverse/volume factors. Origins may be translated and
rotated. Charts have validated extents; S3 stops before the antipode, where
the inverse ceases to be unique. H3 also has a numerical extent budget.

This maps sample points, not complete meshes or distance fields. Mapping only
a ball's center and preserving its radius creates a native destination ball;
it does not deform the whole source ball. Meshes need subdivision and mapped
normals; collision needs the same deformation and safe distance bounds. A
source distance field composed with an inverse deformation is generally not
an exact destination distance field.

Retain authored source content and stable IDs. Do not repeatedly remap the
last deformed output. Specify clipping, ownership, activation, expiry and
overlap behavior. A moving bubble also needs a choice between moving captured
contents and continually capturing new terrain; those are different systems.

## Boundary contracts to implement

A crossing event should identify the entity, source/destination regions,
connection/revision, before/after pose, velocity policy and remaining timestep.
Sweep to the first boundary, transfer, then simulate the remainder. Handle
blocked exits and repeated crossings explicitly.

A ray similarly needs region ID, local origin/direction, accumulated optical
distance and a bounded crossing budget. The shader currently specializes one
geometry per program. Mixed views need an explicit strategy, such as portal
passes or a region-aware marcher, with measured compile time and frame cost.
Merely adding a uniform does not implement this.

Ropes need a path of segments in their regions, or an explicit release rule.
Projectiles, audio, gravity, camera and body scale also need policies.
Preserve-speed in scene v1 is a gameplay convention, not a claim of physical
conservation through an arbitrary metric change.

## Editor and persistence

The [scene format](scene-format.md) stores intent independently of engine nodes
and GPU uniforms. A native host may wrap objects in editor nodes, but those
are views of the authored data. A route graph supplements spatial layout; it
does not replace distances, visibility or collision tests.

The first edit loop needs selection, transforms, duplicate/delete, undo/redo,
save/load and immediate play. Rebuild parameter buffers when an object moves;
avoid relinking per drag. Share authored objects between CPU collision and GPU
rendering and retain numerical agreement checks.

## Verification

`node tools/test.js` runs root suites in isolated processes.
`engine-foundation.test.js` covers the new numerical/document contracts.
`node tools/scene-check.js [file]` validates data and reports radial samples;
it does not test traversal or rendering.

`tools/page-check.js --worlds` covers real app loading and world transitions.
Compile all six programs with `tools/shader-check.js` after shader edits;
measure driver linking with `tools/link-time.js` after complexity changes.
`tools/sdf-check.js` covers H3, both flat worlds and the S2 x R race track.
Marcher and networking changes have dedicated checks in `AGENTS.md`.

The [WLU examples](https://3d.wlu.edu/vr/examples/) include quotients and covers.
Orbifold examples may have singularities and should not be assumed smooth.
No external renderer implementation was copied.
