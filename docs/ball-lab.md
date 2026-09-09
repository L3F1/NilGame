# Editable ball experiment

The first scene-v1 authoring slice runs in Godot and the browser. Change one
E3 ball's position/radius, undo/redo, and save/load its JSON. The same document
feeds the visible surface and a signed-distance query. Editing updates uniforms;
it does not rebuild the shader.

## Open it

From the repository root:

```sh
node tools/ball-lab-export.js
```

Open `experiments/godot/project.godot` in Godot, open `ball_lab.tscn`, and
press **F6** (run current scene). F5 still opens the existing H3/S3 rendering
reference. The inspector is part of this running experiment, not a Godot editor
plugin. Z is up. Save defaults to Godot's `user://ball-lab.nil.json`; the path
box also accepts an absolute path. Load is undoable. Invalid loads/edits retain
the previous valid scene.

For the browser reference, serve the repository as usual and open
`tools/ball-lab.html`. Use Apply edit, Undo/Redo, Save JSON and the file picker.
Files saved by Godot use the same format and can be loaded here and vice versa.
The original fixture is never overwritten by the browser download action.

## Data and query contract

- Input: `levels/fixtures/ball-lab.nil.json`, validated by scene v1, restricted
  to one E3 cover region, one spawn, one ball, and no connections.
- `engine/world/ball-scene.js` owns an immutable compiled snapshot. Failed
  edits do not mutate the original. IDs and region ownership survive edits.
- `distance(p)` is signed E3 distance to the surface; negative inside.
  `normal(p)` is outward and unit length, undefined (`null`) at the center.
  `rayHit(p,u)` requires a unit direction and returns the first occupied
  arclength: zero inside, `Infinity` on a miss. It is not an exit-surface query.
- `engine/geometry/ball-shader.js` supplies the WebGL field/intersection and
  preview source. Export translates its entry point for Godot. Both hosts
  upload center/radius as one uniform, preserving authored JSON separately.
- `experiments/godot/ball_document.gd` is a small native adapter for exactly
  this subset. Its validation and CPU query are a second implementation,
  checked against JS samples; they are not a full port of the scene engine.
  Scalar document values and full-precision JSON avoid rounding through Godot
  vectors during editing. Vectors are used at the rendering/query boundary.

The origin-distance readout exercises the field needed for collision. There
is no moving player, collision solver, gizmo, object selection or connected
region here yet. The fixed preview camera does not use the saved spawn.
Region extent is an authoring bound, not a wall. This experiment does not
establish native physics, networking or whole-game parity.

## Checks and measured limits

```sh
node ball-scene.test.js
node tools/scene-check.js levels/fixtures/ball-lab.nil.json
node tools/shader-check.js
node tools/sdf-check.js
node tools/page-check.js --ball-lab --timeout=60
```

Windows native rendering check (replace the executable path):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/ball-lab-check.ps1 -Godot 'C:\path\Godot_console.exe'
node tools/scene-check.js experiments/godot/results/ball-lab/saved.nil.json
```

The native check opens a hidden real GPU window, exercises inspector callbacks,
undo/redo, save/load, atomic rejection and uniform updates, and saves
`experiments/godot/results/ball-lab/editor.png` plus `report.json`. Headless
Godot's dummy renderer would not prove that the preview renders.

2026-09-09: browser editor 9 checks; native editor 10 checks, including 80
CPU samples (worst difference 1.47e-7). The WebGL field/first-hit check samples
3,072 points (worst 7.33e-7, tolerance 2e-5). Native image visually inspected.
These are numerical and functional checks, not pixel-perfect native/browser
image parity or an input-latency benchmark. Analytic E3 center/surface/ray
identities provide checks independent of cross-runtime agreement.
