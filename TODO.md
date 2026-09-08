# Connected-geometry engine and editor roadmap

The engine and authoring workflow are the product direction. Build small
first-person levels to test each capability. Game-mode expansion is secondary.
The previous backlog is preserved in
[docs/archive/gameplay-backlog.md](docs/archive/gameplay-backlog.md).

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

Rendering parity is MET: 13/13 fixture views on both Godot backends, bounded
H3 agreeing to 0.0005 of 255 per channel, and shader preparation 8444 ms in
the browser against 721 ms native. It cost one real shader bug, latent in the
browser build and only findable with a second compiler; see
[docs/decisions/001-runtime-strategy.md](docs/decisions/001-runtime-strategy.md).
Authoring and networking are untested, and they are the reason for the
direction change, so the host decision stays open.

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

- [x] Finish Nil menu, HUD, six-gate climb and collision integration.
- [x] Verify a climb from rest through all six gates with actual movement/collision.
- [x] Fix Nil ray direction across local-frame restarts and check GPU flow against JS.
- [x] Add a tested Sol numerical kernel and coordinate-plane distance fields.
- [x] Render Sol with bounded incremental integration; add a small navigable level.
- [x] Implement and verify the universal-cover SL2R kernel, then its renderer/level.
- [ ] Sol/SL2R: long-ray convergence, exhaustion diagnostics and frame-time profiling.
- [ ] Sol/SL2R: sliding collision, transported camera frames and objective courses.

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
