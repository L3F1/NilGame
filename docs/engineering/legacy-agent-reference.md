# Hyperbolic grapple game, in a 3-manifold

## Current direction (2026-09-07)

Active direction: an engine/editor for connected geometries, with small levels
as experiments. Follow `TODO.md`, `docs/architecture.md`, `docs/scene-format.md`
and `docs/decisions/001-runtime-strategy.md`. Historical gameplay priorities
below do not override that roadmap; numerical and verification rules remain.
The old README tour is preserved in `docs/playground.md`.

Evaluate Godot as a native host before building the full editor; retain the
web app as a reference until parity is tested. New portable modules live in
`engine/`, browser UI in `app/`, presets/fixtures in `levels/`. Scene v1 and
radial E3/H3/S3 mapping currently run only in tools/tests. Mixed-geometry
rendering, portal transit and the S3 bubble remain future work.

The per-world design rationale and the gameplay kit were archived on
2026-09-07 into [docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md)
and [docs/archive/gameplay-kit.md](docs/archive/gameplay-kit.md), to keep this
file to the rules. **Every trap from them was kept**, under "Traps in the
archived subsystems" below; go to the archive for the reasoning behind one.

Separate metric, topology, region ownership and connection policy. Reject
unsupported document features explicitly. Run `node tools/scene-check.js`
after document/chart changes, plus the existing regression checks.

## What this is

A game set in a **hyperbolic 3-manifold**: H^3 of curvature -1, quotiented by
a discrete group — plus five other spaces that each exist to make one thing
possible that H^3/Gamma cannot: S^3 (`s3.js`), the products H^2 x R and
S^2 x R (`h2r.js`, `s2r.js`, both on `product.js`), and the flat 3-manifolds
E^3/Lambda (`e3t.js`), which are the CONTROL — the only world here where a
ported map is the map, and the one the other five are measured against.
**Not every mode needs a quotient**, and three of the six deliberately have
none. Movement, gravity, rendering and a grapple hook, all done honestly in the
geometry. Nil has returned as a separate six-gate spiral climb (`nil.js`).

All eight geometries now have navigable experiments. **Sol** and **SL~(2,R)**
are bounded flight labs; see `docs/lie-labs.md` for their limits and checks.
Their packed positions are not isometry matrices: never use H3 transforms on
them. The historical "three that are left" discussion predates these additions.

Nil traps: carry the geodesic direction when rebasing a ray; test GPU flow
with `tools/sdf-check.js`. Columns collide, decorative beacons do not (the
finish gate lies inside one). Course rings must match the crossing discs.

The developer's background is AP CS (Java). Assume comfort with loops, arrays,
recursion and OOP; assume no prior JavaScript, WebGL, GLSL or differential
geometry. Explain graphics and geometry concepts when they come up. Do not
explain what a for loop is.

docs/playground.md carries the tour: what the geometry feels like, why a horosphere
floor was rejected, how the abilities read in play. This file is the working
rules — the things that cost hours to find out.

## Stack

Plain JavaScript ES modules + WebGL2 + GLSL. No framework, no bundler, no npm.
Served by the VS Code Live Server extension. Tests run under Node.

Keep it this way. Do not add React, Vite, TypeScript, three.js or a package
manager unless explicitly asked. The renderer is a single full-screen fragment
shader; a scene-graph library would hide the parts that matter.

## Files

- `hyp.js` — the geometry. Minkowski form, Lorentz matrices, geodesics, exp and
  log, the height function, both groups, closed geodesics. **No graphics code
  in this file, ever.**
- `level.js` — the level, written once as data and emitted twice: a JS SDF for
  the physics and a GLSL SDF for the renderer. Edit the arrays, never the
  emitted numbers.
- `physics.js` — gravity, integrator, collision, walking, grapple, portals,
  boomerang. No DOM, so it is testable.
- `shader.js` — the GLSL as strings. DOM-free so tools can import it.
- `net.js` — the packet format and the WebRTC connection. Nothing browser-only
  at module scope, so it imports under Node and `physics.test.js` covers the
  packing. **No DOM**; the panel that drives it lives in main.js.
- `geom.js` — the same mathematics as `hyp.js` with the CURVATURE left in as a
  parameter, so E^3 (flat), H^3 and S^3 (spherical) come out of one set of
  formulas. **`hyp.js` now delegates its primitives to this**, so the
  arithmetic exists once. See "One geometry, three curvatures" below.
- `s3.js` — the SPHERICAL world and free flight in it, built on `geom.js` at
  k = +1. The scene is written once as data and emitted twice (a JS SDF and a
  GLSL one), exactly as `level.js` does. **No DOM**, so it is testable. It is a
  FLYTHROUGH, not the full kit: `physics.js` is built on `hyp.js` top to
  bottom, and making that curvature-generic is a rewrite of the load-bearing
  file. The two paths meet only at `player`, which is a 4x4 either way.
- `product.js` — SURFACE x R with the surface's curvature left in, so H^2 x R
  and S^2 x R come out of one set of formulas and E^2 x R = E^3 is the
  degenerate control. This is to `h2r.js` and `s2r.js` what `geom.js` is to
  `hyp.js`. A product is NOT a space of constant curvature, so `geom.js`
  cannot make one: it is built on `<x,x> = k` and one trigonometry, and a
  product has neither. **No DOM, no graphics.**
- `h2r.js` — H^2 x R and the DROPPER it exists for: a hyperbolic floor plan
  and a Euclidean height, which do not interact. `product.js` at kS = -1, plus
  the shaft, the column field and the course. See
  [docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md).
- `s2r.js` — S^2 x R and the LAP COURSE: a spherical floor plan and the same
  Euclidean height. `product.js` at kS = +1, plus the world, walking, jumping
  and the course. The first world here with a compact floor AND honest
  gravity. See
  [docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md).
- `e3t.js` — the FLAT 3-manifolds, E^3 quotiented by a lattice. `geom.js` at
  k = 0 plus a rectangular lattice, two worlds mirroring the two hyperbolic
  ones exactly (slab and 3-torus), a floor plan, walking and a course. The
  CONTROL, and the only world where a ported map is the map. **No DOM, no
  graphics.** See
  [docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md).
- `engine/geometry/registry.js` — the geometry registry: key, option label, shader id, program
  name. `shader-check`, `link-time` and `world-probe` all iterate it, so
  registering a geometry is most of adding one.
- `engine/runtime/world-motion.js` — the motion adapter per geometry: spawn, input model,
  course and step. `h3` is null and means "the full physics.js path"; every
  other world's integrator lives behind one of these. **No DOM.**
- `levels/presets.js` — the presets, by name. `app/menu.js` — the DOM for the world
  browser, and nothing else.
- `port.js` — reading a FLAT map as a map of a curved space. Three classical
  embeddings, each exact in one property and wrong in the others, plus the
  measurements that say which. No graphics, no DOM. See "Porting a flat map"
  under Level authoring.
- `legacy-hyp.js` — the pre-delegation implementations, frozen, **for tests
  only, never imported by the game**. The moment `hyp.js` started delegating,
  the test "geom.js agrees with hyp.js" became a tautology that would pass
  whatever either did. The comparison is made against this instead.
- `modes.js` — game modes: rounds, timers, ordered checkpoints, and the hoop
  course. **No DOM**, like physics.js, because this is the part with rules in
  it and rules are worth testing. Hoops are drawn as LINE LOOPS by main.js, not
  as shader primitives — a curve in `sceneMap` would be inlined three times and
  cost link time, which is the budget that binds.
- `main.js` — WebGL2 setup, input, frame loop, rope drawing, the options menu.
- `index.html` — canvas, HUD, and a boot-error panel (see below).
- `hyp.test.js` (36), `physics.test.js` (160), `modes.test.js` (78),
  `geom.test.js` (69), `s3.test.js` (28), `h2r.test.js` (51),
  `s2r.test.js` (62), `port.test.js` (52), `e3t.test.js` (63) and
  `racing.test.js` (44) — `node hyp.test.js`, etc., or `node tools/test.js`
  for all of them. 643 in all, plus `spaces.test.js` and
  `world-motion.test.js`.
  **Keep the summary line LAST, and `process.exit` after IT.** Tests appended
  after the summary still run and still print, but are not counted, so the
  total silently understates. Worse, an `if (failed) process.exit(1)` left in
  the MIDDLE of the file ends the run there: physics.test.js carried one at
  line 1134 of 1605, so any failure in the first two thirds skipped the last
  59 tests and printed no count at all — a broken constant reported one FAIL
  and then nothing, where it should have said `139 passed, 1 failed`. The exit
  belongs on the last line, as it already was in hyp.test.js.
- `tools/` — dev only, nothing in the game imports it, safe to delete. Node
  builtins plus the installed Chrome.

**`index.html` shows startup failures on the page.** A GLSL compile failure and
a JavaScript parse error draw an identical black canvas, and the error only
reaches the console, where nobody looks. A plain script before the module
listens for `error` and paints it into `#boot`. Never remove it — "the screen
is black" with no other information costs an hour every time.

### Tools

- `node tools/shader-check.js` — compiles ALL SIX programs headless (the five
  scene builds, one per geometry, plus the line one) and prints the info log.
  It iterates `SPACES`, so registering a geometry is all it takes. **Run after every shader edit.** It is the only way to tell a GLSL
  error from a JS error. Caveat: it uses SwiftShader, so it proves the ANGLE
  *translator* accepts the shader, not that every driver's back end will — and
  it says NOTHING about how long a real driver takes to compile it, which is
  its own way to lose a day. See the inlining rule under Rendering gotchas.
  To time a link on the real GPU, run the same page under
  `--use-angle=d3d11 --enable-gpu` instead of the SwiftShader flags.
- `node tools/page-check.js` — serves the project and loads `index.html` as a
  real ES module graph, then lets it run twenty frames and report on itself:
  any error, the boot panel, the first HUD line, the middle pixel. **The only
  check that covers the whole path**, and the one to run when "the screen is
  black". `preview.js` bundles, so it cannot see a module-loading failure.
  **Cold by default**, because Chrome caches a linked program and the first
  load is where the bugs are — that is how the backwards first frame below was
  found. `--warm` to skip the 5 s shader build, `--sw` for SwiftShader.
- `node tools/link-time.js` — links every program on the REAL GPU (D3D11, not
  SwiftShader) and times it. Warm: hyperbolic **8.6 s**, spherical **3.9 s**,
  H^2 x R **4.0 s**, S^2 x R **3.9 s**, **E^3 / lattice 3.1 s**. The four
  without the fundamental-domain apparatus cost less than half as much for a
  reason that is not an optimisation: the domain, the face scan, the exit
  solve, the fold loop, the portals and all 39 level primitives are unreachable
  in them, and `#if` lets the D3D compiler see that BEFORE it starts inlining.
  The flat one is cheapest of all because on top of that it has **no
  transcendentals at all** — `cosK`, `sinK` and `asinK` are `1`, `t` and `x`. **Run after adding level content or any new call
  to `sceneMap`.** A link over a few seconds means something is being inlined
  or unrolled more than once; it caps at 15 s, because past that the browser
  kills the GPU process mid-link and the page dies with an empty error. This is
  the only tool that can see that, and it is the bug that broke the page.
- `node tools/sdf-check.js` — evaluates the GLSL on a real GPU at a few
  thousand points per world and compares against the JS. FOUR cases: the
  hyperbolic level, the flat slab, the flat 3-torus, and S^2 x R with the race
  track on — that last one added because `race-track.js` was the only
  double-written scene nothing checked, and its two halves had drifted onto
  different arithmetic for the same distance. **Run after touching
  either half of any of them** — five worlds write their scene out twice from
  shared data with unshared arithmetic, which is the duplication this exists to
  catch and the reason a shared emitter is the next infrastructure job.
  The hyperbolic case samples only INSIDE the fundamental domain, because that
  is the only region its marcher ever evaluates. The flat cases sample **four
  cells out**, because the flat marcher does not stay in a domain at all: it
  runs straight into the covering space and folds inside the distance function.
  Measured: hyperbolic 4.6e-7 against a tolerance of 2e-3; flat **8.5e-7
  against 2e-5**, a hundred times tighter, four cells out. That ratio is the
  engineering case for the flat build in one number.
- `node tools/march-check.js` — replays the marcher in JS over tens of
  thousands of rays from faces, edges and corners, and counts the two failures
  the picture cannot tell apart: rays that use their whole step budget (which
  come out as background — the grey wedge) and samples the fold loop could not
  bring back inside the domain (which draw the wrong copy). **Run after
  touching the marcher.** It is a replica, so keep it in step by hand. It skips
  viewpoints closer than `PLAYER_R` to a surface — an eye 7mm from a wall
  crawls along it and no marcher does otherwise, but `collide` means the game
  cannot produce that camera. At the cheapest setting it tolerates a handful of
  genuinely expensive grazing rays; a CLUSTER is the wedge, so the tolerance is
  a rate, not a count.
- `node tools/net-check.js` — the only check that covers multiplayer. It runs
  `tools/relay.js` for real (static serving, the path-escape refusal, a
  3 KB blob through the 16-bit frame length, room isolation) and then loads
  `net.js` in Chrome and connects it TO ITSELF: two `RTCPeerConnection`s in one
  page, the host and join blobs passed by hand, a real state packet down a real
  `DataChannel`. **Run after touching net.js or relay.js.** It caught a stale
  internal call left by a rename that nothing else would have seen until two
  people tried to play.
- `node tools/port-map.js [plan.json] [--embed=] [--world=] [--fill=]` — takes
  a FLAT floor plan of line segments and prints the comparison table, the
  clearance check and a `WALLS` array ready to paste. With no arguments it runs
  a built-in demo plan, which is the fastest way to see what each embedding
  costs. Exits non-zero if the ported plan straddles a face.
- `node tools/relay.js [port]` — serves the project AND relays the two
  handshake blobs. Not a test; it is how a LAN game is hosted. No dependencies:
  the RFC 6455 handshake and frame codec are written out, because Node has an
  HTTP server and no WebSocket one.
- `node tools/preview.js out.png "player = placeAt(0,0,0.3);"` — renders the
  real app to a PNG. The second argument is JS spliced into main.js after it
  runs. `MODE=dom` prints the HUD and any page error instead.
  **It bundles the module graph, so it does NOT test module loading.** It
  understands only this project's import style: `import { a, b } from './x.js'`,
  and `export function` / `export async function` / `export const|let|class`.
  **Renamed imports now work** — `import { a as b }` is rewritten to the
  `const { a: b }` destructuring that means the same thing. They used to slip
  PAST the guard rather than trip it, because the line HAD been rewritten, just
  into `const { a as b }`, which is not valid JavaScript: the page died with
  `Unexpected identifier 'as'` pointing at a line preview.js itself wrote.
  **Namespace imports now work too** — `import * as ns from './x.js'` becomes
  `const ns = __m['x.js']`, which is the natural shape of this bundle since
  every module is already an object of its exports. main.js imports `h2r.js`
  that way, because almost every name in it collides with `hyp.js` by design.
  Any THIRD form (a default import, a side-effect import, a re-export) still
  **throws and names the offending line** rather than emitting a bundle with a live `import` in
  it; the third bite was `export async function` in net.js, which came out as
  `Uncaught SyntaxError: Unexpected token 'export'` and looks exactly like a
  syntax error in the game.

## The math, fixed conventions

    Minkowski form:  <x,y> = x0*y0 + x1*y1 + x2*y2 - x3*y3
    H^3           =  { <x,x> = -1, x3 > 0 }
    ORIGIN o      =  (0,0,0,1)

**Two types, and keeping them apart is most of the work.**

- A **point** is a 4-array on the hyperboloid.
- A **placement** is a 4x4 Lorentz matrix. `M*o` is where it is, and columns
  0,1,2 are the orthonormal frame E1,E2,E3 there.

Nil used one type for both, because Nil *is* a group. H^3 is not, so the
isometry is carried separately. Everything else keeps its shape: compute at the
origin, then left-multiply by the placement.

Matrices are **column-major**, `M[col*4 + row]`, so they go straight to
`uniformMatrix4fv` with no transpose.

**Geodesics are one line.** `gamma(t) = cosh(t)*o + sinh(t)*u`. The translation
along one is a boost, its frame is parallel-transported, so **velocity in frame
components is constant along a geodesic**.

**exp and log are closed form.** `log` uses `asinh` of the spatial part, not
`acosh` of the time part: `acosh` loses all its precision exactly where the
answer is small, which is where a rope spends its life.

## Height and gravity

H^3 is isotropic, so "down" must be **chosen**. Any function with `|grad| = 1`
works: that makes gravity a gradient (energy conserved) of uniform strength,
and makes the floor's SDF exact.

The game uses `planeHeight`: `height(p) = asinh(<p, FLOOR_N>)`, the signed
distance to a totally geodesic plane. Such a plane cuts H^3 into two **convex**
half-spaces, so **the ground never blocks line of sight, at any range**. The
cost is that the floor is intrinsically H^2, so walking on it is hyperbolic.

`busemannHeight` (horosphere) is implemented and is the tempting alternative —
a genuinely flat infinite floor. It is unusable: a horosphere is convex toward
its ideal point, so the visible horizon is `sqrt(1 - e^{-2h})`, which
**saturates at 1** however high you climb. README has the full argument.

Swapping is two lines at the bottom of the height section in `hyp.js`, but the
level's coordinates would need re-authoring.

**Which fields survive the quotient: only the plane one.** Its generators are
translations along axes LYING IN the floor plane, so they fix p2, so they
preserve `height`. A point (beacon) field does not descend — a point has
infinitely many lifts, so "down" differs by where you are. Busemann and tube
fields do not descend at all. `physics.test.js` checks all of this.

**Up is not E3, and the frame does not stay put.** A placement's frame is
parallel-transported, so walking tilts E3 away from up. `physics.alignUp`
rotates about the player's own point to re-pin E3 to `gradHeight`, and rotates
the velocity to match — skipping that would silently steer the player.

**Movement** picks how input becomes motion, and nothing else changes — same
integrator, same collision, same rope.

- `walking` — `control` steers the horizontal velocity toward a target.
- `rolling` — `rollControl` applies a TORQUE, and contact friction turns spin
  into translation. The contact model is the standard rigid-sphere impulse:
  with offset `rho = -r*up`, a tangential impulse J moves the contact point by
  `J*(1 + r^2/I)`, so the impulse that cancels a slip s is `-s/(1 + r^2/I)`.
  For a solid sphere that factor is 3.5, which is why a ball takes a moment to
  spin up: five sevenths of every impulse goes into rotation rather than
  motion. Ask for more grip than `ROLL_MU * G` can supply and it slips instead.

  Torque alone has no top speed — it balances rolling resistance at
  `r*TORQUE/RESIST`, which is 5.5 and well past `sqrt(G)`. `ROLL_TOP` caps the
  spin ABOUT THE INPUT AXIS, the same trick `control` uses in the air, so speed
  carried in from a slope or a swing survives.

  `spin` is in frame components like the velocity, so a fold leaves it alone
  and `alignUp` must carry it with `carryFrameVec` — skipping that silently
  changes the ball's axis.

  One concession: a real ball in mid-air cannot torque itself at all, since
  angular momentum is conserved and there is nothing to push against.
  `ROLL_AIR` gives back a quarter of the ground authority anyway, because with
  a grapple in the game zero air control is miserable rather than interesting.
  Set it to 0 for the honest version.

**Camera up** picks whether `alignUp` runs at all:

- `gravity` — re-pin every substep. What you want with a floor.
- `pendulum` — as `gravity`, plus a damped harmonic tilt driven by the player's
  own acceleration. A weight hanging inside the ball hangs along gravity MINUS
  acceleration, which is why it swings back when you pull away and forward when
  you stop. Underdamped on purpose (ratio 0.51): ~12 degrees on a hard stop,
  two overshoots, settled in under two seconds.
- `free` — never re-pin. Parallel transport only, so the view is continuous
  across every face, and going around a loop rolls you by the area enclosed.
  That is the same holonomy the dash banks.

`alignUp` is also skipped whenever gravity is off, whatever the setting.
**That was the open world's camera jerking at every face**: gravity there was
forced to none, but the FIELD object was still the plane one, so `alignUp` went
on pinning E3 to the plane's up — which the dodecahedral generators do not
preserve. `physics.test.js` measures the jerk at 111 degrees in one substep.

## The quotient: a compact 3-manifold

Space is **H^3 / Gamma**. Two worlds, two groups, swapped by the World option.

**floor (2D wrap)** — the OCTAGON group: a regular octagon in the floor plane
with 45 degree interior angles, opposite sides identified by translation. Eight
copies close up around every corner, so the quotient of the floor is a closed
**genus-2 surface** and the manifold is (genus-2 surface) x R — compact
sideways, infinite up and down. Plane gravity descends here.

Opposite-side identification is chosen over the textbook [a,b][c,d] pairing
because every generator becomes a pure translation along one of four axes, by
twice the inradius. Eight normals and eight matrices is the whole group.

**open (3D wrap)** — SEIFERT-WEBER dodecahedral space, a CLOSED hyperbolic
3-manifold. Regular hyperbolic dodecahedron, dihedral angle 2*pi/5 so five
cells meet around every edge, opposite faces glued with a **3/10 turn**. The
3/10 is load-bearing: 1/10 on the same solid gives the Poincare homology
sphere, which is spherical, and `hyp.test.js` checks that reduction is
canonical for 3/10 and NOT for 1/10.

There is **no consistent "down"** in the 3D world and there cannot be: a closed
hyperbolic 3-manifold admits no invariant unit-gradient function. Free flight
or a beacon are the honest options, and the World switch forces the field.

**The player size is bounded there.** The dodecahedron's inradius is fixed by
its dihedral angle at about 0.996, so the player has to be small against it.
`PLAYER_R` is 0.07 in BOTH worlds (it was 0.10). Smaller is always safe — only
growing risks straddling a face — and it reads better, because volume grows
like e^(2r) and the room is bigger than it looks.

**Reduction is greedy and canonical.** `reduceToDomain` repeatedly crosses back
over whichever side it is furthest outside; it lands inside in about seven
steps. The property that matters is that `reduce(g*p)` gives exactly the same
representative as `reduce(p)`. Nothing else in the suite would catch a wrong
pairing — the picture would just be subtly, unfalsifiably wrong.

**Closed geodesics.** Every generator is a screw motion whose axis runs through
the cell centre, so the geodesic along it closes up after one translation
length: 2*OCT_R = 3.057, or 2*DOD_R = 1.993. The frame does not come back —
the dodecahedron's 3/10 turn is holonomy you can watch. `closedGeodesicDirs`
and `closedGeodesicLength` expose these; the boomerang flies them; in the open
world the SPOKES are drawn along them, so the level shows you where to aim.

### The renderer teleports; the physics folds

Different strategies for the same problem, and both are needed.

- The **shader** never leaves the fundamental domain. Each step is clamped so
  it stops at the face, and on reaching one it applies that face's pairing to
  the chart and carries on. So `domainMap` only ever describes ONE copy.
  Reducing every sample instead would work and is far simpler, but reduction
  costs seven iterations of eight inner products, and at 220 steps a pixel that
  is not affordable.

- The **physics** cannot assume that — collision normals and the grapple query
  arbitrary points — so `levelMap` folds the query and takes a min over the
  folded copy AND its side-neighbours. The neighbours are not optional: the
  nearest content to a point near a face is usually across it, and the folded
  copy alone would OVERESTIMATE, which sphere tracing cannot survive.

**Clamp by the distance ALONG THE RAY, not the distance to the face.** This is
the whole difference between a marcher that works at a seam and one that does
not, and it was the grey wedge. `domainDepth` is the perpendicular distance —
the correct sphere-tracing bound, and useless for a ray running nearly parallel
to a face. Clamping by it makes every step near a seam `FACE_EPS`-sized, so the
ray creeps along, burns its budget, and falls through to the background. The
tell is that the wedge shrinks when you raise Quality rather than when you move.

The crossing is closed form. Against a face normal N the test value along the
ray is `f(t) = a*sinh(t) + b*cosh(t)` with `a = <D,N>`, `b = <Q,N>`, which has
at most ONE zero — for `|b| < |a|` it is a multiple of `sinh(t + phi)`, and
otherwise it never changes sign, so there is no tangency case. `f` increases
exactly when `a > 0`, and leaving the domain is `f` going negative to positive,
so the exits are the roots with `a > 0`:

    tanh(t) = -b/a   ->   t = 0.5 * log((a - b) / (a + b))

and `a > |b|` makes both arguments positive. `exitDist` is that, minimised over
the faces. The reference does the same job by binary search; this is exact.

**Never land exactly on a face.** A pairing maps a point on face k to a point
on face k+4, still at depth zero, so a `depth < eps` test fires again
immediately and the ray teleports for ever without advancing. It burns every
step and the world stops dead at the first boundary — which looks exactly like
a fog or range problem.

It takes TWO guards. Step a hair PAST the face (`FACE_EPS` along the ray), and
fold only when outside by more than `FOLD_EPS`. The first alone is not enough:
stepping `FACE_EPS` along a ray that grazes a face leaves a perpendicular depth
of `FACE_EPS * sin(angle)`, which goes to zero as the ray flattens, so at an
edge the sample lands at depth zero on one face, the pairing puts it at depth
zero on the opposite face, and it ping-pongs. `march-check` measured twelve
folds in a single step; with `FOLD_EPS` the worst case is three.

### Carried objects

The grapple anchor, the beacon and the portals are points of the UNIVERSAL
COVER. When the player is folded they must be carried by the SAME group element
— `apply(g, x)` — not snapped to whichever copy is nearest. Snapping changes
the rope's length in a frame, flips gravity, and moves a portal out from under
you.

**But the carrying must be bounded, or it destroys itself.** Their coordinates
grow like `cosh(distance from the player)`, and in free flight that distance
never stops growing: thirty seconds of ordinary walking with a beacon planted
put it at 8e12, where folding loses every digit (`<p,p>` comes back as -0.12
instead of -1, then 1e46). The shader gets a nonsense point, the 32-bit
distance to it cancels to zero at every sample, and the whole screen floods
purple. **Folding at upload time cannot fix this — the input is already
destroyed.** `settleCarried` re-folds past `CARRY_SNAP`; under the threshold
nothing moves, so the no-flip behaviour is untouched in normal play.

The boomerang avoids the same trap differently: it keeps its launch placement
and holds arclength in `[0, L)`. Carrying the placement forward one lap at a
time multiplies any error by `e^L` = 7.4, so 4e-15 after one lap is 1.1 after
forty.

## Options

Press `O`. Everything switchable lives in the `opts` object in main.js and the
overlay is generated from it, so adding a setting is one entry.

    World         bounded / open      floor and ceiling, or nothing but scaffold
                                      IN THE FLAT WORLD THE SAME OPTION MEANS
                                      the same two things: the slab (x, y
                                      glued) and the 3-torus (all three)
    Curvature     hyperbolic / spherical / H^2 x R / S^2 x R / flat torus
                                      a different SPACE, not a level
    Gravity       floor plane / beacon / none
    Movement      walking / rolling   steer the velocity, or spin a ball up
    Camera up     gravity / pendulum / free
    Roll          hold / momentum     Z and C, about the view axis
    Light speed   instant / fast / slow   c = 0 / 6 / 2 world units per second
    Portals       off / on            keys 1 and 2 place a pair, 3 clears
    Boomerang     aimed / closed geodesic / off   key B
    Build (G)     on / off            a delayed block; see Abilities
    Course (K)    off / hoops / grapple / dropper / lap / race / torus
                                      six timed courses. See Game modes
    Holonomy (Q)  sign decides / dash only / blast only
    Opponent      bot / network / off a bot that chases, or a real player (N)
    Fog           normal / thin / thick
    Shading       ambient occlusion / flat
    Domain edges  show / hide         the gold octagon outlines — and the gold
                                      SQUARE in the flat world, where they are
                                      the only evidence of the quotient at all
    Quality       low / medium / high march steps (160 / 220 / 280)

Digits **1-9 and 0 inside the menu** apply a preset: arena fight, hoop course,
grapple gates, spherical flight, light-speed lab, the dropper, round the world,
orbital sprint, the flat street, three-torus.
New presets are APPENDED rather than slotted in, so a digit does not change
what it means.

Zoom is on the SCROLL WHEEL, not in the menu — it is a thing you do while
looking, like aiming. `X` snaps back to 1x.

## One geometry, three curvatures

`geom.js` is `hyp.js` with the curvature left in. Write the ambient space as
R^4 with the form `<x,y> = x0y0 + x1y1 + x2y2 + k*x3y3` and the model as
`<x,x> = k`, degenerating at k = 0 to the affine plane `x3 = 1`:

    k = -1   <x,x> = -1, diag(1,1,1,-1)   the hyperboloid; this is hyp.js
    k =  0   x3 = 1,     diag(1,1,1, 0)   flat, in homogeneous coordinates
    k = +1   <x,x> = +1, diag(1,1,1,+1)   the unit 3-sphere in R^4

Then the geodesic from the origin is **one formula in all three**:

    gamma(t) = cosK(t)*o + sinK(t)*u        cosK = cosh | 1 | cos
                                            sinK = sinh | t | sin

with `cosK^2 + k*sinK^2 = 1` holding throughout — `cosh^2 - sinh^2 = 1`,
`1 + 0 = 1`, `cos^2 + sin^2 = 1` are the same statement. The `k` in front of
`sinK^2` IS the curvature. Distance still goes through
`<p-q,p-q> = 4 sinK(d/2)^2` for the same precision reason as before.

**`hyp.js` DELEGATES to this.** `dot`, `matMul`, `apply`, `inv`, `point`,
`frameVec`, `reorthonormalize`, `translation`, `exp`, `log` and `dist` are all
one line each now; what stays in `hyp.js` is everything about THIS space — the
height fields, both groups, the fundamental domain, the level helpers.

**The regression test is the whole point, and it nearly evaporated.** The test
was "geom.js agrees with hyp.js"; the moment hyp.js delegated, that compared
geom to itself and would have passed whatever either did. A regression test
that cannot fail is worse than none, because it still reads as reassurance.
So the old implementations are frozen in `legacy-hyp.js` and the comparison is
made against those. Measured against them: `translation`, `inv` and
`reorthonormalize` are **identical bit for bit**, and `exp` and `dist` agree
to under one ULP (4.4e-16 and 1.9e-15 over 200000 samples).

**`translationBy(unit, t)` exists alongside `translation(v)` on purpose.**
Callers genuinely hold both spellings, and converting between them is not free:
`hyp.translation` takes a unit direction and a distance, and routing that
through the single-vector form multiplied them together only for geom to divide
them apart again. That round trip is not the identity in floating point — it
moved the matrices by 1.8e-15 and turned a bit-for-bit agreement into an
approximate one for nothing.

**It costs about 11% of the JS geometry hot path**, measured on
`tools/march-check.js`: 2919 ms before, 3244 ms after, three runs each and the
spreads do not overlap. That is one extra call indirection per primitive. It is
the right trade — march-check is a dev tool, the real marcher is on the GPU,
and the physics does a handful of these per substep — but it is a real cost and
not noise.

**Flat space is the control, and it earns its place.** Every bug in the
abstraction shows up there first, in arithmetic checkable by hand — distance is
Pythagoras, a circle of radius 2 has circumference 4*pi, and translations
COMMUTE, which they do in neither other geometry. That last one is not trivia:
the failure to commute in H^3 is exactly the holonomy the dash banks.

**The range limit is a fact about hyperbolic space, not about the code.**
Measured, at d = 10: flat coordinates are 10, hyperbolic are 1.1e4 (they grow
like `cosh`), spherical are under 1 and always will be. In FLOAT32 — which is
what the shader has — hyperbolic `<p,p>` is off by 1e-3 by **d = 7**, while
spherical holds all the way to the antipode. **This is the engineering case for
S^3**, not novelty: the limit that caps the level size simply does not arise
there.

It also bit a test. A 400-step random walk in H^3 is BALLISTIC, not diffusive:
it escapes linearly, reaching d = 11.7, where `<p,p>` must come out to -1 from
terms of size 3.5e9 and float64 leaves 8e-7 of residue. That read as a flaky
`reorthonormalize` test — 29 failures in 200 trials in H^3, none in E^3 or S^3
— and was neither flaky nor a drift problem. The walk is now kept near the
origin, and the range limit is its own test.

**Geometries are objects, not a mode switch.** `level.js` and `physics.js`
carry a global "which solid am I in", and getting that out of step with the
renderer is a whole class of bug. `geometry(k)` returns a value, so two can be
held at once and compared in a single test with nothing to switch.

## Modes take options away, and they do it through `optVal`

`rawVal(k)` is what the player picked. `optVal(k)` is what the game uses, and a
mode can make them differ; `computeForced()` returns the table and
`applyOptions` recomputes it FIRST, before anything reads it.

**Forcing through `optVal` rather than at each call site is the whole point.**
Every `optVal` in main.js already asks the same question, so a lock applies
everywhere at once and cannot be forgotten in one branch — which is exactly how
"gravity is off but the FIELD object is still the plane one" survived long
enough to jerk the camera 111 degrees at every face in the open world.

**Forced, not hidden, and not silently substituted.** The menu still shows the
row, with the value the mode is using and a short reason, and the player's own
choice after it in brackets. Hiding the row makes the menu change shape as
modes are switched; substituting the value silently is the game lying about its
own state.

What is locked, and why it is not a balance decision:

- **spherical** takes gravity, camera up, movement, domain edges, the opponent,
  the boomerang, build, portals and the courses. Plane gravity in S^3 is not a
  worse choice, it is an incoherent one; "Domain edges" outlines a fundamental
  domain that does not exist; the rest is hyperbolic-only code.
- **H^2 x R** takes the same family, plus light speed (self copies need a
  quotient), and it PINS the course to `dropper` rather than taking it — that
  mode is the geometry's whole reason to exist and there is nothing else to
  run there. Gravity is the one it does NOT take away, because falling is the
  mode; it is pinned to `floor plane` to say that the floor is `z = 0` and
  there is no field object to choose.
- **S^2 x R** takes the same family as H^2 x R and pins the course to `lap`.
  It does NOT take gravity or the camera away as a matter of incoherence the
  way S^3 does — this is the one world with a compact floor and an honest down
  — but they are pinned anyway, because the floor is `z = 0` and the frame
  never tilts, so there is nothing for either option to choose between.
- **each product's course, outside that product,** is locked back to `off`.
  A dropper needs a Euclidean height under a hyperbolic plan and a lap needs a
  spherical one; neither exists in a constant-curvature world nor in the other
  product. Saying so in the menu beats a course option that silently builds
  something else.
- **any course** takes the opponent, the boomerang, build and portals. A timed
  run has nothing to fight, and each one is a key that would do nothing.
- **the grapple course** additionally pins gravity, camera up and the bounded
  world, because a charge gate is opened by SWINGING and with gravity off there
  is nothing to swing from — every gate would stay shut for ever.

The first lock wins, so a different SPACE outranks a mode inside one.

**Presets are the other half, and they are the OPPOSITE of a lock.** `PRESETS`
in main.js sets up a mode and then gets out of the way: anything it does not
mention is left as the player had it, and anything it does set can be changed
straight back. Forcing is for settings a mode cannot coexist with; a preset is
for settings it merely plays better with. Digits 1-5 apply them while the
options menu is open — inside that branch only, because the digits are portal
keys during play.

Two rules they follow:

- **Applied by NAME, not by index**, so reordering an option's values cannot
  silently change what a preset means. A value an option does not have is a
  typo: it warns and leaves the option alone, rather than falling back to
  index 0 and applying a plausible wrong setting nobody would trace back.
- **A preset owns the run.** One with a course STARTS it, or the player picks
  "Hoop course" and arrives in a world with an unlit course in it; one without
  a course RESETS it, or the clock from the last preset keeps counting under a
  mode that has no course — measured, switching from "Hoop course" to
  "Spherical flight" left the run in `PHASE.RUNNING` with a live timer.

## Level authoring

The floor is an H^2, so it has no Euclidean grid. `(a, b)` are **geodesic
polar** about the domain centre: `|(a,b)|` is the true distance and the
direction is honest, but two positions are *not* `|da, db|` apart.

**A surface that straddles a face is CUT OFF at it** — the marcher never leaves
the domain, so it never draws the part in the neighbouring copy, and you get a
flat cross-section where it was sliced. Nothing else notices: both SDFs still
agree, the physics still collides correctly, and the picture is quietly wrong.
`physics.test.js` checks it directly, in both domains.

**The clearance rule is simple, because plane distance is 1-Lipschitz:** a
point d from the centre is at least (inradius - d) from every face. So centre
distance plus thickness must stay under the inradius — 1.5286 for the octagon,
**0.996 for the dodecahedron**. Toward a corner there is far more room: the
dodecahedron reaches 1.854 that way.

### Porting a flat map into a curved one — `port.js`

**There is no isometric embedding between surfaces of different curvature**
(*Theorema Egregium*), so the question is never "which projection is right" but
WHICH PROPERTY DO YOU WANT KEPT. Three classical answers, each exact in one
thing: **polar** (distance and bearing from the centre), **conformal**
(angles), **projective/Klein** (STRAIGHTNESS — a Euclidean chord is a
geodesic). **Usually you want Klein**, because a map of straight walls is a map
whose meaning is which straight lines exist; measured exact to 1e-16. A fourth
strategy, the DEVELOPING MAP, keeps every edge length and turn angle exactly
and cannot close its loops — the gap is the enclosed area, the same integral
`physics.sweptArea` banks. Develop along a spanning tree and the port is exact.

`node tools/port-map.js` does the comparison, the clearance check and the cycle
report. Full argument and all the measurements:
[docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md).

**The disc models end at u = 1 and a point outside THROWS rather than clamps** —
a clamp hands back a finite answer for a point that is not in the model, and
the level would build and be silently wrong.

**`distToGeodesic`: the perpendicular part of the log is NOT the distance.**
Splitting `log_a(p)` and taking the norm across the axis is the FLAT answer
done in the tangent space; it underestimates, 0.299 against a true 0.35. The
right relation is `sinK(d) = sinK(rho) * sin(theta)`, one line in all three
curvatures. **Take `sin(theta)` from the CROSS PRODUCT, never from
`sqrt(1 - cos^2)`** — the angle is usually near zero, where the square root
reads 3.55e-8 for an exact zero.

**Three worlds hold their scene as data and emit it twice BY HAND** —
`level.js`, `s3.js` and `h2r.js` each carry their own number formatter and
their own emit loop, which is exactly the duplication `tools/sdf-check.js`
exists to catch drifting. TODO.md Part 2b has the plan for one shared emitter.

**Three content sets.** `PILLARS`, `BARS`, `PLATFORMS`, `ORBS` fit both domains.
`WALLS` and `TOWERS` are OCTAGON-only — a wall long enough to take cover behind
does not fit in a cell of inradius 1. `SPOKES` and `PODS` are
DODECAHEDRON-only.

**The spokes are worth understanding, because the gluing does the work.** Each
runs out along a face normal. Opposite faces are identified and the 3/10 turn
is ABOUT that axis, so a spoke lines up exactly with the neighbouring cell's
spoke coming back. They join across every face into straight lines that never
end, and they are the closed geodesics the boomerang flies.

**Level materials stay below 10.** The markers (anchor, beacon, the player's
body, portal rims, boomerang) run from 10 up, and the shader's "does it glow"
test is exactly that boundary. A level material above it would be silently
emissive in every copy — the starfield failure below.

**Nothing at either spawn.** A camera inside geometry makes every ray hit at
t = 0 and fills the screen with one flat colour, which looks exactly like a
shader that failed to compile. Both spawns have been blocked at some point.

**The primitives** are intersections of slabs, and `max` of the slab distances
is exact inside and an underestimate outside the corners — the safe direction.
(The tighter `length(max(d,0))` is also valid here, since hyperbolic Pythagoras
makes the true hypotenuse longer than the Euclidean one, but it was measured
and bought almost nothing: mean march steps 9.4 to 9.3.)

A `WALL` is three slabs: distance to its vertical plane, distance along it, and
altitude, each an `asinh` of an inner product against a unit spacelike vector.
`verticalPlaneNormal` finds the normal by a Minkowski cross product in the
z = 0 slice. Wall ends are equidistant surfaces, not geodesic planes, so **a
wall tapers about 20% over its height**. That is what a constant distance from
a plane means here.

**Leave the perimeter clear.** The walls are a pinwheel at floor radius 1.0
with wide gaps, so the band from 1.1 out to the inradius is open all the way
round. That corridor is the same corridor in every copy.

## Rendering gotchas, all of them found the hard way

- **Fold every world point before it reaches the shader.** The marcher folds
  its own samples, so an unfolded uniform is compared against folded geometry
  and lands in the wrong copy. `foldPoint` exists for exactly this. See the
  carried-objects section for why folding at upload is not enough on its own.
- **Fold until INSIDE at a face, not once per step.** Near an edge the ray can
  be outside two or three faces at once, and folding one per loop iteration
  burns the budget. That was one of the two causes of the grey wedge; the
  other, and the bigger one, was `exitDist`.
- **Re-base the chart at every teleport.** Computing every sample from the eye
  as `Gacc * uPlayer * (sinh(t)*dir, cosh(t))` multiplies two factors of size
  `cosh(t)` and cancels down to a point of size one, so the absolute error is
  `cosh(t)^2 * 6e-8` — fine at t = 4, nonsense by t = 10. The symptom is WHITE
  SPECKLE, because the normal comes from differences with no digits left.
  Keeping the placement at the last teleport and measuring `s` from there
  bounds `cosh(s)^2` near a hundred and removes the limit entirely. Frame
  components survive both the boost (parallel transport) and the pairing (a
  left multiplication), so a direction means the same thing in every chart.
- **The hit threshold is not a constant, it is the pixel's FOOTPRINT.** Too
  fine and a ray grazing the floor never converges: sphere tracing on a shallow
  surface shrinks its step geometrically and approaches without arriving, so
  the ray dies with the floor 0.0016 away and the pixel comes out as sky. A
  pixel of angular width w covers `w*sinh(t)` of world at distance t; asking
  for detail below that is asking for the undrawable. Setting the threshold
  there fattens every surface by exactly one pixel, however far away.
- **Never divide by `sqrt(max(gg, tiny))` for a normal.** At a grazing hit the
  finite differences nearly cancel and `mdot(G,G)` can land at or below zero.
  The guard then scales G by a million and the lighting explodes. Bail to
  `upAt(p)`.
- **Clamp the lighting terms too.** `key` and `head` are cosines between unit
  vectors, so they belong in [0,1]. The guard above catches a zero normal; this
  catches one that is too long, which is the more common failure.
- **Ambient occlusion must step along the GEODESIC**, `cosh(d)*p + sinh(d)*n`,
  not `p + d*n` — the latter leaves the hyperboloid. Drop samples that leave
  the domain rather than folding them: `domainMap` would answer about the wrong
  copy and paint a dark smear along every seam. Occlusion belongs on the
  ambient term only; a crevice does not stop direct light.
- **Emissive materials do not survive being everywhere.** One glowing orb is
  fine; one in every cell punches through the fog and turns the far field into
  a starfield of clamped white specks. Only the transient markers glow.
- **The 3D world needs far more fog.** Twelve faces and a smaller cell mean a
  sightline crosses many more copies.
- **Extinction is per channel.** The one idea worth taking from the reference
  path tracer's air, which carries an `absorb` COLOUR and applies
  `exp(-absorb*dist)`. Red goes half again as fast as blue, so distance shifts
  hue instead of only draining contrast. Because blue outlives the others it
  has not converged at `uMaxT`, so the last quarter of the range is closed by
  hand with a smoothstep. True volumetric scattering is a path tracer and does
  not belong here; the analytic mean of it is this.
- **Never call a big function more than once, and never let a small loop keep
  a constant bound.** This is a COMPILE-time rule and it cost a whole session.

  On Windows the browser runs ANGLE, which turns the GLSL into HLSL at compile
  time and hands that to the Direct3D compiler at **link** time. That compiler
  inlines every call and unrolls every loop whose trip count it can work out —
  and here both multiply the entire level.

  `main` used to call `trace` five times (four supersamples, plus the
  single-sample branch), so the whole marcher existed **five times**. Inside
  each, `sceneMap` appeared thirteen times — eight finite differences in
  `sceneNormal`, four AO samples, one march step — and each of those contained
  `contentMap`, whose eight loops over the level unrolled into 39 primitives.
  Five times thirteen times 39. **The scene program took 212 seconds to link.**

  Real Chrome kills a GPU process that unresponsive, and a killed link returns
  `LINK_STATUS = false` **with an empty info log**, which is indistinguishable
  from a syntax error unless you know this. The tell in the log that survives:
  every D3D warning appeared exactly FIVE times.

  The fix is only ever to write one copy. The supersample is a loop whose bound
  comes from `uSuper`; the normal's eight taps and the four AO taps are loops
  bounded by `rolled()` in shader.js, which adds `int(min(gl_FragCoord.x,0.0))`
  — always zero, and the compiler cannot prove it, so it cannot count the
  iterations. Same work at run time, one copy of the code. **212 s -> 5.0 s.**

  Measured, in order: five traces -> one is 212 s -> 11.9 s on its own, and it
  is most of the fix. De-unrolling `domainDepth`, `exitDist` and the fold loop
  changed **nothing** (215 s, 211 s) — they are called once each, so there was
  nothing to multiply. Do not bother.

  **The corollary, and it is the one that keeps paying: MARKERS GO IN A LIST.**
  The anchor, the beacon, both boomerangs, both blocks, both decoys, the
  opponent and a blast are all the same shape — a centre, a straddle copy, a
  radius, a material — and as nine separate `if` branches in `sceneMap` they
  were nine copies of the code, times the three places `sceneMap` is inlined.
  As `uMark[10]` plus one loop bounded by the uniform `uMarkN`, the body is
  emitted once and the loop runs only for the markers that are actually live,
  so nothing costs anything when it is not out.

  Measured: **six new objects added for 0.3 s of link time** (8.2 s -> 8.5 s).
  Adding a marker is now a CPU-side `marker(p, r, mat)` and no shader edit at
  all, which is the real win, because link time is the budget that binds.

  This is NOT the same as rolling level.js's loops, which cost 74% of the frame
  time to save 0.3 s of compile. The difference is that marker data comes from
  uniforms, so there was never any constant folding to lose.

  **`rolled()` is for big bodies only, and level.js deliberately does NOT use
  it.** Hiding `contentMap`'s bounds too seems like the same idea and is not:
  those loops run in the march inner loop, and unrolled they let the compiler
  fold the constant array reads. Rolling them cost **74% more frame time**
  (0.50 -> 0.87 ms at 720p, 1.80 -> 3.50 supersampled) to save 0.3 s of
  compile, which is inside the noise. The level's 39 primitives are affordable
  written out only because `sceneMap` is now inlined 3 times instead of 65.

  Net against before the bug: same picture, **5.0 s instead of 212 s to link,
  and slightly FASTER frames** — one `trace` is kinder to the instruction cache
  than five.

  `tools/shader-check.js` CANNOT see any of this: SwiftShader has no HLSL
  back end and links the worst version in a few seconds. Only a real D3D
  driver shows it. `main.js` now times the link and explains an empty log.

  **A SWITCH BETWEEN TWO WORLDS BELONGS IN A `#define`, NOT A UNIFORM.** Same
  rule, one level up. The marcher carries a curvature so that H^3 and S^3 come
  out of one set of formulas; written as `uniform float uCurv` the D3D compiler
  cannot fold away the arm the world does not use, so both arms of
  `cosK/sinK/asinK` are emitted, and so are BOTH `sphereWorld` and `domainMap`.
  `mdot` is called from the march inner loop, which is where multiplication by
  three copies of `sceneMap` happens. Warm, three runs each:

      uniform, one program for both        10.1 s
      #define uCurv (-1.0), hyperbolic      8.5 s
      #define uCurv (1.0),  spherical       4.4 s

  So `shader.js` exports `fragFor(k)` and there is a scene program per
  curvature; `FRAG` stays `fragFor(-1)` so every tool still checks the build
  that ships. The spherical one links in HALF the time because in S^3 the whole
  quotient apparatus is dead code. **Parenthesise the value** - without them
  `-uCurv` expands to `--1.0`, a syntax error a long way from the define.

  **With more than one program, pin attribute slots with `bindAttribLocation`
  before linking.** A second program is entitled to a different location for
  the same name, and the full-screen quad's vertex array is set up once. It
  draws nothing, with no error.

  **MEASURE LINK TIME WARM, and repeat it — a cold run reads 25% high.**
  `link-time.js` WARNs above 10 s and fails at 15 s. Measured on one machine in
  one sitting, the first runs gave 11.2, 10.5 and 9.9 s and then settled at
  **8.5, 8.5, 8.7** and stayed there. The early readings trip the WARN and look
  exactly like a regression; they are the driver and the GPU clocks warming up.
  A single cold number is not evidence of anything. Take three.

  **The 5.0 s above is the figure for a SMALLER shader, and the gap is fully
  accounted for.** Measured by stubbing each piece out and re-linking:

      level content (39 primitives)     3.3 s
      selfAt, the light-speed body      3.1 s
      everything else                   2.2 s
      total, warm                       8.6 s

  and `5.0 (documented) + 0.3 (markers, documented) + 3.1 (selfAt) = 8.4`,
  against 8.6 measured. **Nothing regressed** — the shader grew by exactly the
  features that were added to it. Note what that says about the budget, though:
  the self body costs nearly as much to compile as all 39 level primitives.

  **Two fixes were tried and REJECTED, so do not try them again:**

  - Rolling `domainDepth`'s and `exitDist`'s face scans with `rolled()`. No
    effect (8.6 vs 8.6), which confirms the original finding above rather than
    contradicting it. An early 10.5 -> 8.5 reading that suggested a 2 s win was
    the cold-start artifact, not the change.
  - Hoisting `selfAt` out of `sceneNormal`'s eight taps and `ambient`'s four.
    It looks like an obvious win — `selfAt` depends only on `t`, which does not
    vary across the taps, so it is evaluated twelve times for one answer — and
    it made link time WORSE (9.0-10.3 vs 8.5-8.7). The compiler already does
    that CSE; passing two extra `vec4`s costs more than it saves.
- **`gl.uniform*` writes to the CURRENTLY BOUND PROGRAM, and nothing warns you
  when that is the wrong one.** At the top of a frame the bound program is
  still the LINE one, left over from last frame's rope and crosshair. Uniforms
  set before `gl.useProgram(scene)` went to that program and were silently
  dropped: `uBoomOn` was never once set on the scene program, so it sat at its
  default of zero and the boomerang was invisible from the day it was written.
  The opponent was invisible for the same reason within a minute of being
  added. Bind first, then upload. There is no error, no warning, and the
  uniform simply does nothing.
- **A body straddling a face is CUT IN HALF, and it needs a second copy.**
  The marcher never leaves the fundamental domain, so the part of a sphere that
  pokes through a face is simply not drawn — measured at **49.3% of the body
  unreachable** with the centre right on the seam. The fix is to also test the
  centre mapped by the pairing of the face it is nearest to: that copy sits
  just outside the PAIRED face, and the part of it inside the domain is exactly
  the missing cap, because what leaves by one face arrives by its partner.
  `straddleImage` in main.js does this on the CPU for the opponent, the
  boomerang and blocks; `selfAt` does it in the shader for the player's own
  body, which cannot be precomputed because its centre depends on t.
  Verified: 49.3% missing -> 0.0%.
- **A marker centred ON the eye fills the screen with one flat colour, and that
  looks exactly like a shader that failed to compile.** Three of them do it:
  a boomerang leaves your hand AT your hand (0.043 of travel in the first frame
  against a 0.09 radius, so two or three frames of full-screen red on EVERY
  throw); a blast is centred on you and starts at radius zero, so its shell
  passes through the eye on the frame it fires; and a decoy comes off the
  oldest end of your own trail, so dropping one while standing still puts it
  where you are. `uMarkInfo.w` is a near cutoff for exactly this — the same
  guard the self body already had at 0.35 — and it hides nothing real, because
  the nearest genuine copy of anything is a whole cell away.
- **Keep the files LF.**

## Gotchas

- **Clamp `dt` at BOTH ends, and the lower one is the one that bites.**
  `requestAnimationFrame` hands you the timestamp of the frame the callback
  belongs to, and that can predate anything measured after module setup. The
  driver spends about five seconds building the shader on a cold load, so the
  first callback arrives stamped 145 ms while the clock reads 5100 — **a dt of
  minus five seconds**. One backwards step of that size takes the placement off
  the hyperboloid and every number is NaN for the rest of the session: the HUD
  reads `altitude NaN speed NaN`, nothing responds, and the picture still looks
  completely normal, because the level does not depend on the player.
  `Math.min(dt, 0.05)` does not catch it — the value is far below the cap, not
  above it. `last` starts null so the first frame is exactly zero.

  Only a COLD load reproduces it, which is why `tools/page-check.js` wipes the
  shader cache by default and fails on NaN in the HUD.
- **Placements drift out of O(3,1), and the drift is amplified.** Every matrix
  multiply leaves the result a hair outside the group, and coordinates grow
  like `cosh(distance)`. Left alone, `<p,p>` wanders off -1 and the position
  runs away to infinity. `stepFree` and `alignUp` both call `reorthonormalize`.
  Anything else that composes placements in a loop must too.
- **There is a hard range limit, and it is closer than you think.** `<p,p>` is
  a difference of terms of size `e^{2d}` that must come out to exactly -1. The
  digits run out around **d = 16 in float64** and **d = 7 in float32**. This is
  why every formula avoids needing `<p,p>`, why `dist` uses
  `4 sinh^2(d/2) = <p-q,p-q>`, and why the corridor is only a few units across.
  A level ten times bigger needs a different model.
- **Do not use the closed form `sinh^2(d) = <p,q>^2 - p2^2 - 1`** for distance
  to an axis. Algebraically right, numerically awful: it cancels terms of size
  `cosh^2` then takes a square root. Form the perpendicular component as a
  vector first, then take its norm — `distToAxis` does.
- **Keep floor radii under about 3.** Every formula cancels `cosh(r)^2`.
- **Never put a backtick in a shader comment.** The shaders live in JS template
  literals, so a backtick ends the string and `main.js` stops being valid
  JavaScript — the module never loads and the screen is black *before* the
  shader is reached. Use 'single quotes'. `shader-check` detects this.
- Keep shader comments ASCII.
- `half` is a **reserved word** in ESSL 3.00 (so are `double`, `long`, `short`,
  `fixed`, `input`, `output`, `sample`). `step` is a builtin.
- A shader that fails to compile renders black with no error unless
  `COMPILE_STATUS` is checked. That check in `main.js` stays, and `#boot` in
  `index.html` is what makes it visible.
- Normals in the **shader** are ambient tangent vectors, not frame components:
  the player's frame lives at the player, not at the hit point. `mdot` of two
  tangent vectors at the same point is their inner product, so shading needs no
  frame. Normals in **physics.js** *are* frame components, legitimately — there
  the point and the frame are the same placement's.

## Traps in the archived subsystems

The per-world rationale and the gameplay kit moved to
[docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md) and
[docs/archive/gameplay-kit.md](docs/archive/gameplay-kit.md) on 2026-09-07.
**Every trap in them was kept here**, because a trap is a rule and the rest is
an argument. Each line below cost a session or most of one; the archive has the
measurement and the reasoning behind it.

### Switching geometry

- **A LORENTZ MATRIX IS NOT AN ISOMETRY OF THE 3-SPHERE.** The hyperbolic spawn
  has `<p,p> = -1` under the Minkowski form and `+1.81` under the Euclidean one
  where S^3 needs exactly `+1`. Hand the spherical marcher a hyperbolic
  placement and every ray starts off the manifold, nothing is ever hit, and the
  screen comes out **99.3% black** — indistinguishable from a failed compile.
  Switching curvature MUST re-place the player (`resetForCurvature`).
- **Never send a flat point through the hyperbolic `foldPoint`.** It reduces
  against the octagon or dodecahedral generators and comes back as nonsense.
  The predicate is `adapterWorld()` — "has no HYPERBOLIC fold" — and it was
  once called `unglued`, which quietly meant the wrong thing: E^3/Lambda
  emphatically HAS a group. It hid because the flat origin and the hyperbolic
  origin have identical coordinates, so it was right at the spawn and wrong
  everywhere else.
- **`geoStep` must use `cosK`/`sinK`, not `cosh`/`sinh`.** Unconditional
  `cosh`/`sinh` is right in H^3 and wrong in S^3; the error is O(d^3) and AO
  steps are short, so the spherical build stepped slightly off the sphere at
  every tap for a long time without showing it.

### The product geometries (`product.js`, `h2r.js`, `s2r.js`)

- **THE HEIGHT IS AFFINE, SO A `mat4` MULTIPLY IS WRONG.** `Isom(H^2 x R)` does
  not embed in GL(4) on this model: the surface part is a 3x3 Lorentz block and
  the height must be ADDED, never scaled. A plain multiply scales the stored
  height by the other factor's timelike coordinate — measured, a step of 1.3
  from 2.1 up landed at **3.812 instead of 3.140**, and `M o inv(M)` was 1.62
  off the identity. Hence `applyPoint`, `applyVec` and `compose` in `h2r.js`
  and `chartMap`/`chartRebase` in the shader. **`applyPoint` and `applyVec`
  differ in exactly one component**: a POINT's height translates, a TANGENT
  VECTOR's does not.
- **`horizDist` takes NO `kS` factor.** `<p-q,p-q> = 4 sinK(d/2)^2` needs the
  form as it stands, and both signs are already positive. Multiplying by `kS`
  clamped every hyperbolic distance to zero and stacked the dropper's five
  gates on top of each other.
- **The surface translation is a BOOST at `kS = -1` and a ROTATION at `kS = +1`**,
  and the `-kS` in front of `sinK` is the whole difference. The test that pins
  it is that the surface block inverts by plain TRANSPOSITION at `kS = +1`.
- **H^2 x R needs a PER-RAY range cap**, `min(uMaxT, 7.0 / horiz)`. It is the
  only geometry here that is both unbounded and unglued, so a ray really can
  march to where float32 has nothing left; it drew as speckle across the whole
  far field and looked exactly like a precision bug in the normal.
- **The pixel footprint is ANISOTROPIC in H^2 x R**: `sinh(a t)/a`, which
  degenerates to `t` as `a` goes to zero. Using `sinh(t)` reads a footprint of
  6e18 on a 44-unit vertical sightline and asks for detail sixty times finer
  than a pixel.
- **S^2 x R takes `t` for the footprint, not `sin(a t)/a`** — the horizontal
  spread COLLAPSES TO ZERO at the antipode, and a footprint of zero asks for
  infinitely fine detail. `t` is an honest upper bound on both.
- **`p.xy / p.w` IS A GNOMONIC PROJECTION ON A SPHERE AND IT DOES NOT REACH.**
  `p.w` is `cos(d)`, so the Klein checker blows up at a quarter turn and CHANGES
  SIGN past it — moire at pi/2, then half a world drawn twice. Use a 3D checker
  on the bounded surface coordinates. It works unchanged in the FLAT world,
  where `p.w` is 1 and the same expression is the identity.
- **The floor checker must fade with distance** in H^2 x R: one cell is far
  under a pixel at 40 units, and below a pixel the right answer is the average.

### E^3 / Lambda

- **The crossing test must wrap the STEP, not each end.** Folding `p1`
  independently lets a substep straddling a half-cell boundary come back as a
  jump of a whole cell — a spurious sign change and a gate credited from
  nowhere. `hoopCrossed` carries `d0` forward by `torusDisp(p1, p0)`.
- **Free flight needs two arms, or gravity gives a terminal velocity.** Steering
  toward a target speed is a first-order lag, so adding a constant `-g dt` to it
  terminates at `g/rate` — measured **1.50 against the honest 7.35**, identical
  every lap, and the endless fall had silently become a lift. With gravity on
  the vertical takes a thrust and NOTHING takes speed away.
- **The k = 0 arm of `cosK`/`sinK`/`asinK` has to be written out.** The shared
  selector tests `uCurv < 0.0`, so zero curvature falls through to `cos`/`sin`,
  which are not the flat limits of anything. **`projT` needs its own arm too**:
  the form is degenerate, so there is no constraint to project out.
- **A primitive must fit inside HALF a cell along each glued axis** for the
  minimum image to be exact — level.js's clearance rule, restated flat.
- **The gold cell boundary is drawn here and is NOT locked off.** Nothing else
  on screen distinguishes a 3-metre cell that wraps from an endless plain.

### Courses and modes (`modes.js`)

- **The crossing TEST belongs to the COURSE, not to `runStep`.** A hoop in H^3
  is a sign change against a geodesic plane; a dropper gate is a horizontal
  disc. A course may carry `crossed(p0, p1, gate)` and `runStep` defers to it.
- **The crossing test must ride on a segment whose ends are in the SAME chart.**
  It uses `bankFrom`, the substep's start carried through any fold that
  happened during it. A raw start against a folded end reports a flight across
  the room at every face crossing, and every hoop between counts at once.
- **A course is a CARRIED object.** `carryCourse` moves every hoop by the same
  `g`, and each hoop's NORMAL by the same element as its centre — fold those
  apart and the gate draws in one place and is crossed in another.
- **Ordering is not bureaucracy: without it the WRAP is the cheat.** A straight
  line eventually reaches everything, so an unordered course credits hoop five
  on the way to hoop two.
- **Hoops are LINE LOOPS, never shader primitives.** Anything in `sceneMap` is
  inlined three times and paid for at link time. `hoopNear` picks the copy
  nearest the player, or it projects to the wrong part of the screen.
- **A run must START you on the course.** A geodesic parallel to a generator's
  axis but offset from it does not close, so the course cannot come to the
  player and `beginRun` moves the player to it. Measured, gate 1's ring points
  on screen when the clock started: **0 of 41 before, 34 of 41 after**.
- **A MODE THAT DEFAULTS TO OFF NEEDS ITS KEY TO TURN IT ON.** Both courses
  shipped working and unreachable. **A key named on screen must always do
  something when pressed**; if the feature is off, the key turns it on.
- **LAYOUTS ARE SEARCHED FOR, NOT WRITTEN DOWN**, against criteria simulated on
  the real integrator. The opponent spawn, the grapple ring, the dropper gates
  and baffles, and the flat world's rods all were. Two modes that were written
  down instead shipped complete-looking, booting, drawing correctly and
  **finishable by no input whatsoever** — which a screenshot cannot show.
- **Changing what is LETHAL invalidates a search already run.** The dropper's
  gate ring was searched with the columns as scenery and clears one by 0.220
  against a player 0.10 across; adding them to the lethal set turned a 0.12
  margin into instant death. They are scenery, and still solid.
- **A lethal surface must be tested SWEPT.** A 0.16 slab against a 0.20 player
  is a 0.36 hit zone, and one fast substep can start above and end below with
  neither endpoint inside — a point test reports a clean pass through rock.

### The kit, if it is ever picked back up

- **Everything solid goes through `worldSDF`, not `levelSDF`**, or a block is
  scenery you walk through — and over a network, their block and their pane too.
- **Distance between characters is the ORBIT distance, never the coordinate
  one.** The same character named one cell over reads 3.06 away in coordinates
  and 0.00 in the manifold. **A hit needs a cooldown**, or one pass registers on
  every substep; **your own throw must not hit you**; the bump push is symmetric
  and removes the approach speed, or bodies buzz.
- **The grapple's constraint must be SWEPT.** Reeling pulls centimetres a
  substep and `collide` only pushes out along the local normal, so an unswept
  constraint goes through walls.
- **`PORTAL_LIFT` must clear `PLAYER_R`, and is derived from it.** Mounted
  closer, the centre can never legally reach the plane: portals "worked
  sometimes", decided by frame rate. **A portal is one-sided**, and **the pi
  rotation is load-bearing** — negate TWO frame columns, or it is a reflection
  and the world comes out mirrored. The normal comes from the WALL (the SDF
  gradient), not from the aim.
- **The camera swing is a WHOLE ROTATION, not a lean.** A small-angle tilt
  cannot tell 10 degrees from 170; `camSwing` carries a real axis-angle offset
  sprung to zero. 98 degrees of snap becomes 0.000 on the first frame. The
  spring runs in EVERY upright mode. `cameraBasis` and `shaderAngles` must
  agree exactly, or the rope draws off the crosshair.
- **Boomerang: `BOOM_SKIN` must stay under `PLAYER_R`**, or every slightly
  downward throw skips off the ground before it leaves your hand. **Turning it
  round is a ROTATION, not a lerp** — mixing two opposite unit vectors and
  renormalising returns the original, so the first version never turned at all
  and ran to NaN. Bounce only when `d.n < 0`, and push clear by the penetration
  depth. `BOOM_LIFE` bounds the arclength composed into the placement.
- **`selfHist` is FOLDED and `trail` is UNFOLDED, deliberately.** The marcher
  needs folded samples; recall means "put me back at the point of the MANIFOLD
  I was at", which a folded store cannot name after a crossing.
- **Interpolating the light-speed history takes THREE things**, and missing any
  one tore the body into stripes: interpolate along the segment using the
  element `linkHistory` recorded (never search for the nearest copy); fold the
  interpolated point; and divide the step by `1 + speed/c`, because that centre
  MOVES as the ray advances and sphere tracing assumes a fixed field.
- **A pane's normal must be folded by the SAME element as its centre**
  (`foldElement`), or the plane stops passing through its own centre. `CUT_R`
  stays well under the inradius, because one straddle copy is not enough.
- **Do not measure holonomy through `alignUp`.** Under plane gravity E3 is
  already up, so the re-pinning rotation is the identity and the meter reads
  zero everywhere.
## Current state and next steps

1. ~~Geometry module with tests~~ — 36/36.
2. ~~Geodesic ray marching~~ — done.
3. ~~Exact distance for the SDF~~ — every primitive has a closed-form
   hyperbolic distance, so the marcher steps by it.
4. ~~Gravity, a level, and a grapple~~ — 72/72.
5. ~~A marcher that survives seams and range~~ — measured, not eyeballed.
6. ~~Cover, portals, a filled 3D world, a boomerang~~ — done.
7. ~~Two characters and a collision check~~ — done. `physics.js` has
   `makeCharacter`, `damage`, `boomerangHits` and `orbitDist`; main.js has a
   chasing opponent and both healths.
8. ~~A kit worth fighting with~~ — boomerang (bouncing, homing), build,
   decoy, recall, sightline cutter, holonomy dash/blast, anchor swap, portals,
   beacon, grapple. 160 tests.
9. ~~Multiplayer~~ — two players over WebRTC, `net.js`. The netcode is
   ordinary, the STATE is not: see
   [docs/archive/gameplay-kit.md](docs/archive/gameplay-kit.md).
10. ~~Actual game modes~~ — the hoop course, the grapple course and the
    dropper, all in `modes.js` with 78 tests. The dropper needed a fourth
    geometry rather than a fourth set of numbers.
11. ~~More than one geometry, and not all of them quotiented~~ - SIX now:
    H^3/Gamma (two groups), S^3, H^2 x R, S^2 x R, and E^3/Lambda (two
    lattices). THREE have no quotient at all, on purpose, and a fourth has one
    the renderer handles entirely inside its distance function. `shader.js`
    emits one scene program per geometry via `fragFor(key)`, selected by `#if`
    rather than a uniform; `product.js` gives the two products one set of
    formulas the way `geom.js` does for the constant-curvature three; and
    `engine/geometry/registry.js`, `engine/runtime/world-motion.js` and `levels/presets.js` are the registry, the
    motion adapter table and the presets, so adding a geometry is a
    registration rather than a sweep through main.js.
12. ~~Porting a flat map into a curved one~~ - `port.js`, `tools/port-map.js`.
    Three embeddings, each exact in one property, plus the measurements that
    say which. See "Porting a flat map" under Level authoring, and
    [docs/archive/geometry-worlds.md](docs/archive/geometry-worlds.md).
13. ~~A world where a ported map is exact~~ - `e3t.js`. The point of item 12
    was never a table of distortions, it was being able to PLAY the comparison,
    and that needs a flat world to play the undistorted half in.
14. **A shared way to EMIT a level across geometries.** The next task, and
    more overdue with every world. FIVE now hold their scene as data and emit
    it twice by hand (`level.js`, `s3.js`, `h2r.js`, `s2r.js`, `e3t.js`), each
    with its own copy of the same `num()` helper and the same emit loop. That
    duplication is exactly what `tools/sdf-check.js` exists to catch drifting.
    See TODO.md Part 2b.
15. **Nil, Sol and SL~(2,R)** — the three Thurston geometries still missing.
    See below.

## The three that are left, and why they are hard here

Five of the eight Thurston geometries are in: E^3, S^3, H^3, S^2 x R, H^2 x R.
The three that are not are **Nil**, **Sol** and **SL~(2,R)**, and they are all
hard for one architectural reason rather than for three mathematical ones.

**This renderer is a SPHERE TRACER, and sphere tracing needs a distance.**
Every primitive in every world here has a closed-form distance — an `asinh` of
one inner product, a Pythagoras of two factors, a wrapped difference — and the
marcher steps by exactly that. The whole "compute at the origin, carry by an
isometry" idiom rests on the same thing: `gamma(t) = cosK(t) o + sinK(t) u` in
the constant-curvature three, a pair of independent factors in the products,
`p + t*dir` in the flat one.

In Nil, Sol and SL~(2,R) there is no such formula.

- **Nil.** Geodesics ARE closed form — they are helices, explicit in the
  initial conditions — but the DISTANCE to a point is not, and the distance to
  a surface certainly is not. So the geodesic flow can be integrated exactly
  and every SDF has to become a bound rather than a value.
- **Sol.** Neither is closed form. Sol has no rotational symmetry at all (its
  isometry group's stabiliser is finite, order 8), so "compute at the origin
  and carry" saves nothing, and geodesics must be integrated numerically. It is
  also the one where the geometry is most VISIBLE: one horizontal direction
  expands like e^z and the other contracts like e^-z, so which way you face
  changes how far away everything is.
- **SL~(2,R).** A twisted product of H^2 with R — a line bundle over the
  hyperbolic plane rather than a product — so `product.js` nearly applies and
  does not.

**The reference is the same one the renderer already came from**: Coulon,
Matsumoto, Segerman and Trettel, "Ray-marching Thurston geometries", which
does all eight. Their answer to the above is a DISTANCE UNDERESTIMATOR plus
numerically integrated geodesic flow, and taking it means the marcher's step
rule stops being "step by the distance" — which is a change to the load-bearing
loop, not an addition beside it. Worked examples per geometry are at
3d.wlu.edu/vr/examples; the GLSL is inside string literals in the bundles, so
grep for `raymarch`, `creepingFlow`, `teleport` or `doesItScatter`.

**The order to take them in is Nil, then SL~(2,R), then Sol**, because Nil
keeps exact geodesics and only loses exact distance, so exactly one thing
changes at a time.

**~~The known limit before more weapons go in~~ — FIXED.** `physics.js` used to
hold ONE boomerang slot, ONE block, ONE decoy and ONE pane as module-level
singletons, so two fighters could not each have one out locally and a bot that
threw a boomerang silently took the player's. All four are now `Map`s keyed by
OWNER id.

Every function takes a trailing `id = 0`, so the local player is owner 0 and
every existing call reads as it did. What actually needed care was the handful
of functions that act on ALL of them at once, and they are the ones to check
when adding a fifth:

- `blockSDF` and `cutSDF` take the **minimum over every** solid block or pane.
  Anything less and one player's wall is scenery the other walks through.
- `carryBoomerang`, `carryBlock`, `carryDecoy`, `carryCut` carry **every**
  owner's through a fold, by the same group element. Missing one leaves it a
  cell behind, where coordinates grow like `cosh` of the gap.
- `boomerangHits` skips each throw's **own** `b.owner` rather than a single
  `skip` the caller had to remember to pass.
- `blockStepAll` / `decoyStepAll` / `cutStepAll` age everyone; main.js calls
  those and then reads owner 0 for the HUD. **Do not also call the singular
  step** — that ages owner 0 twice.

`physics.test.js` pins all of it; the fold-carries-every-owner test and the
SDF-minimum test were both confirmed to fail against a deliberately
single-owner mutation.

**The remaining bound is the MARKER ARRAY, not physics.** `MARKS = 10` in
main.js and shader.js, and `marker()` silently `return`s once `markN >= MARKS`.
The anchor, beacon, opponent and a blast already claim slots, so three owners
with a throw, a block, a decoy and a pane each will quietly stop drawing. It
fails invisibly — nothing errors, the object is simply not there. Raise MARKS
in BOTH files together, and re-run `tools/link-time.js`, because the marker
loop is inside `sceneMap`.

## Design constraints that come from the geometry

- **Volume grows like e^{2r}.** Opponents shrink fast with distance. A fighter
  here wants short engagement ranges.
- Unlike Nil there is a full SO(3) stabiliser, so free rotation exists and
  nothing forces characters upright. `alignUp` imposes that by choice.
- The floor is H^2, so ground movement is hyperbolic: flanking is cheap,
  retreating is very cheap, and a straight-line chase is a losing move.

## References

- **"Ray-marching Thurston geometries"** (Coulon, Matsumoto, Segerman,
  Trettel), source at plmlab.math.cnrs.fr/3-dimensional.space/source — the spec
  for the renderer, same "compute at the origin, carry by an isometry" idiom.
  Three things in this codebase came from reading it: re-basing the chart at
  every teleport (their `localV0`), solving for the face crossing rather than
  bounding it (their binary-search "creeping", done here in closed form), and
  per-channel `absorb` for the fog. Their volumetric scattering is a path
  tracer and was deliberately not taken.

  A built copy used to sit in `wluThurstonVR/` and has been deleted. If it is
  ever wanted again, download the hyperbolic example from 3d.wlu.edu/vr/examples
  — it is a bundle, so the GLSL is inside string literals in
  `build/thurston/thurstonHyp.js`; grep for `raymarch`, `creepingFlow`,
  `teleport` or `doesItScatter`.
- **HyperRogue / Hyperbolica** — shipping games in hyperbolic space, for how
  navigation and level design actually feel.
