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
- [x] Wire portals into the lab: apertures drawn, and the CAMERA carried
  through `transit.portal.mapVector` on every transit. Without that last part a
  walker re-crosses the far gate immediately and ping-pongs.
- [x] See through a portal. The ray is re-aimed by the SAME matrix the walker
  is carried by (`portal.matrix`, the linear part as a column-major mat3), so
  the far side you see is the far side you arrive in -- a second, hand-written
  copy of the map would let the picture and the physics disagree while each
  looked right alone. Up to four apertures per ray, so a portal seen through a
  portal works. Browser check 35 -> 45, and it now returns a PNG to look at.
- [ ] Roll through a tilted aperture. The lab's camera is yaw/pitch, so
  `aimAlong` silently drops roll; correct for a walker whose up is the world's
  up, wrong the moment a portal is set in a wall.
- [x] Author a portal in the lab: Add portal creates both apertures and the
  connection as ONE transaction, the inspector edits an anchor's forward and
  radius, a radius edit moves both ends because the schema pins them equal, and
  Delete on either end removes the whole portal. `editEntities` is the general
  form: some edits have no valid intermediate document.
- [x] **Booleans in the field.** A solid carries `op: 'add' | 'subtract'`, and
  a carve may `target` the one solid it cuts. Union is `min`, subtraction is
  `max` against the negated carving solid, and the term that wins decides the
  normal -- a carved face is the carving solid's surface with its normal
  FLIPPED. Any carve downgrades the advertised capability to
  `distance: 'bound'`, `intersection: 'marched'`, and `rayHit` sphere-traces
  instead of solving in closed form. 14 tests including the safety property
  that a tracing step never lands inside a solid. `boolean.test.js`.
- [x] **Draw carves in the lab.** Select a solid, press Carve, and the hole is
  there. The shader keeps its exact closed-form path when nothing is carved and
  sphere-traces when something is, with the march bound held in a UNIFORM so
  the D3D compiler cannot unroll it -- a literal bound would paste the scene
  function 160 times and never link. Measured cold on a real GPU: 1.8 s for the
  page with 69 checks, against 0.9 s with 57 before, so the marching path
  roughly doubled the link and is nowhere near the budget.
- [x] **Intersection** (`op: 'intersect'`). A wall you can walk through is now
  one clip instead of a carve whose job was to undo most of the first plane.
  Subtraction and intersection share one path and differ only in SIGN --
  `max(d, -m)` keeps what is outside, `max(d, +m)` keeps what is inside -- so
  the winner-tracking that decides the normal exists once rather than twice.
  A global intersect is REFUSED: subtraction without a target removes material,
  which is visible and recoverable, but intersection without one deletes
  everything outside itself, and for a plane that is half the world.
- [x] **`rayCast` separates a miss from a give-up.** Found by MUSE-25's
  brute-force reference: a grazing ray needed about 300 steps to reach a wall
  at 40.4, the fixed budget of 256 ran out one step short, and `rayHit`
  answered "nothing there" about a wall it had nearly touched. The budget is
  larger and the result now says whether it left the scene or ran out.
- [x] **A box primitive**. Six clipped planes is the correct EXPRESSION of a
  box and the wrong FIELD: every clip is a `max`, `max` under-reports near a
  concave seam, and one bound anywhere makes the whole scene marched -- so the
  shape an author reaches for most would have been the one that costs most.
  `kind: 'box'` has an exact distance, an exact normal and an exact slab ray
  hit, so a room made of boxes still renders down the closed-form path.
  Measured: the six-clip build under-reports by up to 1.0 unit on a 2x4x2 box,
  and that shortfall is what a marcher pays for one short step at a time.
  AXIS-ALIGNED, deliberately -- see the note in `document.js`.
- [x] **An oriented box.** The previous entry here reasoned from "Nil and Sol
  have no isometry carrying an axis-aligned box to a tilted one of the same
  shape" to "the schema must not carry a frame at all". Astra corrected it: a
  local CONSTRUCTION frame is not automatically a rigid motion of the
  surrounding space, and the two questions are separable. So scene v2 carries
  an optional orthonormal `frame`, E3 boxes take arbitrary rigid orientations,
  and each geometry says what it can honour -- S3 gets an explicitly named
  `geodesic-cell` rather than a silently reinterpreted box, and Nil/Sol stay
  unsupported until their adapters define and verify them.
  The shader derives the third axis by the same cross product the field uses
  rather than being handed it: a flipped axis would mirror the box on screen
  while collision kept the original, and no Node test can see that.
- [x] **Query guarantees say what they mean** (Astra). One `distance: 'exact'`
  was making several claims at once and two were false for a union. Now
  `exteriorDistance`, `interiorDistance`, `interiorSign`, `intersection`,
  `normal` and `normalUniqueness` are separate. Two defects fixed with it: an
  overlapping union advertised an exact signed distance it did not have (two
  unit balls one apart report -0.5 at the midpoint where the truth is 0.866),
  and the analytic `rayCast` ignored `maxDistance` (a hit at t = 1008 when
  asked for 64). Both reproduced against the previous commit before fixing.
- [x] **A modifier no longer makes the whole scene march.** Each additive
  solid compiles with the modifiers that apply to it and ray intervals resolve
  analytically per group, so one carved wall does not cost every untouched
  ball its closed form. The marcher stays as reference and fallback under
  `method: 'march'`; the two agree with a brute-force reference to 7e-15.

See [the plan](docs/engineering/PLAN-curved-authoring.md) for the phase this
belongs to. The next items are its work item 3.

- [ ] **Measure what the GPU actually pays.** The 20-50x carve figure is CPU
  `rayHit` throughput from `tools/carve-bench.js`, not frame time, and the
  analytic group path has changed the shape of the question. Wanted: CPU query
  time and real frame time, separately, over rooms, doorways, overlapping
  solids, mostly-unmodified scenes and grazing rays, with cold compilation and
  exhausted-ray counts. **No GPU path gets promoted on CPU throughput alone.**
- [ ] **Make collision and the camera geometry-agnostic, BEFORE S3 fields.**
  `engine/world/collision.js` still has three-component Euclidean dot
  products, portal tests that assume straight segments, and a camera that
  discards roll. Geometry adapters own point/tangent validation, metric
  products, geodesic advancement and transport; velocity and camera frames
  travel along the actual movement segments.
- [ ] **The S3 subset**: metric balls, oriented great-sphere half-spaces, the
  `geodesic-cell` construction, distances scaled by curvature radius, gravity
  from a chosen floor's signed-height field, transported camera frames with
  gravity alignment as an explicit walking policy. First level stays inside a
  supported open-hemisphere patch, and a numerical-domain exit must be handled
  explicitly -- **an authoring extent must not silently become a collision
  wall.**
- [ ] **One authored S3 room**: a passage, an obstacle, a short route, with
  editing, walking, undo and reload all working, and clearance and intrinsic
  measurements on screen.
- [ ] **Independently compiled regions and an E3-S3 portal.** Radial aperture
  coordinates in the two anchor frames; preserving speed and player radius are
  gameplay POLICIES, not a claim that two finite apertures are isometric.
  Acceptance is a short E3 -> S3 -> E3 route surviving traversal, editing and
  save/load.
- [ ] **Warn on coincident faces.** The box-room fixture first drew a speckled
  line across its doorway sill because the carving box's bottom face sat at
  exactly z = 0, on the ground plane: two surfaces in the same place, and the
  marcher cannot say which it is on. Sinking the cutter 0.2 below the floor
  fixed it. That is an authoring hazard with a picture-only symptom, which is
  the kind the editor should catch and say out loud.
- [ ] **A viewport gizmo, in the browser.** Ours in either host -- Godot's
  `_set_handle` hands you a screen position and expects your own projection --
  so building it now costs nothing against a future migration and settles
  decision 001's criterion 4 on the host we already have.
- [ ] **One Godot experiment: can its 3D editor host a curved viewport?** March
  the world in a sky shader (which receives a per-pixel eye direction and draws
  behind everything), and place gizmo geometry by back-projecting the screen
  position we want through the editor camera. Untested design; one afternoon;
  the only cheap question whose answer moves the host decision. See
  [host capability map](docs/host-capability-map.md).
- [x] **Measure whether imported assets can work in curved space**, since that
  is the condition on the host decision. `tools/mesh-probe.js` +
  `mesh-approx.test.js`: in the projective model geodesics are straight to
  6e-15, so a rasterizer draws exact geodesic EDGES for free; only triangle
  interiors approximate, at 0.114% of radius in E3 and 1.62% in H3 at radius
  2.5 with 5120 triangles. Small props are free anywhere; large hyperbolic
  objects cost ~14x. Nil/Sol/SL~(2,R) are NOT covered -- no projective model
  makes their geodesics straight.
- [ ] **A curved-space rasterizer**, if assets are wanted: projective vertex
  shader, subdivision by object size in curvature radii, and depth interop with
  the ray marcher so meshes and fields agree on what is in front. This is the
  hard part of assets and it is ours in EITHER host -- Godot supplies the
  importer, which is the cheap part.
- [ ] **Feature references** for snapping -- a named, addressable part of a
  primitive with a point, a frame and an extent ("the +z face of that wall").
  This is what we actually want from CAD topology, and it is far less than a
  B-rep, which does not transfer to H3 anyway: NURBS are affine combinations
  and H3 has no affine structure.
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
