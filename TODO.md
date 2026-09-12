# Connected-geometry kernel and editor roadmap

See [what this is](docs/what-this-is.md): a geometry KERNEL plus an authoring
tool, hosted somewhere. Godot is a candidate host, not a competing engine.

The engine and authoring workflow are the product direction. Build small
first-person levels to test each capability. Game-mode expansion is secondary.
The previous backlog is preserved in
[docs/archive/gameplay-backlog.md](docs/archive/gameplay-backlog.md).

## Current milestone: polished E3 / full-S3 / H3 editor

Status reconciled 2026-09-12. This section supersedes historical milestones
below. Implementation details and acceptance criteria:
[THREE_GEOMETRY_MILESTONE.md](docs/engineering/THREE_GEOMETRY_MILESTONE.md).

- [x] E3/full-S3 connected GPU preview with transported motion and camera,
  entity/portal property editing, atomic refusal, undo/redo and JSON persistence.
- [x] Experimental bounded H3 CPU metric, ball/aperture queries, connected sight
  and movement; reviewed independent sampled audits through MUSE-71.
- [x] Saved E3 -> full S3 -> H3 fixture, antipode passage and return route.
- [x] Explicit H3 editor-model policy retained through edit/load/history,
  preserving player pose and camera. This is not H3 GPU admission.
- [x] Document editor launch and higher-resolution preview choices in README.
- [x] Metric-aware H3 materials/AO and real/software GPU verification of the
  three-region model, renderer, transit and edit/history path. See
  docs/qa/h3-material-review.md. Browser preset form still pending.
- [x] Preserve H3 numerical-vs-coverage refusal reasons; numeric causes win
  across mixed portal order. Both backends verified; unresolved status retained.
- [ ] Diagnose visible E3/S3 silhouette/portal purple patches by reproducible
  rays; MUSE-73 CPU refusal census assigned, GPU attribution follows.
- [ ] Finish review of the partial H3 GPU repair, run real-GPU and SwiftShader
  readback, inspect images and measure frame distributions. Claude stopped at
  session quota. Opt-in experimental renderer now has durable real/software GPU
  checks. Stable ball spans reduced extra refusals331->22, lost hits191->1 in
  the fixed corpus. Broader precision cases, refusal provenance and GPU timing remain.
  See docs/qa/h3-stable-span-review.md; visible H3 editor not yet shipped.
- [ ] Expose the three-geometry fixture through the existing editor/preset UI
  only after GPU verification; validate full edit/save/load/traverse workflow.
- [ ] Polish that level: useful architecture/scale cues, reliable contact,
  reduced numerical refusal pixels and appealing materials. Do not hide unknown
  rays as confident hits/misses. Measure high-resolution cost before defaults.
- [ ] Finish primary-source/code/license review of MUSE-72 before code reuse.
- [ ] After visible acceptance: direct manipulation/snapping, then further
  geometry/topology adapters through verified capabilities. Curved interfaces
  and transition metrics are future work; see CURVED_INTERFACES_AND_TRANSITIONS.md.

Evidence counts live in dated review reports, not this checklist. Update this
section when a milestone lands; keep assignments in MUSE_TASKS and recovery
details in NEXT_SESSION rather than letting those replace roadmap updates.

## Earlier milestones and retained backlog

- [x] First S3 authored-floor walking: intrinsic gravity/support, transported
  camera with local horizon, jump, bounded integration, editor mode selector and
  real doorway-route check. See docs/qa/astra-spherical-walking-2026-09-10.md.
- [x] Independent walking audit (MUSE-47): pinned-contact crash repaired;
  designated reversed-floor policy clarified. See Astra MUSE47-49 review.
- [x] Independent numerical transport repair audit (MUSE-50) and MUSE-48/49 revisions accepted.
- [x] S3 primitive boundary-event layer: ball/plane roots, cell-face candidates,
  explicit numerical refusals. It does not yet classify Boolean scene hits.
- [x] CPU Boolean event classifier and independent root audit (MUSE-51), reviewed
  and integrated into connected sight. See Astra S3 sight integration report.
- [x] Bounded connected CPU sight reference: E3-S3-E3 region/range transport,
  analytic E3 hits, honest S3 surface-candidate refusal.
- [x] Independent composed-query audit (MUSE-52) and connected CPU diagnostic
  images reviewed. Chart exits remain explicitly unresolved.
- [x] Whole-segment S3 cell exclusion helper and mathematical contract.
- [x] Independent helper audit MUSE-53 accepted; see docs/qa/muse-log.md.
  Connected E3/S3 GPU implementation is now working. H3 precision/traversal
  review remains open in the current milestone; screening is not formal proof.

Current lead handoff: [NEXT_SESSION.md](docs/engineering/NEXT_SESSION.md).
Region-owned motion is implemented under
[REGION_MOTION_CONTRACT.md](docs/engineering/REGION_MOTION_CONTRACT.md), with
[Claude's current assignment](docs/engineering/CLAUDE_NEXT.md).
The CPU motion coordinator, correction resumption and first single-floor S3
walking policy are implemented and audited. The connected editor now renders
E3/full-S3 portal chains and supports flight; general cross-region walking and
H3 GPU admission remain separate work. The bounded S3 room editor also remains
a reference for authored-floor walking and Boolean architecture.
Use [TASK_ROUTER.md](docs/engineering/TASK_ROUTER.md) for focused reading.

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
- [x] Curved CPU balls: H3/S3 metric advancement, transport, distance and normals.
  H3 GPU support is tracked in the current milestone above.
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
- [x] Roll through a tilted aperture. The lab's camera kept a yaw and a pitch
  and rebuilt from a world up, so `aimAlong` silently dropped roll -- correct
  for a walker whose up is the world's up, wrong the moment a portal is set in
  a wall. `engine/world/camera-frame.js` carries a full frame instead: it
  matches the old `basis()` to 2.22e-16 over 153 look angles in E3, and picks
  up holonomy on a sphere to 3.25e-17 against l'Huilier. The lab is wired to
  it, and a transit now maps all three vectors through `portal.mapVector`.
  90 GPU checks. The pitch clamp is the one world-up assumption left and it is
  documented where it sits.
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
- [x] **Collision is geometry-agnostic.** `collision.js` consumes
  `createMetricSpace`; `e3Space()` is that adapter with `kind: 'e3'`, so no
  caller changed and every existing E3 test still passes -- which is what
  makes the refactor faithful rather than merely green. Points are no longer
  assumed to be three numbers, the metric takes the point it is evaluated at,
  and a sweep carries a vector ALONG THE PATH rather than between endpoints
  (endpoint transport follows a geodesic the probe never travelled; in E3 the
  two agree, which is why it was invisible). `curved-collision.test.js` runs
  the solver against a metric ball in S3, checked against great-circle closed
  forms.
- [ ] **The camera, and portal tests on curved segments.** The camera still
  discards roll, and `firstCrossing` still assumes a straight segment between
  two points. Both have to move behind the adapter before the S3 room.
- [x] **The S3 field exists and has been walked.** Astra had already built it
  (`sphereField` / `sphericalPrimitive` in `region-world.js`) and nothing
  exercised it. `s3-room.test.js` now does, against independent closed forms.
  The strongest is the FLAT LIMIT: the same authored room at curvature radius
  10000 agrees with plain Euclidean arithmetic to **1.35e-8**, which catches a
  missing or inverted curvature radius, a chord used where an arc belongs, or a
  face built at the wrong angle -- none of which the fixture's own numbers
  would reveal. Also pinned: the ball exact along a great circle, cell faces at
  the authored ARCLENGTH along the cell's own construction axis, the bound
  never overestimating, and up varying from point to point as it must.
- [x] **Walk through a spherical doorway.** The discriminating pair: one ray
  finds the opening and reaches the back wall, one meets the wall beside it and
  stops outside. The solver is unchanged from E3 -- this is what the metric
  seam bought.
- [x] **THE PHANTOM SURFACE OF A CARVE: the rule is known.** Where a carving
  solid extends past the solid it cuts, `max(d, -m)` reports the distance to
  the CARVER's boundary -- a surface in open air belonging to nothing. Still a
  valid bound, still invisible, but a walker reads a clearance from it and
  stops dead. MUSE-33 swept it and the overhang rule turned out to be one case
  of something simpler: **a walk passes iff, everywhere the target is within
  r, the cutter's boundary is farther than r from the path.** Walk in centred
  and square and the mouth is nearest, which reproduces "overhang by more than
  2r" (0.5 blocks, 0.7 walks, at r = 0.25). Walk in at an angle and a SIDE
  face is nearest instead -- and no overhang moves a side face, so some
  doorways have no safe overhang at all. 372 configurations, predicate and
  solver agreeing on every one. See the rendering contract.
- [ ] **The editor should check that predicate** before the player walks, and
  say which face is the binding one -- the way it now names coincident faces.
  Refuse when no overhang can clear the walk; warn when the mouth is merely
  short. Wants a path to check against, so it lands with the room in the
  editor.
- [ ] **The S3 subset remainder**: oriented great-sphere half-spaces, the
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
- [x] **Warn on coincident faces** -- and the interesting part is what the
  warning turned out to be. The obvious design was "warn when two surfaces come
  within X", and MUSE-31 measured that there is no such X: at an offset of
  1e-12 the field is already clean, and at exactly zero it reports
  `status: 'indeterminate'` rather than guessing. Coincidence is a DISCRETE
  condition, not a proximity, so any threshold would have been a number
  invented to fill a slot.
  Two further things had to be true before a warning was useful. Sharing a
  PLANE is not a defect -- a crate resting on the floor has its bottom face in
  exactly the floor's plane, which is what resting on something means, and the
  shipped fixture has six such pairs. And an exposed shared plane is not enough
  either: in that fixture the wall's bottom face is in the floor's plane and
  exposed inside the doorway, but its material there has been carved away, so
  only one solid claims the surface.
  So `coincidentFaces()` takes candidates from the document EXACTLY (equal face
  planes, no tolerance anywhere) and confirms each by asking the field, which
  answers with the flag rather than a distance. Every shipped fixture reports
  none; the sill reports the pair by name.
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
