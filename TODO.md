# Connected-geometry kernel and editor roadmap

See [what this is](docs/what-this-is.md): a geometry KERNEL plus an authoring
tool, hosted somewhere. Godot is a candidate host, not a competing engine.

The engine and authoring workflow are the product direction. Build small
first-person levels to test each capability. Game-mode expansion is secondary.
The previous backlog is preserved in
[docs/archive/gameplay-backlog.md](docs/archive/gameplay-backlog.md).

## Immediate priorities after geometry coverage

- [x] Fix the confirmed Sol/SL2R K-key fallback that creates hidden H3 course
  state despite Course off; preserve valid lab restart behavior.
- [x] Build the first scene-data-to-Godot editable ball; see [the ball lab](docs/ball-lab.md) and the scoped
  [next-session brief](docs/engineering/NEXT_SESSION.md). Muse's bounded
  overnight preparation and menu work are tracked in [MUSE_TASKS.md](MUSE_TASKS.md).
- [x] Repair Windows browser checks: isolated cold profiles, leased warm reuse,
  prompt startup failures and owned cleanup. Real-GPU world probe: 346 checks.
- [x] Complete POSIX owned browser-tree cleanup; verified on a real POSIX host
  (29/29, grandchild reaped, out-of-group sentinel untouched). Warm profile
  publication stays Windows-only until a real Chrome run is possible on POSIX.
- [ ] **Reported crash, NOT reproduced:** `apply()` given an undefined operand
  (geom.js:80) in arena fight after seconds of play. Every runtime call site was
  audited and ~40,000 headless frames failed to reproduce it. The boot panel now
  prints the STACK, which is the one thing the original report lacked, and
  `tools/play-check.js` closes the coverage gap. See
  [the investigation](docs/qa/crash-2026-09-09-geom-apply.md); the next
  occurrence should name its caller.
- [x] Add sustained-play coverage: `page-check --worlds` proves a world starts,
  nothing proved one survives being played. `tools/play-check.js` plays a seeded
  run with the kit and fails on zero face crossings.
- [x] Extend the ball lab with a moving collision probe and a first-person
  edit/play loop. `engine/world/collision.js` is host-free and consumes only
  the distance-bound and normal capabilities, so a curved field plugs in
  without touching the solver. Conservative advancement cannot tunnel at any
  speed or time step; a stall leaves the probe short, never inside. The
  edit/play transaction policy is written down in docs/ball-lab.md.
- [x] Author a FLOOR primitive, then gravity and ground contact. `plane` is a
  scene-v1 entity kind; `engine/world/scene-field.js` unions balls and planes
  with the nearest solid's own normal; `engine/world/walker.js` adds gravity
  where DOWN IS A PARAMETER, because H3 has no canonical one. The drawn floor
  is the authored entity, so the picture and the collision field cannot
  disagree. Godot's adapter rejects planes until it implements them.
- [ ] Teach `experiments/godot/ball_document.gd` about planes, so both hosts
  accept the same documents again. Shared conformance cases first (MUSE-09).
- [ ] Curved balls: an H3/S3 `space` (step, transport, project) plus metric
  distance/normal. The solver is already written against that interface;
  `e3Space().transport` is the identity and curved spaces MUST override it.
- [x] Selection and more than one entity, so the editor authors a scene rather
  than a single ball: entity list, per-kind inspector, add and delete, with
  balls and planes reaching the shader as arrays under a uniform count rather
  than a branch each.
- [ ] A viewport gizmo: drag an entity in the world instead of typing numbers.
  Needs a ray pick against the same field, which `rayHit` already provides.
- [x] Same-geometry authored portal transit, in the KERNEL: swept crossing
  mid-step, arclength conserved through the gate, blocked-exit refusal, and an
  aperture too narrow for the player refused at compile time. 16 tests.
- [ ] Wire portals into the lab: draw the apertures, and carry the CAMERA
  through `transit.portal.mapVector` on every transit. Without that last part a
  walker re-crosses the far gate immediately and ping-pongs.
- [ ] See through a portal (render the far side). Transit works without it, but
  an invisible gate is not usable by a person.
- [x] Replace duplicated oversized agent instructions with shared working rules,
  compact Astra/Claude entry points and a bounded Muse handoff queue. See
  [agent setup](docs/engineering/AGENT_SETUP.md) for Ubuntu/WSL instructions.
- [x] Independent geodesic/metric audit across all eight geometries; see
  [audit and limits](docs/math-audit.md).
- [x] Fix product tangent lighting, spherical normal signs, unsupported self
  bodies, and the flat checker wrap; add GPU regressions and distant H2R samples.
- [x] Add Fog off, including disabling the artificial range fade.
- [x] Replace Nil column silhouette marching with independently tested exact
  intersections; remove the march-range fade and default the preset to fog off.
- [x] Fix dropper baffle stripes by sampling material on the surface; save
  Nil/dropper camera regressions as data and provide a rendering command.
- [x] Reproduce the reported H2R ceiling bands and verify their removal in
  matching before/after renders.
- [ ] Generalize primitive capabilities around distance bounds, exact ray hits
  and surface normals; see [rendering contracts](docs/rendering-contract.md).
- [ ] Regenerate Godot comparison fixtures after spherical normal corrections.

1. [x] Fix glancing collisions in Sol/SL2R so walls preserve tangent motion.
2. [ ] Measure long-ray convergence, exhausted rays and GPU frame cost in those labs.
   Shader link time alone does not establish rendering accuracy or latency.
3. [ ] Return to the Godot authoring experiment: one editable primitive with
   inspector, undo and immediate play, using shared scene data. The BROWSER
   half of "immediate play" now exists (probe, swept collision, edit-overlap
   policy); Godot still has edit/undo/save-load without a moving player, so
   criterion 4 is met on one host of two.
4. [ ] Test native networking before deciding whether to migrate the host.

Defer additional geometry content, quotients and elaborate modes until these
checks clarify the renderer and authoring foundations. Existing labs are test
levels, not evidence that a general connected-geometry engine is finished.

## 0. Portable foundation

- [x] Separate existing UI, preset data, registration and motion adapters into directories.
- [x] Teach the preview tool to resolve imports relative to nested modules.
- [x] Add versioned scene data with stable IDs, region ownership, metric radius, anchors and portal intent.
- [x] Reject unsupported features explicitly instead of silently treating them as flat geometry.
- [x] Add bounded E3/H3/S3 charts and radial sample transfer with distortion measurements.
- [x] Test round trips, translated charts, physical units, antipodes and malformed scene data.
- [x] Record native-runtime evaluation criteria and the S3-region research sequence.
- [ ] Export language-neutral numerical golden fixtures for a second runtime.
- [ ] Extract H3 quotient state from module globals into independent regions.
- [ ] Separate session/input state from rendering and the H3 gameplay kit.

## 1. Native-host evaluation (next)

- [x] Locate/install a stable Godot editor and record its exact version and GPU/backend.
- [ ] Load the same scene JSON and compare model points with JS golden fixtures.
- [x] Render H3 with quotient crossings, not just a flat demo or isolated sphere.
- [x] Measure cold/warm shader preparation and CPU/GPU frame time at matching settings.
- [ ] Measure input response; the fixture harness renders fixed viewpoints and cannot.
- [ ] Build one editable native primitive with inspector, gizmo, undo and immediate play.
- [ ] Check the desktop networking transport with two instances.
- [ ] Decide Godot migration from evidence; evaluate Unity if a concrete Godot limitation blocks it.

The earlier rendering parity milestone met 13/13 fixture views on both Godot backends, bounded
H3 agreeing to 0.0005 of 255 per channel, and shader preparation 8444 ms in
the browser against 721 ms native. It cost one real shader bug, latent in the
browser build and only findable with a second compiler; see
[docs/decisions/001-runtime-strategy.md](docs/decisions/001-runtime-strategy.md).
Basic E3 position/radius editing, undo and persistence are tested in the ball lab.
Gizmos, playable collision, input latency and networking remain migration gates,
so the host decision stays open.
Parity must be refreshed after the latest spherical and Nil renderer changes;
the earlier result does not establish parity with today's browser build.

Acceptance: visible/numerical agreement, usable edit/play iteration and a
documented performance comparison. Do not postpone this until after building
a full browser editor. Preserve the reference app until equivalence is tested.

## 2. First editor and connected regions

- [ ] Editable scene parameters drive rendering and collision without relinking per drag.
- [ ] Spawn/objective/balls first, then supported walls, platforms and grapple anchors.
- [ ] Select/place/duplicate/delete, undo/redo, JSON save/load and immediate play.
- [ ] Show player clearance, true distance, movement reach and local frame orientation.
- [ ] Instantiate two regions concurrently; each entity and ray carries a region ID.
- [ ] Same-geometry authored portal with swept crossing, overshoot and exit clearance.
- [ ] E3-to-S3 portal with explicit aperture mapping, frame and speed rules.
- [ ] Render through the aperture; bound crossing count and detect cycles.
- [ ] Test camera, velocity, projectiles, rope policy and return crossing together.
- [ ] Build a short retrieval level that requires crossing between regions.

Scene v1 stores connection intent only. No checked item above means that mixed
rendering, physical portal crossing or a visual editor already exists.

## 3. Terrain transfer and spherical-region ability

- [ ] Preview the same sample structure in E3/H3/S3 with distortion overlays.
- [ ] Preserve source object IDs and authored data; transfers are reversible edits.
- [ ] Clip structures intersecting the boundary, rather than testing only their centers.
- [ ] Match visual and collision deformation with conservative distance bounds.
- [ ] Static spherical-curvature patch with an explicit seam and chosen gravity.
- [ ] Activate/deactivate the patch, including safe placement on expiry.
- [ ] Choose snapshot-at-activation versus continually rescooped terrain before a moving bubble.
- [ ] Carry or release ropes, preserve entity ownership, resolve overlapping bubbles.
- [ ] Choose boundary physics: gameplay portal, sharp interface or smooth variable metric.
- [ ] Replicate region lifecycle and transfers as ordered authoritative events.

A bounded S3 patch is the first target. A complete S3 is a closed space, not
the inside of an ordinary sphere with an exterior surface to glue on.

## 4. Broader authoring and geometry coverage

Distinct examples to consider from the [WLU gallery](https://3d.wlu.edu/vr/examples/)
(feature coverage, not a request to reproduce every scene):

- [ ] S3 quaternion quotient: distinguish intrinsic spherical recurrence from gluing.
- [ ] H2 x R cusp-times-circle exploration; keep orbifold cone points explicitly
  separate from smooth manifold experiments.
- [ ] Nil Dehn-twist mapping torus and visible contact-plane/fibre transport.
- [ ] SL2R genus-two quotient: expose base-loop and fibre coupling.
- [ ] Sol compact lattice: demonstrate stretching gluing across height seams.
- [ ] True metric balls in Nil/Sol, compared with our columns and plane-built boxes.
- [ ] H3 horoball/cusp exhibit as an optional geometry lesson, not the main floor.
- [ ] Controlled point lights and multiple light paths in product spaces;
  reflection/refraction tests as later renderer work.

Flat three-torus recurrence and basic Sol halfspace/box behavior already have
coverage. VR duplicates, material-only variants and debugging pages add no new
geometry requirement. Prioritize topology and transport examples after the
current accuracy/authoring milestones.

- [x] Finish Nil menu, HUD, six-gate climb and collision integration.
- [x] Verify a climb from rest through all six gates with actual movement/collision.
- [x] Fix Nil ray direction across local-frame restarts and check GPU flow against JS.
- [x] Add a tested Sol numerical kernel and coordinate-plane distance fields.
- [x] Render Sol with bounded incremental integration; add a small navigable level.
- [x] Implement and verify the universal-cover SL2R kernel, then its renderer/level.
- [ ] Sol/SL2R: long-ray convergence, exhaustion diagnostics and frame-time profiling.
- [x] Sol/SL2R: basic sliding collision with glancing-contact regressions.
- [ ] Sol/SL2R: multi-contact corners, transported camera frames and objective courses.

Nil verification (2026-09-08): 47 Nil tests; all 14 then-existing suites pass;
266 cold real-GPU world/input checks; seven shader programs compile. Nil links
in 3.4 s on the RTX 5070 Ti. Existing H3 links in 10.7 s and remains a startup
performance concern. Sol and SL2R now have separate flight laboratories in the
world menu. Their GPU fields and geodesic components pass sampled CPU comparison;
16 test suites and 316 browser checks pass. See [lab limits](docs/lie-labs.md).

- [ ] Blender/glTF marker and primitive metadata import with explicit unit conversion.
- [ ] Modular structures, collision proxies and seam/closure diagnostics.
- [ ] Arbitrary mesh rendering/collision strategy profiled on actual levels.
- [ ] Product-geometry charts, then Nil/Sol/SL~(2,R) where experiments need them.
- [ ] Route graph plus spatial view, breadcrumbs and death/retry analysis.
- [ ] Multiplayer prediction across region events and shared content revision checks.
- [ ] Public editor/sharing after authoring works well internally.

Keep the dropper, race and grapple experiments as regression levels. Preserve
successful-run tests; geometric correctness does not prove a route is playable.
