# Editor readiness: scene-v1 ball trace — MUSE-05

Accepted baseline inventory, preceding the lead's E3 ball adapter. Current
implementation coverage is in [the ball-lab guide](../ball-lab.md); the missing
paths below describe the reviewed baseline, not today's whole working tree.

Traced entity: `flat-ball` (ball, `[0.5, 0, 0]`, radius 0.1, region
`flat-lab`) in `levels/fixtures/connected-lab.nil.json`. Measured facts
first; suggestions and open questions marked at the end.

## The path, stage by stage

1. Validation: `parseScene`/`validateScene`
   (`engine/world/document.js:28-95`). Ball kind allow-listed (:55);
   position must be 3 finite numbers (:56-57); radius positive (:58-60);
   center + radius must fit the chart extent (:61-63). Unknown fields,
   versions, kinds and bad coordinates throw explicitly. No repair.
2. Prepared coordinates: `prepareScene` (`document.js:102-109`) revalidates,
   rebuilds each region chart and `decode`s the radial tangent offset into
   a 4-component ambient model point, returned in an in-memory `points`
   Map. Authoring offsets are not model points (`docs/scene-format.md:44-49`).
3. CPU distance evaluation: MISSING. `prepareScene` is consumed by
   `tools/scene-check.js` and `engine-foundation.test.js` (both import
   it; nothing else does). No collision adapter exists; `charts.js`
   `distance` is intrinsic chart distance, not an obstacle field. The
   closest existing primitive path is authored, not scene-driven:
   `level.js` `ORBS` (:62) → `ORB_POINTS` (:165) with CPU radius
   subtraction (:272-273) mirrored in GLSL (:432-433). Those orbs are
   level data with a working CPU/GPU pair — not scene-v1 entities, and
   not just player/blast effects — so an adapter has a pattern to copy.
4. Browser shader data: MISSING. `level.js` + `shader.js` are driven by
   level data, not scene documents; `main.js` has no scene loader and
   `document.js:101` states rendering/collision need separate adapters.
5. Godot export: `tools/godot-export.js` emits h3 + s3 shaders and a
   `nil-render-fixture` `views.json` (:10, :53-107). Each view carries
   camera, rendering-setting and marker-count uniforms (`uPlayer`,
   `uFog`, `uAO`, `uMarkN` …) but no scene-v1 entity feed; actual native
   coverage is two geometries' render fixtures, not the eight-world
   browser list.
6. Runtime uniform upload: exists but is fed by fixtures, not scenes.
   `experiments/godot/main.gd:61-69` uploads each view's uniforms
   (`uPlayer` → Projection, `uRes` → Vector2, `uMarkN`/`uCutN` → int)
   as shader parameters;
   `main.gd:72` labels it a rendering experiment with no movement,
   collision or editor.

## Authored data vs constants vs uniforms (today)

- Authored: ball `position` + `radius` in scene JSON (design units).
- Emitted, in-memory only: `prepareScene` model points (never serialized,
  never uploaded).
- Editable uniforms: none for scene balls. The only uniform-upload path
  (`main.gd` `select_view`) serves fixture cameras.

## Factual blockers to editing one ball live

1. No scene loader in the browser app; no render adapter scene→SDF.
2. No collision adapter; ball-vs-world distance has no implementation.
3. Godot side has no entity/uniform concept for balls; `views.json`
   carries no scene-v1 entity feed. Portal traversal is unimplemented
   on both sides (`scene-check.js:21`).
4. Schema scope: v1 `cover` topology only; quotients and product
   authoring charts rejected (`scene-format.md:34-37`).

## Baseline reuse

`node tools/scene-check.js` run directly for this revision (no pipe):
identical output to the overnight baseline (2 regions, 6 entities,
1 portal; radial 1.0000, transverse 0.8415), `SCENE_CHECK_EXIT=0`
captured via `;`, so this is the tool's own status. Inputs unchanged —
none of `document.js`, `charts.js`, `scene-check.js` or the fixture
appear in the working-tree diff.

## Suggestions (not findings)

- Smallest vertical slice: a render adapter that turns one prepared ball
  point + radius into an existing level SDF call, keeping authored JSON
  the single source of truth.
- Open: whether Godot should receive entities via extended `views.json`
  or a separate scene manifest; who owns unit conversion (documents
  intentionally avoid meters, `scene-format.md:23-25`).
