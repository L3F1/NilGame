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

## Play: the moving probe

**Play from spawn** walks a finite-radius probe through the same compiled scene
the preview draws. WASD moves, Space and Shift go up and down, the mouse looks,
Esc stops. The probe starts at the authored spawn and its radius is the
document's `units.playerRadius`.

`engine/world/collision.js` is the solver, and it is host-free: it consumes only
the two capabilities `docs/rendering-contract.md` already defines -- a distance
BOUND and a surface NORMAL -- so anything that answers those can be collided
against, in any geometry. It never reads the document or a host transform.

It advances conservatively: each step moves by a distance it has just proved is
free, so **it cannot tunnel at any speed or time step**. A single 1000-unit step
still stops at the ball's surface; a point test at both ends of that step would
report empty space, because both ends *are* empty space. The cost is the
sphere-tracer's usual weakness -- a path nearly parallel to a surface converges
without arriving -- which is bounded and reported as `stalled`. A stall leaves
the probe SHORT, never inside, which is the safe direction to fail.

`distance` must be a true lower bound (1-Lipschitz). A field that overestimates
lets a step jump through geometry.

There is no gravity and nothing to stand on. **The grid is a drawing aid, not
scene content**: the document has no floor entity, so adding one to the
collision field would make the picture and the physics disagree. The ball is
the only obstacle. Gravity and ground arrive with an authored floor primitive.

## The edit/play transaction policy

Chosen explicitly, because the alternative is choosing it by accident:

- **An edit is never refused because of where the player stands.** Authoring
  wins; being unable to grow a ball while standing in it is the worse rule.
- If the edit leaves the probe overlapping, it is **pushed out** along the
  surface normal, and the status line says so.
- If it cannot be pushed -- the dead centre of a ball, where every direction is
  equally "out" and there is no honest normal -- the probe **respawns**.
- Undo and redo reconcile the same way. Stepping back to an older, larger ball
  can swallow the player just as a forward edit can.

`resolveOverlap` reports `clear` / `pushed` / `trapped` and the host decides.
The engine supplies the mechanism; the policy above lives in `app/ball-lab.js`.

There is no gizmo, object selection, second region or connected region here
yet. The preview camera in edit mode does not use the saved spawn.
Region extent is an authoring bound, not a wall. This experiment does not
establish native physics, networking or whole-game parity.

## Checks and measured limits

```sh
node ball-scene.test.js
node collision.test.js
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

2026-09-09, the probe: `collision.test.js` 21 cases, every expectation an
independent closed form (a probe of radius r meets a ball of radius R at
|p - c| = R + r, so contact distances are solvable by hand rather than by
running the solver twice). Covers the analytic contact distance, a 1000-unit
single step, a grazing stall, resting contact over 200 steps without leaking,
sliding at an oblique contact, and the three overlap outcomes. The browser
`--ball-lab` check grew from 9 to 17 and now drives the probe through the real
DOM controls, including walking into the ball and an edit that swallows the
player. `BALL_FIRST_PERSON_GLSL` is a separate program from
`BALL_PREVIEW_GLSL`, which stays the fixed-viewpoint artifact the Godot export
and the parity fixtures depend on.
