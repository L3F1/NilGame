# NilGame: connected-geometry engine and editor

NilGame explores first-person interaction in curved spaces and manifolds.
The long-term goal is an engine and visual editor supporting architecture
embedded in curved space, rooms connected through portals, and connections
between different geometries. Small playable levels test the engine and editor.

The eventual ability: create a spherical-geometry region around the player,
map captured terrain into it, and interact with its changed geometry. That
requires explicit distortion, boundary, physics and ownership rules. It is
the research direction, not a shipped feature.

## Start here

- [Active roadmap](TODO.md): foundation work and next milestones.
- [Architecture](docs/architecture.md): region, topology, connection and runtime boundaries.
- [Scene format](docs/scene-format.md): saved data, coordinates and current limits.
- [Runtime decision](docs/decisions/001-runtime-strategy.md): Godot, Unity, web, performance and multiplayer.
- [Existing playground](docs/playground.md): controls, mechanics and mathematical explanations.
- [Working rules](docs/engineering/WORKING_RULES.md): numerical pitfalls and required verification.
- [Agent setup](docs/engineering/AGENT_SETUP.md): shared Astra/Claude rules and Muse's WSL handoff.
- [Rendering contracts](docs/rendering-contract.md): distance bounds, exact hits and saved review views.
- [Editable ball lab](docs/ball-lab.md): first scene-driven authoring experiment in Godot and WebGL.

## What runs today

Open `index.html` through VS Code Live Server, or run `node tools/relay.js`
and open the local address it prints. The root app uses plain JavaScript ES
modules and WebGL2; Node tests need no package install. Press **O** to browse
the experiments.

For the current **connected editor**, run `node tools/relay.js` from this
directory and open http://localhost:8080/tools/connected-global-preview.html.
Entity and portal editing controls are below the viewport. It currently runs
E3 and complete S3; choose the three-geometry preset for experimental H3. This is the same renderer as
the connected demo, not a separate finished editor. Choose a higher Resolution
for sharper output; Polished lighting, Ambient occlusion and Smooth edges are
available in the page. Numerical refusal pixels still need renderer work.
For the current E3/S3/H3 gallery, open `tools/connected-global-preview.html?preset=three`.
Turn off **Smooth edges**, then enable **Refine spherical edges through portals**
to try the checked miss-exclusion pass. It resolves some purple fringes, not all;
it starts off because software rendering can be substantially slower.
The older flat-room authoring lab is at http://localhost:8080/tools/ball-lab.html.

All eight Thurston geometries now have navigable experiments: H3, S3, H2 x R,
S2 x R, E3, Nil, Sol and the universal cover of SL2R.
The new [Sol and SL2R laboratories](docs/lie-labs.md) provide bounded flight
chambers with solid obstacles; they are early rendering/movement tests.
Nil's spiral climb has six ordered gates, solid columns and a passable finish
beacon. Choose **Nil spiral climb** in the experiments menu; steer around the
spire while rising. Its rays and movement follow the same helical geodesics.
H3 includes the octagon and Seifert-Weber quotients; E3 includes a slab and a
3-torus. H3 has the full grapple/ability kit. Other experiments have their
own motion and courses. Current H3 portals connect locations in H3; changing
the world in the menu resets an experiment, rather than crossing a portal.

Scene-v1 now feeds a separate E3 ball authoring experiment in Godot and the
browser, with position/radius edits, undo/redo and JSON save/load. The main
game still uses its existing authored levels. The connected editor additionally
supports E3/complete-S3 portal traversal and transactional entity/portal edits,
undo/redo and JSON persistence. A full authoring toolset and the geometry-sphere
ability remain to be built.

## Repository map

| Location | Responsibility |
| --- | --- |
| `engine/geometry/` | Existing experiment registry; bounded charts and terrain sample mapping. |
| `engine/world/` | Validated, versioned scene documents independent of an engine vendor. |
| `engine/runtime/` | Existing per-world movement adapters. |
| `app/` | Browser UI; currently the world menu. |
| `levels/presets.js` | Existing experiment option presets, preserving menu order. |
| `levels/fixtures/` | Saved engine test scenes; currently data fixtures, not playable levels. |
| Root math and simulation modules | Working reference implementation; extract incrementally with tests. |
| `main.js`, `shader.js`, `index.html` | Existing WebGL host, rendering and page. |
| `*.test.js`, `tools/` | Numerical, course, browser, shader and networking checks. |
| `server/` | Separate flat 2D Colyseus experiment; not the curved game's authority. |
| `docs/archive/` | Historical backlog retained for ideas and implementation history. |

Root files have not all been moved at once: `hyp.js`, `physics.js` and the
world modules contain coupled state that needs extraction, not just new names.
New portable engine code must not depend on DOM or WebGL. Existing adapters
may bridge to reference modules until extraction.

## Verification

```text
node tools/test.js
node tools/scene-check.js
node tools/page-check.js --worlds
node tools/shader-check.js
```

The scene check validates data and reports sample-transfer distortion; it
cannot establish that a level is traversable. Run `tools/link-time.js` after
scene complexity changes, `tools/sdf-check.js` after distance-field changes,
`tools/march-check.js` after marcher changes, and `tools/net-check.js` after
network changes. See docs/engineering/WORKING_RULES.md for the reasons and
GPU requirements; AGENTS.md is a router and holds neither.

Reproduce the reported Nil/dropper views with `node tools/render-fixture.js`
followed by `nil-close-column`, `nil-horizon`, or `dropper-ceiling`. These save
review images; they are not automated image-difference tests.

## Runtime direction

Evaluate **Godot as a native host early**, before building a large custom editor.
Keep the browser build as the numerical and playable reference during that
evaluation. A native host can supply editor widgets, asset tools and platform
services; NilGame must still supply curved geometry, ray paths and physics.
Migration is decided by a representative benchmark and authoring experiment,
not by assuming a language change makes the renderer faster.


The connected editor's **World** selector now includes **E3 / complete S3 / H3
(experimental)**. Open it directly at
http://localhost:8080/tools/connected-global-preview.html?preset=three after
`node tools/relay.js`, or use **E3 / S3 / H3 editor** in the game's Worlds menu.
Opening a preset restarts the world and discards unsaved edits; download first.
H3 uses the current bounded ball/aperture subset, not unrestricted authoring.
