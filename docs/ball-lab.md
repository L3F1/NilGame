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

### The floor is authored, and gravity stands on it

`levels/fixtures/room.nil.json` adds a **plane** entity: a half-space with a
unit `up` normal, solid on the side the normal points away from. The renderer
draws that entity and the collision field is built from it, so **what you see
and what you stand on are the same half-space**. A scene with no plane draws no
floor. `ball-lab.nil.json` is unchanged and still has none -- it is what the
Godot parity artifacts are built from.

`engine/world/walker.js` adds gravity and ground contact on top of the
collision contract. It is separate from `collision.js` on purpose: which way is
down, what counts as ground and whether you may jump are gameplay policy, not
facts about the metric.

- **Down is a parameter**, always. E3's obvious answer is -z and that is the
  default, but H3 admits no invariant unit-gradient height function at all, so
  `up` is passed in and a test drives the whole walker upside down against a
  ceiling to keep that honest.
- **Grounded is a contact test, not a height test.** Asking "is z small" needs a
  floor in a known place; asking "did I touch something facing up" works for a
  ramp, the top of a ball, or a ceiling you stand under in another geometry.
- A resting probe stops accumulating downward speed. Without that, `vz` grows
  the whole time you stand still and the first step off a ledge fires you down
  at the speed banked over those seconds.

Gravity is a checkbox. With it off the probe flies, which is still the only
sensible mode in a scene with no plane to stand on.

## The edit/play transaction policy

Chosen explicitly, because the alternative is choosing it by accident:

- **An edit is never refused because of where the player stands.** Authoring
  wins; being unable to grow a ball while standing in it is the worse rule.
- If the edit leaves the probe overlapping, it is **pushed out** along the
  surface normal, and the status line says so.
- If it cannot be pushed, the probe **respawns**. Two configurations reach
  this: the dead centre of a ball, where every direction is equally "out" and
  there is no honest normal; and a **wedge** between two solids, where the
  nearest surface's normal points into the other one. Standing on the floor
  directly under a ball that is then grown over you is the second case -- the
  ball's normal points straight down into the floor, whose normal points
  straight back up, and a gradient push alternates for ever. `resolveOverlap`
  reports `trapped` rather than shoving the player through the floor.
- Undo and redo reconcile the same way. Stepping back to an older, larger ball
  can swallow the player just as a forward edit can.

`resolveOverlap` reports `clear` / `pushed` / `trapped` and the host decides.
The engine supplies the mechanism; the policy above lives in `app/ball-lab.js`.

## Authoring a scene, not a single ball

The entity list shows every entity with its kind; click one to select it. The
inspector shows only the fields that kind has -- a radius for a ball, a normal
for a plane, neither for a spawn -- and the selected ball is tinted gold **in
the world as well as the list**, so it stays findable while playing.

**Add ball** places one a few units in front of where you are looking, so it
lands somewhere visible rather than at the origin under the floor. **Add plane**
adds a ceiling you can then re-aim by editing its normal; the normal is
normalised for you, since demanding a unit vector by hand would be pedantry.
**Delete** refuses the only spawn, and says why: a scene needs somewhere to
start.

Balls and planes reach the shader as ARRAYS with a uniform count, looped over
once, rather than a branch per object. That is CLAUDE.md's link-time rule --
a branch inside a scene function is re-emitted everywhere that function is
inlined, and that multiplication is what once took a link from 5 s to 212 s.

There is no gizmo, no drag-in-the-viewport, no second region and no connected
region yet. The preview camera in edit mode sits at the spawn.
Region extent is an authoring bound, not a wall. This experiment does not
establish native physics, networking or whole-game parity.

## Checks and measured limits

```sh
node ball-scene.test.js
node collision.test.js
node scene-field.test.js
node tools/scene-check.js levels/fixtures/room.nil.json
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

2026-09-09, the floor and gravity: `scene-field.test.js` 20 cases -- the plane's
signed distance and exact ray hit, the union taking the nearest solid WITH its
own normal, a probe that lands and rests exactly its radius above the floor,
walking without sinking, a jump that is refused in mid-air, a ceiling walked
upside down to prove `up` is a parameter, and the wedge that is honestly
reported as trapped. The browser check is 23, up from 17.

Two bugs this step found in the code shipped just before it. Conservative
advancement stalls dead on a resting contact -- the safe step along a floor you
are touching is zero, so the probe could not walk at all; `moveProbe` now lifts
off the contact, slides, and settles back, all swept. And the lab's camera had
`right` negated, which negates `up` with it and rotated the view a half turn:
the floor drew ABOVE the horizon, which reads as a plane-equation bug rather
than a camera one. Both are covered by tests now, the second by an assertion on
the basis rather than by looking at a picture.

Not yet in the native host: `experiments/godot/ball_document.gd` accepts only
ball and spawn, so it REJECTS a scene containing a plane. That is the intended
behaviour for an unsupported feature rather than silent divergence, and adding
planes there is the next native task.

2026-09-09, multiple entities: `scene-field.test.js` is 26 cases -- fresh IDs
that never collide, additions refused whole, a second plane whose union takes
the nearer surface with its own normal, deleting the last spawn refused, and a
scene that loses its floor and is still a scene. The browser check is 35, up
from 23, and now drives selection, the per-kind inspector, add and delete.

Two bugs this step found, both invisible to the DOM assertions that existed:

- `<input type="number" min="0.01" step="0.05">` makes 0.4 an INVALID value, so
  the browser silently refused to submit and "Apply edit" did nothing for most
  radii anyone would type. All numeric inputs are `step="any"` now, and a check
  asserts the form accepts ordinary typed values.
- An author rule for `label` outranks the user-agent rule for `[hidden]`, so
  hiding a field stopped hiding it: a ball's inspector displayed a plane
  normal. The DOM said hidden and the screen said otherwise. Fixed with an
  explicit `[hidden]{display:none!important}`, and the checks now assert
  COMPUTED STYLE rather than the attribute. Only inspecting the render caught
  this one.
