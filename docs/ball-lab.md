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
`tools/ball-lab.html`. The **Fixture** menu picks the scene: `room` is a floor
and a ball, `portal-room` is a floor and two gates. `?scene=portal-room` in the
URL does the same thing, so a check or a bookmark can open straight into it. Use Apply edit, Undo/Redo, Save JSON and the file picker.
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

## Portals

A connection between two anchors compiles to two one-way apertures. An aperture
is a **hole, not a solid**: the field must not report it as something to
collide with, and a scene with an aperture narrower than the player is refused
when it is compiled rather than when somebody walks into it.

Walk into `portal-room`'s gate and three things happen together, all from one
map:

- the **probe** crosses mid-step, inside `sweep`, so the crossing is found at
  the right point along the path rather than on a chord through the frame;
- the **velocity** is carried through by `portal.mapVector`, and the arclength
  travelled counts the whole way -- a portal is a shortcut through the
  manifold, not free distance;
- the **camera** is carried through by the host, because the camera belongs to
  the host and the engine does not have one. `stepWalker` returns `transits` so
  the host can do it; the lab's `aimAlong` is that host code. Skipping it is
  not subtle: the walker emerges facing back the way they came and re-crosses
  immediately, measured at 70 transits in 200 steps.

Seeing through a portal uses the SAME map, as numbers: `portal.matrix` is the
linear part as a column-major 3x3, uploaded as `uPortalMap`, and the shader
reconstructs `mapPoint` as `exitCenter + M * (p - center)`. A second,
hand-written derivation in the shader would let the picture show one room while
the walker arrived in another -- the worst kind of portal bug, because both
halves look right on their own. `portal.test.js` asserts the matrix against
`mapVector`, and the browser check asserts it again in the page.

Refusals are reported, not hidden. If emerging would put the probe inside
geometry, the transit does not happen: the aperture behaves as the wall it is
set in, the walker stops at the near face, and `blocked` says which portal
refused so the lab can print why.

### Authoring one

**Add portal** creates both apertures and the connection in one step, in front
of where you are looking. A portal is one thing to an author, so it is one
transaction here: the pieces could be added separately -- two loose anchors
validate fine -- but then an undo leaves one end behind and the author has to
know that a portal is three objects.

Editing an aperture's **radius moves both ends**, because the schema pins them
equal and there is therefore no valid document in between. That is what
`editEntities` is for: apply every patch, then validate once. Widening one end
and then the other would reject the author's own halfway state, and the fix is
not to relax the rule -- it is to stop pretending a two-ended thing is edited
one end at a time. Position and forward stay local to the end being edited;
only the radius travels.

`up` is re-derived from `forward` rather than typed, since the schema requires
them orthonormal and handing an author two vectors to keep consistent by hand
is a trap. The one chosen is the up nearest world up, so a wall portal's up
still points up.

**Delete** on either end removes the whole portal. `removeEntity` refuses a
connected anchor and says which portal is in the way -- the validator would
otherwise report an unknown anchor, which is true and useless, because it
describes the wreckage rather than what the author did.

Known limit: `aimAlong` recovers yaw and pitch and therefore **drops roll**.
That is correct for a walker whose up is the world's up and wrong the moment an
aperture is tilted, so it is a limit of this camera and not of `mapVector`.

## Boxes

`kind: 'box'` is three half-extents from a centre, and it is a PRIMITIVE
rather than sugar over six clipped planes. The distinction is the whole point.
Six clips describe the same solid correctly, and every clip is a `max`, which
under-reports near a concave seam -- so the six-clip build can only promise a
BOUND on the exterior distance, which is the number a sphere tracer steps by.
Measured on a 2x4x2 box, the clipped construction under-reports by up to 1.0
unit where the primitive is exact; that shortfall is what a marcher pays for,
one short step at a time.

(The original argument here added "and one bound anywhere makes the whole
scene marched". That WAS true and is no longer: each additive solid now
compiles with the modifiers that apply to it and ray intervals resolve
analytically per group, so one carved wall does not cost every untouched ball
its closed form. The case for the primitive did not depend on it -- the
shortfall above is the case.)

**A box can be turned, and the schema is careful about what that means.**
Scene v2 gives an entity an optional `frame` of orthonormal `forward` and
`up`. That is a CONSTRUCTION frame -- it says how the shape is built at its
own centre -- and it is deliberately not a claim that turning the shape is an
isometry of the surrounding space.

The distinction earns its keep immediately. In E3 the two coincide, so an
oriented box is just a box you turned. In Nil or Sol there is no isometry
carrying an axis-aligned box to a tilted one OF THE SAME SHAPE, so a frame
there would be a promise the geometry cannot keep. The schema therefore stores
the frame and lets each geometry say what it honours: E3 boxes take arbitrary
rigid orientations, S3 gets an explicitly named `geodesic-cell` built from a
centre, a frame and face offsets rather than a silently reinterpreted box, and
Nil and Sol stay unsupported until their adapters define and verify them.
Changing a region's geometry never silently distorts an object.

A v1 document loads unchanged with identity orientation; `upgradeScene`
migrates explicitly rather than re-embedding anything.

The renderer derives the third axis by the same cross product the field uses,
rather than being handed it. Two places computing a basis is two places that
can disagree about handedness, and a flipped axis mirrors the box on screen
while collision keeps the original -- a divergence no Node test can see, which
is why `page-check --ball-lab` renders the same crate twice, once turned, and
requires the picture to change.

**Carve a box with a box.** The `Carve` button matches the cutter to the
target, because cutting a rectangular doorway with a ball leaves a
round-topped hole and an author who wanted a doorway has to undo and start
over.

**Watch for coincident faces.** The `box-room` fixture first drew a speckled
line across its doorway sill: the carving box's bottom face sat at exactly
z = 0, in the same place as the ground plane, and the marcher had no way to
say which surface it was on. Sinking the cutter 0.2 below the floor fixed it.
Nothing numeric caught this -- only the picture did.

## Carving and clipping

Select a ball or a plane, press **Carve**, and a subtracting ball appears in
front of you TARGETING what you had selected. Carving with nothing selected is
refused and says what to do, because the alternative -- a global carve -- takes
the floor out from under the doorway and leaves the author standing over a hole
wondering what they did.

The entity list marks a carve with what it cuts (`ball minus ground`), and the
readout says when the field has stopped being exact:

    2 solids, 1 portal, 1 carve (distance is a bound). Player clearance 0.412

**Clipping is the other half.** `op: 'intersect'` keeps the part of its target
that is also inside the clipping solid, which is how a wall becomes a slab you
can walk through: one clip, rather than a carve whose job is to undo most of
the first plane. The two operations share one path and differ only in sign --
`max(d, -m)` keeps what is outside, `max(d, +m)` keeps what is inside -- and
that single line of difference also decides the normal, because a carved face
is the modifying solid seen from INSIDE it and a clipped face is the same solid
seen from outside.

A global clip is REFUSED. Subtraction without a target removes material, which
is visible and recoverable; intersection without one deletes everything OUTSIDE
itself, and for a plane that is half the world. Same shape of operation, very
different blast radius when it is a mistake.

That readout is not decoration. A modifier changes what the field PROMISES,
and a solver that trusted the old promise would be trusting a lie. What
changes is narrower than it used to be, because one word was making several
claims at once: `exteriorDistance` drops to a bound, `interiorDistance` to a
magnitude bound, and `interiorSign` -- "am I inside something", which is what
collision actually asks -- stays exact through every operation. See the
[rendering contract](rendering-contract.md) for the full table.

The renderer follows the same split rather than approximating it. With nothing
carved it takes the exact closed-form path it always did, so an uncarved scene
is drawn by exactly the route it was before. With something carved it
sphere-traces the boolean expression, because a closed form would happily
return a surface that has been cut away.

**The march bound is a uniform, not a constant, and that is not a style
choice.** The D3D compiler unrolls every countable loop, so a literal `160`
would paste the whole scene function 160 times and the link would not return --
this is the 212-second failure CLAUDE.md records, in a new place. A uniform
bound is opaque to it. Measured cold on a real GPU: 1.8 s for the page against
0.9 s before, with the check count up from 57 to 69.

## Checks and measured limits

```sh
node ball-scene.test.js
node collision.test.js
node scene-field.test.js
node tools/scene-check.js levels/fixtures/room.nil.json
node tools/scene-check.js levels/fixtures/ball-lab.nil.json
node tools/shader-check.js
node tools/sdf-check.js
node tools/scene-check.js levels/fixtures/portal-room.nil.json
node portal.test.js
node tools/page-check.js --ball-lab --timeout=60
```

`page-check` writes a PNG whenever the page returns one, to `$SHOT` or
`page-check-shot.png`. Every numeric check above passes happily on a view that
is upside down or that draws the near room twice; only looking catches that,
and it already had to once.

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

2026-09-09, portal transit (kernel only, not yet in the lab UI):
`engine/world/portal.js` builds aperture descriptors and the transit isometry
from two anchors; `sweep` crosses them mid-step. `portal.test.js`, 16 cases,
checks the map as an ISOMETRY -- distances and angles preserved, one aperture
carried onto its partner -- rather than against a second copy of itself.

Three contracts worth knowing before using it:

- **A transit rotates the world, so the HOST must carry its heading through the
  same map.** `want` is a world-space direction; a walker that keeps asking for
  the same one after a transit is asking to walk back the way it came.
  Measured: 70 transits in 200 steps, ping-ponging between the two gates.
  `stepWalker` and `moveProbe` return `transits` precisely so a host can map
  its camera by `transit.portal.mapVector`.
- **`mapPoint` and `mapVector` are separate on purpose.** Putting a direction
  through the point map adds the portal's displacement to something with no
  position -- silent, and wrong by the gate separation.
- **Never land exactly on the aperture.** The traveller emerges at height zero
  on the exit plane and the next sign test can read either way, sending them
  straight back; the exit is eased by a skin, exactly as the H3 marcher does at
  a fundamental-domain face.

Blocked exits refuse the transit and stop at the near aperture, so the gate
behaves as the wall it is set in rather than depositing the player inside rock.
An aperture narrower than the player is refused when the scene compiles, not
discovered by walking into it.

2026-09-09, portals in the lab: `portal.test.js` 17 cases, the map checked as
an ISOMETRY -- distances and angles preserved, one aperture centre carried onto
the other -- rather than against a second implementation of itself, because a
portal that agrees with its own inverse can still be the wrong portal. The
browser `--ball-lab` check grew from 35 to 45 and now walks a portal room
end to end: one transit, out at the far gate, camera turned, still grounded,
never sunk. Real GPU, cold shader cache, 0.7 s.

One defect this step found in code shipped before it. Pointer lock is a
REQUEST, not a right -- the browser refuses it outside a user gesture, and in
newer Chrome that refusal is a rejected promise rather than a thrown error, so
`canvas.requestPointerLock?.()` left it unhandled and the page reported itself
as broken when nothing was wrong. Play worked the whole time; only the mouse
stayed free.

Not done AT THAT DATE, and superseded by the authoring section above and the
later entry: a portal could not then be authored in the lab. It can now. The
apertures are E3 only, and the map is an isometry of one space; a portal
between two different geometries is the same shape of object with a map that is
a correspondence rather than an isometry, and `portal.js` is where that goes.

2026-09-09, authoring: `portal.test.js` 24 cases, the browser check 45 -> 57.
The added cases are about transactions rather than geometry -- a refused
`addPortal` leaves no orphan anchor, a refused `editEntities` leaves the source
byte-identical, deleting one end is refused by name, and a portal built by
`addPortal` is WALKED through rather than merely validated, because an editor
that produces scenes the engine cannot play is worse than one that refuses the
edit.

One thing the tests taught, worth keeping: `addPortal`'s defaults put an
aperture at the origin, which in `room.nil.json` is inside a 0.9 ball. The
field does not refuse that -- an aperture buried in a solid is exactly what a
portal in a WALL is -- so the test places its gate in clear space rather than
relying on a refusal that would be wrong to add.
