# Hyperbolic grapple game, in a 3-manifold

## What this is

A game set in a **hyperbolic 3-manifold**: H^3 of curvature -1, quotiented by
a discrete group. Movement, gravity, rendering and a grapple hook, all done
honestly in the geometry. It was a Nil game first; the port to H^3 is complete
and no Nil code remains.

The developer's background is AP CS (Java). Assume comfort with loops, arrays,
recursion and OOP; assume no prior JavaScript, WebGL, GLSL or differential
geometry. Explain graphics and geometry concepts when they come up. Do not
explain what a for loop is.

README.md carries the tour: what the geometry feels like, why a horosphere
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
  `geom.test.js` (69) and `s3.test.js` (28) — `node hyp.test.js`, etc.
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

- `node tools/shader-check.js` — compiles both programs headless and prints the
  info log. **Run after every shader edit.** It is the only way to tell a GLSL
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
- `node tools/link-time.js` — links both programs on the REAL GPU (D3D11, not
  SwiftShader) and times it. **Run after adding level content or any new call
  to `sceneMap`.** A link over a few seconds means something is being inlined
  or unrolled more than once; it caps at 15 s, because past that the browser
  kills the GPU process mid-link and the page dies with an empty error. This is
  the only tool that can see that, and it is the bug that broke the page.
- `node tools/sdf-check.js` — evaluates the GLSL `levelMap` on the GPU at a few
  thousand points and compares against the JS one. Run after touching either.
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
  Namespace imports (`import * as ns`) still break it — the browser is fine
  with them, so this bites only here. It therefore **throws and names
  the offending line** rather than emitting a bundle with a live `import` in
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
    Curvature     hyperbolic / spherical   a different SPACE, not a level
    Gravity       floor plane / beacon / none
    Movement      walking / rolling   steer the velocity, or spin a ball up
    Camera up     gravity / pendulum / free
    Roll          hold / momentum     Z and C, about the view axis
    Light speed   instant / fast / slow   c = 0 / 6 / 2 world units per second
    Portals       off / on            keys 1 and 2 place a pair, 3 clears
    Boomerang     aimed / closed geodesic / off   key B
    Build (G)     on / off            a delayed block; see Abilities
    Course (K)    off / hoops / grapple   two timed courses. See Game modes
    Holonomy (Q)  sign decides / dash only / blast only
    Opponent      bot / network / off a bot that chases, or a real player (N)
    Fog           normal / thin / thick
    Shading       ambient occlusion / flat
    Domain edges  show / hide         the gold octagon outlines
    Quality       low / medium / high march steps (160 / 220 / 280)

Zoom is on the SCROLL WHEEL, not in the menu — it is a thing you do while
looking, like aiming. `X` snaps back to 1x.

## Abilities, and the geometry each one rests on

Every one is a thing you cannot do in a flat world. That is the bar.

**Gravity beacon (F).** Swaps which function gravity is the gradient of:
distance to the floor plane becomes distance to a point. Level sets become
spheres, so you fall inward and orbit rather than land. It follows the ONE lift
you planted (`carryBeacon`); aiming at the nearest lift flips gravity whenever
you cross the equidistant surface.

A linear potential CONFINES you — there is no escape speed, and in a compact
manifold there is nowhere to escape to. Circular-orbit speed is
`sqrt(G * tanh(r))` against the floor world's `sqrt(G / tanh(h))`; both tend to
`sqrt(G)`. `physics.test.js` measures the `coth` against the simulation.

**Holonomy dash (Q).** A straight impulse along the view direction, with
`DASH_COOLDOWN` before it can be used again. It used to take itself back with
an opposite impulse later, which is tidy and plays badly — the speed evaporates
under you mid-arc.

The bank fills by going around things. Transporting a frame around a closed
loop on a curvature -1 surface rotates it by the area enclosed; `sweptArea`
accumulates exactly that, since in geodesic polar the swept sector integrates
to `(cosh(r) - 1) dtheta`. Circling wide is worth enormously more than circling
tight, and walking straight banks nothing.

Do NOT try to measure this through `alignUp`. On the floor under plane gravity
E3 is already up, so the re-pinning rotation is the identity and carries no
information. The first version of the meter read zero everywhere.

**THE BANK IS SIGNED, and the sign is a second ability.** `sweptArea`
integrates `(cosh(r) - 1) dtheta` and `dtheta` has a sign, so circling
counter-clockwise fills it positive and clockwise fills it negative — and going
back round the other way empties what you had. That sign used to be thrown away
by a `Math.abs` in `dash()`, which is a waste of the most interesting thing the
meter has: **which way you went round something decides which ability you have
charged.** Under `Holonomy (Q) = sign decides`, positive is the dash and
negative is a BLAST: `holoBlast` damages and shoves everything within
`blastRadius(charge)` of you, measured on the ORBIT like every other
interaction between characters.

The radius runs 0.55 to 1.60, which sounds like a factor of three and is not:
volume grows like `e^{2r}`, so a full charge reaches about **six times** the
space an empty one does. `physics.test.js` asserts on the volume rather than
the radius for exactly that reason. Note also what the same arithmetic says
about the arena — the octagon world's covering radius is under two, so a fully
charged blast very nearly covers the whole cell, and there is no standing off
at range in a room that comes back round to itself.

`dash only` and `blast only` are kept because a mode where you cannot choose is
a hard sell as the only mode, and comparing the two is the reason both exist.

**Zoom (scroll wheel, 1x to 8x).** An honest optical zoom: divide the
transverse ray offset by the zoom and the fan narrows, so every ray is still a
geodesic and what you see is still what light does. Three things ride along
with it and all three are needed, or the zoom looks broken rather than close:
the hit threshold is a PIXEL FOOTPRINT, so it must shrink with the zoom or
magnified surfaces come out blobby; and fog and `uMaxT` have to back off, or
zooming in only magnifies the fog. It costs less than the fan it replaced,
because the direction no longer depends on t.

It REPLACED flat vision, which scaled the fan by `alpha(t) = t/sinh(t)` and so
converted the hyperbolic `s/sinh(d)` falloff into the flat `s/d` one exactly,
leaving the near field alone because alpha(0) = 1. That is a thing a zoom
cannot do, and it was lovely — but it was a LENS, the sample path stopped being
a geodesic, and depth stopped reading as depth, which is hard to fight in. If
it is ever wanted back, it is the one-line `rayDir` in shader.js plus a t in
the signature — but note it also forced `exitDist` to be recomputed at every
step, which the zoom does not.

**Finite light speed, and it moves the PLAYER, not just a pulse.** Light from
distance t left `t/uLightC` seconds ago. The orbs pulse, so the same orb is
caught at a different phase in every copy; and your own body is drawn from a
HISTORY — a ring of 32 folded positions, one every 0.2s, indexed by distance in
`selfAt`. The copy two cells off shows where you were a moment ago; the one
five cells off, long before. One object, a procession of its own past, all in
view at once. This is the thing only a compact manifold can show, because it is
the only place you can look at yourself from outside.

The first version pulsed the ORBS only — the material test was
`mat > 3.5 && mat < 4.5` and the player is a different material — so staring at
your own copy showed nothing, which was the whole point of having a body.
Interpolation between samples is a straight combination pushed back onto the
hyperboloid; without it the copies advance in visible jerks five times a second.
The drawn body is `PLAYER_R * 1.25`, a little bigger than the collision radius,
because a sphere the size of the hitbox is a speck one cell away.

**Interpolating that history takes THREE things, and missing any one of them
tore the body into horizontal stripes.**

1. **Interpolate along the segment, not between two folded neighbours.** Every
   entry is folded as it is recorded, so a face crossing makes the stored trail
   jump right across the room while the player has not moved. Mixing across
   that swept a phantom body through the domain at 88x the honest speed, and
   every ray caught it somewhere different — thin sheets where a sphere should
   be. `main.js linkHistory` records WHICH group element each crossing folded
   by, so the far end of each segment is the near end's own copy.
   **Do not look for the nearest copy instead** — a fold can be a product of
   two generators, the search misses it, and collapsing the segment turns a
   smear into a hard step, which measured 70x worse than the bug.
2. **Fold the interpolated point.** A straddling segment ends outside the
   domain, and the marcher only ever samples inside it, so an outside centre
   draws the body in the wrong place — and consecutive segments would not join.
   One pairing is enough; a sample is a fifth of a second of travel.
3. **Divide the step by `1 + speed/c`.** This is the one surface in the scene
   that MOVES as the ray advances — its centre is `selfAt(t)`. Sphere tracing
   assumes a fixed field, so the raw distance overshoots by up to that
   fraction, and at the slow setting speed/c approaches 1 and the ray punches
   clean through on some pixels and not others: holes, in bands.

   Measured, walking at 1.0 with c = 2: the centre drifted at 25.8 per unit of
   ray distance before and 0.50 after — and 0.50 is exactly speed/c, the honest
   answer. Measure it as distance in the MANIFOLD, not in coordinates: what is
   drawn is the whole orbit, so changing which representative you name is
   invisible on screen and a coordinate metric reports it as an enormous jump.

**The grapple's constraint must be SWEPT.** When the rope goes taut it MOVES
the player along it, and a move that is not swept is a move that goes through
walls: reeling hard pulls several centimetres a substep, the rope does not care
what is in the way, and `collide` — which only pushes out along the local
normal — could not always get you back. `grappleStep` now casts along the pull
and stops a body's width short of the first surface, so the wall wins. A rope
pulling you into a wall pins you against it, which is the right answer.

**Portals (1, 2, 3).** A pair of discs and one isometry,
`T = Pb * R_pi * inv(Pa)`, where a portal placement's column 3 is where it is
and column 0 is its outward normal.

**The normal comes from the WALL, not from the aim.** `placePortal` casts,
then takes the SDF gradient at the hit point and orients column 0 along it, so
a floor portal lies flat and a wall portal stands upright however you were
standing. Facing it along the look direction instead put the disc at whatever
angle you happened to be at — and since the pairing is built from the two
placements, a crooked portal quietly tilts everything you walk out into. With
nothing in range there is no surface to take a normal from, and it falls back
to hanging in the air facing you.

**`PORTAL_LIFT` must clear `PLAYER_R`, and it is derived from it.** Collision
stops the player's CENTRE at `PLAYER_R` from the wall, but crossing a portal is
the centre passing through its plane. Mounted closer than that, the centre can
never legally reach it: you walk into the wall and stop. It was 0.06 against a
0.07 player, which is why portals worked "sometimes" — only when a fast enough
approach carried the centre past the plane inside one substep, before `collide`
pushed it back out. A coin flip decided by frame rate.

Nearly free here because the quotient
already built it: a face of the fundamental domain IS a portal glued by the
group, and the renderer handles both the same way. `exitDist` and
`portalCross` are the same closed form.

Two things are forced rather than chosen:

- **A portal is one-sided.** Crossing A front-to-back puts you BEHIND B moving
  out of it, so you immediately cross B back-to-front. If that counted as a
  crossing too you would bounce straight back.
- **The pi rotation is load-bearing.** Without it you emerge going backwards
  into B's wall. Negate two frame columns rather than one, or it is a
  reflection and the world comes out mirrored.

**A portal hands you a different "down", and the camera has to SWING to it.**
`alignUp` re-pins the frame in a single substep — 98 degrees, measured, walking
from a wall portal into a floor one. That is the yank.

**The swing is a WHOLE ROTATION, not a lean, and the first attempt got this
wrong.** The pendulum's `tilt` is a small-angle 2-vector, which is right for
leaning into a stop and hopeless here: its magnitude is `sin(angle)`, so it
cannot tell 10 degrees from 170, and clamping it to a third of a radian left
fifty of those 98 degrees still happening in one frame — which still reads as a
snap, because it is one. So `camSwing` carries a real axis-angle offset instead,
taken off the 3x3 block of the rotation `alignUp` applied, with its angle sprung
back to zero. Measured: **98 degrees of snap becomes 0.000 degrees of jump on
the first frame**, under one degree by 1.6 s.

`cameraBasis` applies it to the whole basis at once and `shaderAngles` folds the
result back into the yaw/pitch/roll the shader builds its own basis from —
checked exact to 3e-14 over 200000 random view-plus-swing combinations, because
if those two disagree the rope draws off the crosshair.

The spring runs in EVERY upright mode, not only 'pendulum' — only the
acceleration drive belongs to that setting.

**Boomerang (B).** Flies a CLOSED GEODESIC, so it returns to exactly where it
was launched — not because anything steers it, but because the manifold is
compact and some of its geodesics close up. It flies dead straight the whole
way. Which axis it takes is a heuristic (alignment with the aim, less how far
out of the way it is); the geometry is exact once chosen. It is CAUGHT after
one lap, because after one lap it is back in your hand; without that it flew
for ever and the HUD read OUT until you respawned.

**That mode sweeps the FLOOR in the bounded world, and that is forced.** Every
generator of the octagon group is a translation along an axis LYING IN the
floor plane, so every closed geodesic there lies in that plane — measured, all
8 axes at altitude 0.0000. It therefore skims the ground however you aim, which
reads unmistakably as gravity dragging it down. **Nothing pulls it down**:
gravity is not in its integrator and never was. It is a fact about the octagon
group. In the OPEN world the axes range over 1.36 of altitude and it is a
genuine 3D path.

**So the DEFAULT is `aimed`:** dead straight down the sightline, out to
`BOOM_RANGE`, then back to your hand. It does not need the manifold to return
it, so it works at any aim — aim 40 degrees up and it reaches altitude 2.9 from
a launch at 0.6, which is the test. `closed geodesic` keeps the old behaviour
on the way out, because letting the manifold hand a projectile back is the more
interesting thing and should not be lost.

**It BOUNCES, and a bounce costs nothing to be exact about.** Along a geodesic
the velocity in FRAME components is constant, so at any moment the direction of
travel at the current point, in that point's own frame, is just `b.dir`. A
rebound is therefore the ordinary `d - 2(d.n)n` against the SDF gradient there,
followed by re-basing the flight onto the wall — a bounced throw is as exact as
a straight one, and it is a new geodesic rather than a special case of
anything. Two guards: only bounce when `d.n < 0` (heading INTO the surface), or
it flips twice on consecutive substeps and sits vibrating in the wall; and push
clear by the penetration depth, or the next substep finds it inside again. It
bounces off the level, off blocks and off panes, because all of those are
`worldSDF`. A deflected closed geodesic is no longer closed, so a bounce
switches that mode to the homing return.

**The rebound test is against `BOOM_SKIN`, not the drawn radius, and it MUST
stay under `PLAYER_R`.** A throw leaves from the player CENTRE, and `collide`
only guarantees that centre is 0.07 clear of anything - so a 0.09 boomerang is
already inside the floor at launch, and testing the full radius made every
throw aimed even slightly downward skip off the ground before it left your
hand. Measured: one bounce on the first substep at 10 degrees of depression.

**It comes back to WHERE YOU ARE, not to where you threw it from.** The return
leg is a chase, not a geodesic: it steers at the `nearestLift` of the point
handed in, so it flies at the copy of you it can actually see, which may well
be through a face. `boomerangStep(dt, sdf, home)` — pass `home` as null and it
does not steer at all, which is what the closed-geodesic drift test needs.

**Turning it round is a ROTATION, not a lerp, and this is a real trap.** Mixing
two unit vectors and renormalising looks like a cheap slerp and fails
completely at the one angle that matters: for `d` exactly opposite `u` the mix
is a shorter copy of `d`, which normalises straight back to `d`. A throw aimed
dead ahead turns round into precisely that case, so the first version never
turned at all — it flew out and kept going until the lifetime killed it, with
coordinates doubling every half second (measured: 1.6e7 by t = 6.5, then NaN).
`turnToward` is Rodrigues about `d x u`, with any perpendicular axis when that
cross product vanishes. The aimed throw ALSO reverses on the spot at range, so
the return starts by retracing and bends from there — both because that is what
a boomerang looks like and because it keeps the degenerate case from arising.

`BOOM_LIFE` is a hard stop, and it does double duty: it bounds the total
arclength composed into the placement by the homing re-bases, which is what
keeps `e^{total}` error growth harmless (a realistic flight is ~5 units, so
`e^5 * 1e-16` = 2e-14).

**Build (G).** A sphere of solid space where you are looking, which is NOT
solid when you throw it: `BLOCK_DELAY` of 0.75 s while it forms, then
`BLOCK_LIFE` of 9 s. The delay is the whole design — an instant wall is a panic
button, a wall that arrives in three quarters of a second is a prediction, and
a prediction is something an opponent can read and beat. It is drawn while
forming, at full size and a dimmer colour, so that read is available.

It is worth more here than it would be in a flat game for the reason everything
here is: volume grows like `e^{2r}`, so a 0.34 sphere blocks an enormous solid
angle from two units away and nearly nothing from six. **Cover is intensely
local** — you cannot wall off a lane, only the piece of it you are standing in.

Everything solid goes through `worldSDF` in main.js (`min` of the level and the
block), not `levelSDF`, or a block would be scenery you walk through.

**Bumping.** Characters collide, on the ORBIT distance — two fighters that look
like they are touching may be named a cell apart, and comparing coordinates
would let them walk through each other on screen while colliding with nothing
at a distance. The push is symmetric and removes the approach speed; without
that they interpenetrate and are pushed out every substep, and buzz.

**Decoy (V).** A copy of yourself, built out of your own position history.

The trail is already there — the finite-light-speed mode keeps it so the shader
can draw where you WERE. `plantDecoy` hands the last three seconds of it to a
body that walks that beat on a loop until it expires.

**It is drawn with the player's own material, and that is the whole ability.**
In a compact manifold your images already stand one cell away down every
sightline, so anyone looking at you is looking at a dozen of you: one more,
moving the way you move, is not a costume, it is genuinely the same thing to
look at. This is the one ability here that would not work at all in a flat
world, because there you have a single body on screen to compare it against.

It needs the near cutoff (see Rendering gotchas): a decoy planted while
standing still sits exactly where you are, and a camera inside a sphere fills
the screen with one flat colour.

**Recall (H).** Back to where you were three seconds ago, along your own path.

The trail it reads is the SAME samples the shader gets and the OPPOSITE
representative: `selfHist` is folded because the marcher needs it folded, and
`trail` is unfolded and carried through every crossing by the element that
folded the player. That is not a duplicate, it is the point. Recall means "put
me back at the point of the MANIFOLD I was at", and a folded store names
whichever lift happened to be current when the sample was taken — so a recall
after a crossing would drop you in a different copy from the one you walked.
The trail obeys the carried-objects rule exactly like the anchor and the
beacon, and it stays in range on its own because it is only a few seconds long.

`recallTarget` walks back down the trail rather than insisting on one index,
because something may have been BUILT in the place you were standing. It
returns null rather than dropping you inside a wall. The rope is dropped on
recall: an anchor several units away would yank rather than swing.

**Sightline cutter (T).** A disc of totally geodesic plane, for five seconds.

Its distance field is `asinh(<p,N>)` for a unit spacelike N — the same formula
the floor uses, exact, and one inner product wide. The disc is that slab
intersected with a ball, `max` of the two, which is exact inside and an
underestimate outside the rim: the safe direction, and the convention every
primitive in level.js already uses.

**The plane comes for free from the aim.** The ambient unit tangent to your own
aiming geodesic AT the point you are looking at is already a unit spacelike
vector orthogonal to that point, so it IS the plane's normal, with no
construction at all: `<at, N> = 0` and `<N, N> = 1` by definition.

An unbounded geodesic plane cuts H^3 into two CONVEX half-spaces and so blocks
line of sight completely, at any range — that is the argument the floor rests
on. This is a disc, so it does not manage that, but 0.6 against a cell of
inradius 1.0 covers a great deal of a lane. It and the block are the same idea
at different aspect ratios: a ball you hide behind and a pane you shut a
corridor with. The block has a delay and no aim; the pane is instant and
precisely aimed, with a longer cooldown.

**Its normal must be folded by the SAME element as its centre.** `foldElement`
exists for this and for nothing else. Fold them apart and the plane no longer
passes through its own centre, so it draws as a slanted sliver somewhere else.
Near an edge one straddle copy is not enough and the pane is clipped at the
second face — the same limitation level content has, and the reason `CUT_R`
stays well under the inradius.

**Anchor swap (E).** Trade places with the grapple hook.

Ordinary in a flat game and not here, for two reasons. The rope's length is
untouched, so you arrive at exactly the radius you left at and keep swinging —
from the other end of the same circle. And the anchor may be down a sightline
that WRAPPED, so the place you are trading into can be a different copy of the
room: you fired at something that looked far away and you were looking at the
back of your own head. It is a blink whose range you established earlier, by
aiming.

The frame goes with you by parallel transport along the connecting geodesic
(`warpTo`, shared with recall), so the velocity's frame components still mean
what they meant and nothing has to be re-aimed. It stops `PLAYER_R + 0.06`
short of the anchor, because the anchor is ON a surface.

**Swing-to-fly.** Above `sqrt(G)` the geometry lifts you faster than gravity
pulls. The HUD says so.

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

## The spherical world

`Curvature: spherical` is a DIFFERENT SPACE, not a different level, and it is
the smallest of the three to make into a place.

**S^3 needs no quotient.** It is already compact, so there is no fundamental
domain, no face scan, no pairing, no fold and no straddle copy — every one of
which exists on the hyperbolic side to fake compactness. Fly far enough in any
direction and you come back after 2*pi, because that is what a geodesic on a
sphere does. That is why the spherical program links in **4.7 s against the
hyperbolic 8.8**: `domainMap`, `exitDist`, `domainDepth`, the fold loop and all
39 level primitives are dead code there, and a `#define` lets the compiler see
it (see the inlining rule).

**APPARENT SIZE IS NOT MONOTONIC IN DISTANCE, and the scene is built to show
it.** An object of proper radius r at distance t subtends about `r / sin(t)`,
and `sin` peaks at pi/2 — so things look SMALLEST a quarter of the way round
the world and get bigger again as they recede, until at the antipode a single
point fills the sky. The scene is a ring of six at pi/2 (r 0.30, apparent
0.300) and a ring of eight at 2.80 (r 0.15, apparent 0.448): **1.78x the
distance and 1.49x the apparent size**. It is the exact inverse of the
hyperbolic worlds, where `e^{2r}` shrinks everything away almost at once.

**A LORENTZ MATRIX IS NOT AN ISOMETRY OF THE 3-SPHERE**, and this is the trap
the whole thing turns on. The hyperbolic spawn point has `<p,p> = -1` under the
Minkowski form, as it must, and `+1.81` under the Euclidean one where a valid
S^3 point needs exactly `+1`. Hand the spherical marcher a hyperbolic placement
and every ray starts 0.81 off the manifold, `hDist` never closes, nothing is
ever hit, and the screen comes out **99.3% black** — which is indistinguishable
from a shader that failed to compile. So switching curvature MUST re-place the
player (`resetForCurvature`), and `s3.test.js` checks `<p,p> = +1` on every
scene point for exactly this reason.

**There is no gravity and there cannot be.** "Down" has to be a function with
`|grad| = 1`, and on a sphere the only candidates point at a pole, so a whole
world would fall to one spot. Free flight is the honest model, which is the
other reason this was the cheap one: no floor, no walking, no rope.

**The range limit does not exist here, and that is the engineering case.**
Coordinates are bounded by 1 at every distance including the antipode —
measured, float32 holds `<p,p>` to 2.5e-8 at 0.999 of the way round, where the
hyperbolic side is already off by 1e-3 by d = 7. A level ten times bigger is
free in S^3 and impossible in H^3.

**What it is NOT:** the fighting kit. The boomerang, the block, the pane,
portals, the opponent, the courses and the self body are all built on `hyp.js`
and its group. The option locks below take them away rather than leaving dead
keys. The self body is the one worth coming back for: in S^3 light goes all the
way round, so you would see yourself down every sightline with no quotient at
all — but `selfHist` is a ring of FOLDED positions plus the elements linking
them, machinery that only makes sense when the marcher cannot leave a domain.

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
- **any course** takes the opponent, the boomerang, build and portals. A timed
  run has nothing to fight, and each one is a key that would do nothing.
- **the grapple course** additionally pins gravity, camera up and the bounded
  world, because a charge gate is opened by SWINGING and with gravity off there
  is nothing to swing from — every gate would stay shut for ever.

The first lock wins, so a different SPACE outranks a mode inside one.

## Game modes

`modes.js` holds the round system — phase, clock, ordered checkpoints, best
time — and it is DOM-free like physics.js so the rules are testable.
`modes.test.js` has 56.

**A MODE THAT DEFAULTS TO OFF NEEDS ITS KEY TO TURN IT ON.** Both courses
shipped working and unreachable. `KeyK` was gated behind `courseOn()`, the
option defaults to `off`, and K was missing from the on-screen key list - so
the only way in was to already know the mode existed and find it in the menu.
Pressing K did nothing, and since the hoops are a line-loop OVERLAY the map is
unchanged by design, so there was no signal at all that anything had happened.
**A key named on screen must always do something when pressed**; if the feature
is off, the key turns it on.

**And a run must START you on the course.** `geodesicCourse` has to lay its
hoops on the axis through the CELL CENTRE, because a geodesic parallel to a
generator's axis but offset from it does not close up - so the course cannot
come to the player and `beginRun` moves the player to the course. Altitude
matters for the same forced reason: every closed geodesic in the bounded world
lies IN the floor plane, so the hoops are centred at altitude 0 and the
ordinary spawn at 0.6 is above a gate of radius 0.3 *entirely*. Measured, gate
1's ring points on screen at the moment the clock started: **0 of 41 before,
34 of 41 after** (and 0 -> 41 for the grapple ring). `aimAt` inverts
`cameraBasis` through the same `logTo` that `project` uses, so where the camera
points and where the hoop draws cannot disagree.

**The hoop course (option `Hoop course`, key K).** Hoops laid along a CLOSED
GEODESIC, so the course returns to its own start with no turning: fly dead
straight and you arrive where you began. `modes.test.js` flies it and takes all
six without steering once.

**The ordering is not bureaucracy — without it the WRAP is the cheat.** In a
compact manifold a straight line eventually reaches everything, so an unordered
course would credit hoop five on the way to hoop two. Only `run.next` counts.

**The crossing test must ride on a segment whose ends are in the SAME chart.**
It uses `bankFrom` — the substep's start point already carried through any fold
that happened during it, which the holonomy meter needed first. Testing a raw
start against a folded end reports a flight right across the room at every face
crossing, and every hoop between would count at once.

**A course is a CARRIED object**, like the anchor and the beacon: `carryCourse`
moves every hoop by the same `g`, and each hoop's NORMAL by the same element as
its centre. Fold those apart and the plane stops passing through its own
centre, so the gate draws in one place and is crossed in another — the bug
`foldElement` exists to prevent, in its other form.

**Hoops are drawn as LINE LOOPS, never as shader primitives.** Anything in
`sceneMap` is inlined three times and paid for at link time, the budget that
once took the scene program to 212 seconds. A hoop is a curve, main.js already
draws curves for the rope, and a line loop costs the compiler nothing.
`hoopNear` picks the copy nearest the player, because a course spanning the
manifold has most of its hoops cells away in coordinates — drawn there they
project to the wrong part of the screen, since the marcher's view teleports at
every face and a line overlay does not.

**The bounded world's course is FLAT, and that is forced — the same fact as the
boomerang's.** Every generator of the octagon group is a translation along an
axis lying IN the floor plane, so every closed geodesic there lies in it too:
measured, all six hoops at altitude **0.0000**. It reads as a floor-level
slalom. In the OPEN world the same code gives altitudes 0.243 to 1.558, a range
of **1.315** — a genuine 3D flight course. **This mode is at its best in the
open world**, where the SPOKES are drawn along exactly those axes and the
scenery shows you the line before you know there is a race.

**The grapple course (`Course = grapple`) is the opposite mode, and it is what
the SIGNED holonomy meter was waiting for.** A ring of CHARGE GATES: a gate
will not count until `banked` reads past its threshold **with the right sign**.
`sweptArea` integrates `(cosh(r) - 1) dtheta` and `dtheta` has a sign, so
circling one way fills the meter and the other way empties it — until now that
sign only ever chose between a dash and a blast. The gates alternate, so
getting from a `+0.8` gate to a `-0.8` one means unwinding what you banked and
then banking as much again the other way round. And because the integrand is
`cosh(r) - 1`, a wide arc is worth exponentially more than a tight one: the
cheap charge is a long swing around a tower, not a spin on the spot. **In a
flat world the mechanic does not exist — the same integral is identically
zero.**

**A shut gate is flown THROUGH, not bounced off.** Making it solid would put a
disc across a corridor you are swinging down at speed, which is a wall you hit
by accident. The honest failure is that the pass does not count; `run.refused`
records it so the HUD can say why, and the ring draws RED until the meter
crosses.

**The gate ring is SEARCHED for, not written down** — the same lesson as the
opponent spawn. The obvious choice, floor radius 1.0 with no rotation, puts a
gate INSIDE a wall: the walls are a pinwheel at exactly that radius, and
`levelSDF` at the first gate reads **-0.034**. Swept over radius, altitude and
rotation, the best clear ring is r = 1.30, h = 0.45, rotated 9 degrees, which
stands every gate **0.336** clear and keeps them all within 1.412 of the centre.
`modes.test.js` asserts both that the chosen ring is clear and that the naive
one is not.

### Two that were considered and do not work here

**Rescaling the curvature radius ("flatten") is impossible in the quotient.**
The octagon's 45 degree angles depend on its size, so a smaller octagon stops
being a genus-2 fundamental domain. The group is rigid. Zoom is the substitute,
though a weaker one: it magnifies uniformly rather than converting the falloff.

**Tethering to an ideal point is impossible.** A compact manifold has no
boundary at infinity. Holonomy dash is the substitute.

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
9. ~~Multiplayer~~ — two players over WebRTC, `net.js`. See below: the netcode
   is ordinary, the STATE is not.
10. **Actual game modes.** The next task. There is now a kit; what is missing
    is a reason to use it — win conditions, rounds, a map built for a fight
    rather than for looking at.

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

## Characters, health and hits

A character is a placement, a velocity and some health, and the player is one
of them. Keeping them in one shape rather than special-casing the player is
what makes a second one cheap, and it is the whole prerequisite for a network:
that struct is what a packet carries.

**Distance between characters is the ORBIT distance, never the coordinate one.**
Space is H^3/Gamma, so the same character named one cell over reads as 3.06
away in coordinates and 0.00 away in the manifold — `physics.test.js` pins
exactly that. What you SEE is the orbit, so what a hit must use is the orbit:
the minimum over the group of the distance to each copy. Comparing raw
coordinates gives a weapon that misses what it visibly struck. Identity plus
the generators is enough, because two things close enough to touch are at most
one face apart.

**A hit needs a cooldown.** The boomerang overlaps a target for many substeps
of one pass, and without `HIT_COOLDOWN` it registers on every one of them and
deletes a character in a frame. The test checks a pass lands exactly once.

**Your own throw must not hit you.** `boomerangHits` skips the thrower's id: it
comes back to your hand, not into your face.

**The opponent spawn is SEARCHED for, not written down.** The first hand-picked
pair sat 0.30 from a tower of radius 0.26, so the bot spawned wedged against
it — every step drove it into the surface, `collide` cancelled the velocity,
and it stood still for five seconds looking like broken pathfinding. From a
clear spawn it closes 0.899 to 0.005. Clearance is capped at `PLAYER_R` for
anything standing on the floor, because the floor is part of the level, so the
test is "as clear as open ground", not "clear by a wide margin".

**Both movement models are live and toggleable**, so they can be compared
without deleting either.

## Multiplayer

Two players, `net.js`, `tools/relay.js`, `tools/net-check.js`. Set
`Opponent: network` in the options and press `N` for the panel.

**The netcode is ordinary on purpose:** an unreliable data channel
(`ordered:false, maxRetransmits:0`), each peer authoritative over its own body,
twenty state packets a second, the remote body smoothed toward the last packet.
A packet that arrives late is worse than useless — it would overwrite a newer
one — and the next is 50 ms away, so a lost one costs a frame of smoothing.

**The STATE is the part that is not ordinary, and it turns out to be easy for a
reason worth knowing.** A position here is a point of H^3/Gamma and therefore
has infinitely many names, one per group element; two peers who walked the same
route are in general holding DIFFERENT representatives, because each folded at
whatever moment its own substep crossed a face. "Send me your coordinates" is
meaningless.

The fix was already in the game because the renderer needed it first:
**`reduceToDomain` is canonical**, `reduce(g*p) === reduce(p)`, which
`hyp.test.js` pins and `physics.test.js` now re-checks from the network's side
over 200 random placements. So the folded representative is a name both ends
agree on. Fold everything before it goes on the wire and the packet means the
same thing at both ends. Everything in `packState` is folded, including the
pane's normal — by the same element as its centre, via `foldElement`.

Two consequences:

- **Both peers must be in the SAME World.** Different groups, different
  fundamental domains, so a folded point from one is nonsense in the other. The
  world index rides in every packet and the receiver refuses to draw a mismatch
  and says so on the HUD.
- **Every distance between players is an ORBIT distance.** Folded coordinates
  can differ by a whole cell for two players standing next to each other across
  a face. This was already true for the bot.

**The remote drives the same `foe` character the bot does.** That is the whole
reason characters were pulled into physics.js: the struct a bot moves is the
struct a packet carries, so there is no second code path. `stepFoe` returns
early in network mode — nothing local may touch a body the other end owns.

**Damage is self-assessed at both ends.** I decide whether their boomerang or
blast caught me and broadcast my own health; they do the same. Neither player
can be hit by something they never saw, and there is no authority to argue
with. The right trade for two players and no server.

**Their block and their pane are in `worldSDF`.** Not optional: a wall that is
solid on one screen and not the other is not a wall, it is a disagreement, and
it shows up the first time one player stands behind something the other walks
through.

**`bump` takes only your own half over a network.** Both ends run the same
push against their own copy, so shoving the remote body as well fights the next
packet and reads as the other player jittering.

Interest management, if this ever grew past two, is INVERTED compared to a flat
game: volume grows like `e^{2r}`, so almost everyone is far away and trivially
culled and the handful near you dominate. A uniform grid is exactly the wrong
structure.

### How to actually play it

The game is **static files**. There is nothing to install and no build step, so
"hosting" it means putting the folder somewhere a browser can fetch it.

- **Same machine, two windows** — Live Server as usual, or
  `node tools/relay.js` and open `http://localhost:8080/`.
- **Same network** — `node tools/relay.js` on one machine; the other player
  opens `http://<that machine's LAN address>:8080/`. Both press `N`, use the
  relay box with the same room name.
- **Over the internet, no server at all** — put the folder on any static host
  (GitHub Pages, Netlify, itch.io, Cloudflare Pages; all free, all a drag and
  drop or a `git push`). Both players open the page, one presses `N` and
  `Host`, sends the code by whatever they already use to talk, the other pastes
  it and `Join`s, and sends the reply back. **This is the path that needs no
  infrastructure whatsoever** — the two browsers connect directly and the codes
  are just text.
- **Over the internet, with matchmaking** — the relay on any host with an open
  port. It only ever forwards the two handshake blobs; kill it mid-match and
  the match continues.

Sending someone a download works too but is worse: they need a local server
anyway, because ES modules will not load from a `file://` URL.

**HTTPS matters.** Pointer lock and WebRTC both require a secure context, which
means `https://` or `localhost`. A page served over plain `http://` from
another machine's IP will not lock the mouse. Every static host above is HTTPS
by default; a LAN relay is exempt only because `localhost` is.

### Limits of doing this on the web

- **No UDP.** WebRTC data channels are the only unreliable transport a browser
  has, and they are SCTP over DTLS over UDP — fine, but you cannot hand-roll a
  packet layer.
- **Signalling cannot be avoided.** Two browsers cannot find each other without
  exchanging a blob first. Copy and paste is the zero-infrastructure answer.
- **NAT.** A public STUN server handles most home connections; symmetric NAT
  needs a TURN relay, which is bandwidth someone has to pay for. The relay here
  is NOT a TURN server — it forwards handshakes only.
- **Shader link time is a real budget** (see the inlining rule). A browser will
  kill a GPU process that takes too long, and there is no way to precompile.
- **32-bit floats in the shader** cap the range at about `d = 7`, which is why
  the level is small. That is a limit of the platform, not of the idea.
- **No threads worth having.** Web Workers cannot share a WebGL context, and
  the physics is cheap; the marcher is the cost and it is already on the GPU.

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
