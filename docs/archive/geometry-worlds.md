# Archive: the six worlds, and the design rationale for each

Moved out of CLAUDE.md on 2026-09-07, when the project turned toward an
engine/editor and these became reference implementations rather than the
active roadmap. Nothing here is obsolete -- it is the argument for why each
world exists and what it demonstrates, which is worth keeping and is not worth
loading into every session.

**The TRAPS from these sections were NOT moved.** They live in CLAUDE.md under
"Traps in the archived subsystems", in imperative form. If you are about to
change one of these worlds, read that list first and then come here for the
reasoning behind it.

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

## H^2 x R, the product geometry

`Curvature: H^2 x R` is the fourth geometry and the third scene program. It is
the first one here that is **not of constant curvature**: it is a PRODUCT, a
hyperbolic plane crossed with a Euclidean line, and the two factors do not
interact at all.

    a point   (x0, x1, z, x3)   with x0^2 + x1^2 - x3^2 = -1, z free
    the H^2 factor   components 0, 1, 3
    the flat factor  component 2, which is the height, an ordinary number

**The tangent form is diag(1,1,1,-1), the SAME one H^3 uses**, because the
extra `+z^2` of the flat factor sits exactly where H^3's third spatial
coordinate does. That is why `mdot`, the lighting and every normalisation in
the shader are shared with the hyperbolic build unchanged, and only distance,
the ray, the chart composition and the up vector had to be written twice.

**Distance is PYTHAGORAS in the two factors, exactly:**

    dist(p, q) = hypot(horizDist(p, q), p.z - q.z)

Not an approximation and not an underestimate, which is why every SDF here is
exact rather than the usual safe underestimate. A vertical column is a
horizontal distance with the height dropped entirely; the floor is the height
coordinate itself, which is the cheapest exact surface anywhere in this
project.

### THE TRAP: the height is AFFINE, so a mat4 multiply is wrong

`Isom(H^2 x R) = Isom(H^2) x Isom(R)`, and that **does not embed in GL(4)** on
this model. The H^2 part is a 3x3 Lorentz block on components 0, 1, 3; the
height part is an ordinary translation, which must be ADDED and never scaled.

A plain matrix multiply scales the stored height by the other factor's timelike
coordinate. Measured: a step of 1.3 along a direction 60% horizontal, from a
placement 2.1 up, landed at **3.812 instead of 3.140** — the 2.1 had been
multiplied by `cosh(0.78) = 1.3199` — and `M o inv(M)` was off the identity by
1.62. So `h2r.js` has its own `applyPoint`, `applyVec` and `compose`, and the
shader has its own `chartMap` and `chartRebase`. `h2r.test.js` pins both the
right answer and the wrong one, so the test cannot pass by restating the
implementation.

`applyPoint` and `applyVec` differ in exactly one component and keeping them
straight is the whole discipline: a POINT's height translates, a TANGENT
VECTOR's does not.

### What the geometry buys, and it is three things

**1. The fall time does not depend on the input.** `z = const` is totally
geodesic, so a horizontal geodesic stays at its height. Measured on the real
integrator, dropping from 24 at horizontal speeds 0, 0.4, 0.8, 1.6 and 3.0:
**the same time to every printed digit**. In H^3, with H^3's own integrator,
the same drop from altitude 3 takes 1.4146 s at a standstill and **never lands
at all** at walking speed 0.9. That contrast is the headline test.

**2. The frame never tilts, so there is no `alignUp`.** Parallel transport in a
product is componentwise: E3 stays exactly vertical and E1, E2 stay exactly
horizontal, measured to 1e-16 over a 400-step wandering walk. In H^3 that is
false and `physics.alignUp` exists precisely to re-pin it — 111 degrees in one
substep when it was left out of the open world.

**3. The range limit applies to the HORIZONTAL factor only.** The height is an
affine coordinate, so it is exact at any depth: 1e6 units up is stored exactly.
That is why a 44-unit shaft is free here and impossible in H^3, where
coordinates grow like `cosh` and run out of float64 near d = 16.

But the horizontal factor has the ordinary hyperbolic limit, and here there is
**no quotient to fold it back** — so unlike the compact worlds, a ray really
can march out to where float32 has nothing left. **That drew as speckle across
the entire far field and looked exactly like a precision bug in the normal.**
It was not: it is the documented d = 7 limit, arriving somewhere new because
nothing was folding. The fix is a PER-RAY cap:

    horiz = length(dir.xy)                 // the ray's share of the H^2 factor
    tCap  = min(uMaxT, 7.0 / max(horiz, 1e-4))

so a sightline straight down the shaft runs the full 60 units and one across
the floor plan is cut at 7 and ends in fog — which is what a horizon is. Note
that this is the only place in the project where the range limit is a
*rendering* parameter rather than a level-design one.

**The pixel footprint is ANISOTROPIC here and taking the hyperbolic answer for
both directions is wrong in the expensive direction.** Neighbouring rays
separate like `sinh(a t)/a` across the floor plan and like `t` straight down
the shaft, where `a` is the horizontal share; `sinh(a t)/a` degenerates to
exactly `t` as `a` goes to zero, so one expression covers both. Using `sinh(t)`
reads a footprint of 6e18 on a 44-unit vertical sightline, clamps to the cap,
and asks the marcher for detail sixty times finer than a pixel on the one
surface it is looking at.

**The floor checker must fade with distance**, for the same pixel-footprint
reason: one cell of a 7-per-unit checker is far under a pixel wide when the
floor is 40 units away, and below a pixel the right answer is the average.
Guarded to this build, because the hyperbolic worlds never see their floor from
further than a cell or two.

### No quotient, on purpose

There is no group, no fundamental domain, no fold, no straddle copy. A point
has exactly one name, so `hoopNear`, `foldPoint` and `carryCourse` have nothing
to do and are not called. A dropper wants none of it: you fall down a shaft
ONCE, and there is nothing to come back to.

What replaces the wrap as a sense of place is the **column field** — 30
vertical cylinders in three rings at horizontal radius 1.70, 3.10 and 4.40. The
counts (6, 10, 14) are chosen so the ANGULAR spacing is even rather than the
count, because circumference is `2 pi sinh(R)` and an outer ring needs more
columns to look equally dense. Falling past them, the near ring sweeps by and
the far one crowds at the horizon, and that difference is the hyperbolic plan
being legible at a glance.

### The dropper

`Course = dropper`, key K, preset 6. Five gates down a 44-unit shaft.

**The layout was SEARCHED for, not written down** — the same discipline as the
opponent spawn and the grapple ring. 1080 layouts over ring radius, turn per
gate, drop per gate, gate radius and wobble, against four criteria all measured
on the real integrator:

1. every gate ring is clear of the column field
2. a NO-INPUT drop takes zero gates, or the course is decoration
3. a greedy "aim at the next gate, full input" policy takes every one
4. a LAZY policy — same aim, 55% input — fails

85 passed all four. The winner: ring radius 1.5, 150 degrees of turn and 8
units of drop per gate, gate radius 0.60, five gates. Ring clearance from the
columns 0.260; gate-to-gate offsets 1.50 then 2.94 four times, with a mean
`sinh(d)/d` of **2.85** — so the hyperbolic plan is doing real work rather than
being a flat course with a curved metric written on it. At the 0.70 offsets the
first search returned, `sinh(d)/d` is 1.08 and the geometry does nothing.
The aimed run takes 11.35 s and uses 53% of the tightest gate's radius.

**The skill of the mode is a compounding, and it is the reason the plan stays
hyperbolic while the fall goes flat.** An aiming error `e` at distance `d`
misses by `sinh(d) e`, and the gate's apparent size falls like `1/sinh(d)`. The
two multiply: committing to the line early is worth exponentially more than
correcting late. Criterion 4 above is what pins that — a run that merely drifts
toward each gate does not get there.

**A gate is a HORIZONTAL DISC, so the crossing test is a sign change of the
height coordinate**, not of an inner product against a geodesic plane. That is
why `modes.js runStep` now takes the test off `run.course.crossed` when the
course supplies one, and falls back to `hoopCrossed` when it does not — the
phase, the clock, the ordering and the best time are the same in both, and only
the geometry of a gate differs. Downward only: in a dropper there is no
climbing back.

**Gates are drawn as LINE LOOPS**, like the hyperbolic hoops and for the same
reason — a curve in `sceneMap` is inlined three times and paid for at link
time, which is the budget that binds.

### What it is NOT

The fighting kit, both hyperbolic courses, the self body and the quotient are
all built on `hyp.js` and its group, and a product placement does not satisfy
that form at all. The option locks take them away rather than leaving dead
keys. **Gravity is the one interesting exception: it is NOT locked off, because
falling is the entire mode** — it is simply not `physics.js`'s gravity. The
height is a coordinate, so the fall is a constant subtraction from one velocity
component and there is no field object to choose; the option is pinned to say
so rather than left offering three answers to a settled question.

## S^2 x R, and `product.js`

`Curvature: S^2 x R` is the fifth geometry and the fourth scene program. It is
the exact MIRROR OF THE BOUNDED WORLD:

    floor (2D wrap)   the floor wraps because a GROUP glues one octagon to the
                      next; the height does not wrap
    S^2 x R           the floor wraps because IT IS A SPHERE -- no group, no
                      fundamental domain, no fold, no straddle copy; the
                      height does not wrap

Same shape of world, opposite mechanism, opposite curvature. Running the hoop
course in one and the lap course in the other back to back is the cleanest way
to feel what a quotient actually IS, because the experience is identical and
only the reason differs.

**`product.js` is to `h2r.js` and `s2r.js` what `geom.js` is to `hyp.js`.**
Surface x R with the surface's curvature left in, so both come out of one set
of formulas with sinh/cosh swapped for sin/cos, and E^2 x R = E^3 falls out as
the degenerate control. `h2r.js` delegates to it and its 51 existing tests are
the regression check — they were written against the old implementations and
pass unchanged, including the two that pin the affine-height trap.

Two sign traps in the generalisation, both found by running those tests:

- **`horizDist` takes NO `kS` factor.** `<p-q,p-q> = 4 sinK(d/2)^2` needs the
  form as it stands: `sinh^2 - (1-cosh)^2 = 4 sinh^2(d/2)` at kS = -1 and
  `sin^2 + (1-cos)^2 = 4 sin^2(d/2)` at kS = +1, both already positive.
  Multiplying by kS clamped every hyperbolic distance to zero and the
  dropper's five gates all landed on top of each other.
- **The surface translation is a BOOST at kS = -1 and a ROTATION at kS = +1**,
  and the `-kS` in front of `sinK` is the whole of that difference:
  `h -> -kS sinK(b) o + cosK(b) h`. It is the one place the sign of the
  curvature is more than a choice of trig function. `s2r.test.js` pins it by
  checking that the surface block inverts by plain TRANSPOSITION at kS = +1,
  which only an orthogonal block does.

### What it is the first to have: a compact floor AND honest gravity

    H^3 / Gamma   compact, but "down" has to be CHOSEN, and in the open world
                  no consistent down exists at all
    S^3           compact, and gravity is IMPOSSIBLE -- every unit-gradient
                  function on a sphere points at a pole, so a whole world
                  falls to one spot
    H^2 x R       honest gravity (z is affine, |grad z| = 1 exactly) over an
                  INFINITE floor
    S^2 x R       BOTH

So this is the first world you can walk right round and arrive where you
started, under real gravity, with no group anywhere. `s2r.js` has walking,
falling, jumping and collision; it is a small honest slice like `s3.js`, not
`physics.js`, and none of the fighting kit exists there.

**A jump is where a player feels the Euclidean height.** Apex exactly
`v^2/2g`, hang time exactly `2v/g`, and — measured at 0, 0.7, 1.5 and 2.2 of
running speed — **identical to the last bit at every speed**, because the two
factors of a product do not interact. Same claim as the dropper's fall,
somewhere you meet it every few seconds.

### YOU CANNOT ESCAPE BY RUNNING STRAIGHT

Any two geodesics on a sphere meet, twice, always. On the H^2 floor almost none
do — they diverge like `e^d`, which is why the design-constraints note records that flanking is
cheap, retreating is very cheap and a straight-line chase is a losing move.
Here, running straight away from someone running straight is how you meet them
on the far side: measured, two runs from one place at any angle are back
together, to 1e-16, after half a lap. Every design rule this project has that
rests on hyperbolic divergence inverts.

### Apparent size is MIXED, and the world is built to show it

    horizontally   r / sin(d): smallest at a quarter turn, growing after, and
                   at the antipode a single point fills the horizon
    vertically     r / d, ordinary flat falloff, monotonic for ever

S^3 is non-monotonic in every direction and H^2 x R is monotonic in both, so
this is the only geometry here where the two disagree.

**The demo is an EQUALITY rather than a trend, because an equality can be
checked by eye.** A cap of pillars 0.45 from each pole, and `sin(0.45) =
sin(pi - 0.45)` exactly: standing at spire A, the near cap is 0.45 away and the
far cap is 2.69 away and **they subtend the same angle, to twelve digits**. In
either hyperbolic world the far one would be 6.3% of the near one's width and
0.4% of its solid angle.

### The layout, and the two things it taught

**Scenery cannot go in rings around the SPAWN.** A ring at a fixed arc has
members at every azimuth and the course leaves at azimuth 0, so something is
always in the way — measured, an unphased ring of 8 at a quarter turn put a
column dead ahead and a straight lap stopped against it at arc 1.341. Phasing
only moves which member blocks: at a quarter turn a column must be 48 degrees
of azimuth off the line to clear the corridor, and eight evenly spaced columns
cannot all be. **A POLE of the course circle is a quarter turn from every point
of it**, so a cap of scenery around one is clear of the whole lap at once, by
construction rather than by search.

**THERE ARE NO PARALLEL LINES, SO THERE IS NO AVENUE ALONGSIDE YOUR ROUTE.**
The obvious fix — columns at a constant 1.05 sideways all the way round, a road
with trees down both sides — puts every one of them 60 degrees or more off the
direction of travel (computed: 67.9 at a quarter of the way, never below 60.1),
and the field of view is about 40 degrees to a side. **Not one was ever on
screen while running**, and the screenshot mid-lap was a flat horizon and
nothing else. What works is CLOSE and BETWEEN: the drawn gate rings reach 0.70
sideways but have no extent along the course, so a column halfway between two
gates only has to clear the running corridor. At 0.42 sideways and half a
gate-spacing along it is 0.41 clear of the nearest ring point and comes down to
24 degrees of bearing.

**The two SPIRES stand at the poles of the lap**, so each is exactly a quarter
turn from every gate: running the whole way round, neither comes closer and
neither gets further, and the two just sweep a full turn around you staying
opposite each other on the horizon. Nothing flat or hyperbolic does that —
there, holding something at constant range means constantly turning.

### The lap course

`Course = lap`, key K, preset 7. Six gates evenly spaced around a great circle,
so **running dead straight takes every one and returns you to the start** —
measured, 6/6 with no steering at all, in exactly `S2R_LAP / S2R_WALK` seconds.

That is what the bounded world's hoop course does and the mechanism is the
opposite one. It is ORDERED for a reason that has nothing to do with wrapping
this time: a lap in the WRONG DIRECTION would otherwise count every gate too.

**A gate is a VERTICAL PLANE, so the sign test uses `sdot` and ignores the
height entirely** — that is what makes it a doorway you run through rather than
a hoop at one altitude. The radius test then uses the FULL distance, so jumping
clean over the top does not count. **The gate's centre height is its own
radius**, so the ring stands ON the floor rather than half buried; at 0.35 it
was buried and the drawn loop dipped 0.20 underground, which only the clearance
test noticed.

### In the shader

Both products share ONE arm, with `kS` as a `#define` — the same relationship
`product.js` has with the two files. `cosS/sinS/asinS` follow `kS` and are NOT
the same as `cosK/sinK/asinK`, which follow `uCurv`, the ambient tangent form:
the two agree in S^2 x R and disagree in H^2 x R.

**`p.xy / p.w` IS A GNOMONIC PROJECTION ON A SPHERE AND IT DOES NOT REACH.**
The floor checker is drawn in Klein coordinates in the hyperbolic worlds, which
is right there and wrong here: `p.w` is `cos(d)`, so the ratio blows up at a
quarter turn and CHANGES SIGN past it. The checker moired into noise at pi/2
and then mirrored itself over the far hemisphere — half a world drawn twice.
The three surface coordinates are bounded by 1 everywhere including the
antipode, so a 3D checker restricted to the sphere is even, has no singular
point, and needs no projection at all.

**There is no range cap here and that is the engineering case.** H^2 x R needs
a per-ray horizontal cut because it is the only geometry in the project that is
both unbounded and unglued; S^2 x R's surface coordinates are bounded by 1 at
every distance and its height is affine and exact at any depth, so a ray may
run the full range in any direction.

**The pixel footprint takes `t`, not `sin(a t)/a`.** The horizontal spread
COLLAPSES TO ZERO at the antipode — that is the focusing that makes a point
there fill the sky — and a footprint of zero asks the marcher for infinitely
fine detail. `t` is the vertical spread and an honest upper bound on both,
since `sin(a t)/a <= t` always. Surfaces near the antipode come out slightly
fat, which is what focusing looks like.

Link times, warm, three runs: hyperbolic **8.6-8.7 s**, spherical **3.6-3.8 s**,
H^2 x R **3.9 s**, S^2 x R **3.9 s**.

## E^3 / Lambda, the flat 3-manifolds

`Curvature: flat torus` is the sixth geometry and the fifth scene program, and
it is the first one here that is deliberately BORING TO LOOK AT. Everything
else in this project exists because it does something a flat world cannot.
This one exists to be the thing they are measured against, and it earns the
place three times over.

**1. IT IS THE ONLY WORLD WHERE A PORTED MAP IS THE MAP.** `port.js` spends
seven hundred lines on the fact that there is no isometric embedding between
surfaces of different curvature, and every strategy in it trades one exact
property for two wrong ones. Port a flat floor plan into flat space and there
is nothing to trade: every length, every angle, every straight wall, exactly.
`E3T_PLAN` is a plan of line segments in ordinary flat coordinates and
`tools/port-map.js` will carry the same one into either hyperbolic world, so
"what does curvature do to a level" stops being an argument and becomes a
comparison you can run back to back. **Read the coordinates as a Euclidean
grid, and note that this is the ONE world here where that sentence is true** --
level.js says in capitals that its `(a, b)` are geodesic polar and that two
positions are not `|da, db|` apart. Here they are. That is the whole content
of "flat".

**2. IT IS THE EXACT STRUCTURAL MIRROR OF THE TWO HYPERBOLIC WORLDS**, and it
reuses their option rather than adding one:

    floor (2D wrap)   H^3:  octagon -> genus-2 surface x R
                      E^3:  square  -> 2-torus x R
    open  (3D wrap)   H^3:  Seifert-Weber dodecahedral space
                      E^3:  the 3-torus

The square cell is 3.0 across, so its inradius is **1.50 against the octagon's
1.5286** -- the rooms are very nearly the same size, which is the only way the
comparison is honest.

**3. THE 3-TORUS DOES A THING NO OTHER WORLD HERE CAN.** See "gravity without
a height" below.

### The quotient lives in the DISTANCE FUNCTION, and that is the whole design

CLAUDE.md says of the hyperbolic build that "reducing every sample instead
would work and is far simpler, but reduction costs seven iterations of eight
inner products, and at 220 steps a pixel that is not affordable". That
reasoning is correct and it is worth watching it FLIP.

Reduction here is `Math.round`. So the strategy that was out of reach in H^3 is
the obvious one: take the MINIMUM IMAGE of every displacement, inside the
distance function, and then nothing else in the renderer or the physics has to
know a group exists. **No fundamental domain, no face scan, no exact exit
solve, no fold loop, no straddle copies, no carried objects.** `hDist` in the
flat shader is one line and it is the entire group:

    float hDist(vec4 p, vec4 q) { return length(wrapDisp(p.xyz - q.xyz)); }

Every marker, every self copy and every level primitive is folded by using it.
The ray marches straight out into the covering space and never teleports at
all, which is why `HAS_QUOTIENT` is 0 for this build -- **that flag means the
fundamental-domain APPARATUS is absent, not that the manifold has no group.**

**Exact, with one condition, and it is the condition the hyperbolic worlds
already impose in another spelling:** the primitive must fit inside HALF a cell
along each glued axis. A sphere is exactly right whenever `r < L/2`; a segment
whenever its half-length plus its thickness is. That is level.js's "centre
distance plus thickness must stay under the inradius", restated flat, and
`e3t.test.js` checks the level against it rather than trusting it.

Measured, `tools/sdf-check.js`: the two implementations agree to **8.5e-7 four
cells out**, against a tolerance of 2e-5. The hyperbolic pair is checked only
INSIDE the fundamental domain and holds 4.6e-7 there against a tolerance of
2e-3, a hundred times looser -- because its coordinates grow like `cosh` and
the flat ones do not grow at all. That ratio is the engineering case for this
build in one number.

**The placement is still folded, and only float32 asks for it.** Nothing else
would: an unfolded centre draws in the right place, because `hDist` folds. But
a long session walks out to coordinates of a few hundred and the shader then
takes small differences of large numbers. `foldPlacement` subtracts a lattice
vector and leaves the frame alone -- `settleCarried` making the same argument,
much cheaper here. It is safe to do at any moment, which is not obvious, and
it is safe because every other question is asked through `torusDisp`.

**But the crossing test must wrap the STEP, not each end.** Folding `p1`
against a gate independently lets a substep that straddles a half-cell boundary
come back as a jump of a whole cell -- a spurious sign change, and a gate
credited from nowhere. `hoopCrossed` carries `d0` forward by `torusDisp(p1,
p0)` instead. This is the flat spelling of "the crossing test must ride on a
segment whose ends are in the SAME chart", and it has the identical symptom.

### GRAVITY WITH A FORCE AND NO POTENTIAL, which only T^3 has

The rule every world here is decided by: gravity must be the gradient of a
unit-gradient function INVARIANT under the group. The 3-torus splits it down
the middle, and it is the only world here that can:

    the FORCE descends.       d/dz is invariant under every lattice
                              translation, so "down" is a perfectly good
                              constant vector field on T^3.
    the POTENTIAL does not.   z is not periodic, so there is no height function
                              on T^3 at all -- and there cannot be, since a
                              continuous function on a compact manifold has a
                              maximum and a maximum has no gradient.

Played, that is: **you fall through the floor, arrive through the roof, and
arrive faster than you left.** There is no terminal state and no conservation
of energy, because energy is only defined once you name a lift and the lift
changes every lap. An endless fall inside a finite room. Measured on the real
integrator: `sqrt(2 g Lz)` = **7.35 after one lap, 10.39 after two, 12.73 after
three**, and the point never leaves the cell.

Compare the other four. The octagon world's field has a potential and confines
you. The open world has no field and provably cannot -- a closed hyperbolic
3-manifold admits no invariant unit-gradient function. S^3 admits none either,
because every candidate points at a pole. Both products have an honest
Euclidean height with an honest potential and a floor at the bottom of it.

**The bug this hid, and it is the reason free flight has two arms.** Steering
toward a target speed is a first-order lag, so adding a constant `-g dt` to it
gives a TERMINAL VELOCITY of `g/rate`: measured, **1.50 against the honest
7.35**, identical every lap. The endless fall had silently become a lift
descending at walking pace. With gravity on, the vertical takes a thrust and
gravity and NOTHING takes speed away.

### Closed geodesics are DENSE here, and rigid in H^3

    octagon world      exactly EIGHT closed geodesics through the cell centre,
                       one per generator, all of length 2*OCT_R = 3.057, and
                       every other direction never returns
    dodecahedral       twelve
    T^3                a direction closes IF AND ONLY IF it is RATIONAL, so
                       the closing directions are DENSE in the sphere of
                       directions -- 290 primitive ones with coefficients up
                       to 3 alone

And they come in CONTINUOUS FAMILIES: every parallel translate of a closed
geodesic is closed and has the same length, checked to 1e-12. In a hyperbolic
manifold each one is isolated and rigid, with finitely many below any bound.
That is Mostow rigidity showing up as a fact about level design, and it is why
the hyperbolic boomerang has a heuristic that picks one of eight fixed axes
rather than flying where it was aimed.

`nearestClosedDir` is the flat version of that problem and it reads completely
differently: it is rational approximation, a better answer always exists a
little further out, and **what a careless aim costs is TIME** -- the length of
the `(a,b,c)` geodesic is `|(a Lx, b Ly, c Lz)|`, so a complicated ratio is a
long flight. Aim carelessly and it comes back next week.

### The level, and what each half is for

**Two content sets, split by world exactly as level.js splits its own.**

The SLAB has a floor at z = 0, a roof at z = 3, a plan of wall segments and
four pillars. **The centreline y = 0 is kept clear all the way across**, and
that corridor joins its own image at x = +-1.5 into a street with no end. Look
down it and you see an infinite line of copies of yourself, and **in flat space
they recede like 1/d, so a dozen are visible at once** -- in either hyperbolic
world `e^{2r}` makes the second copy a speck. That contrast is the cheapest and
clearest thing this world has to show and it costs one uncluttered corridor.
The two doorways are OFFSET from each other, so the back alley -- the strip
from y = 1.05 out to the face, which joins the strip on the far side and is
therefore also endless -- cannot be seen into from the street. **That second
corridor exists only because of the wrap: there is no wall at y = +-1.5, there
is no y = +-1.5.**

The 3-TORUS has RODS and nothing else. A rod along x meets the faces x = +-1.5
head on and the gluing there is the identity translation, so it joins its own
image exactly: **one rod is an infinite straight rod, through every copy of the
room, for ever.** Three families along the three axes, passing through each
other without meeting. The hyperbolic spokes need a page of argument about the
3/10 turn lining a spoke up with its neighbour's; here it is a translation and
there is nothing to check, which is precisely the difference this world exists
to show. The walls and pillars are dropped there because they are meaningless:
a wall with no roof to stop at is an infinite vertical slab, and one of them
stands across the geodesic the course flies down.

**The rod offsets are SEARCHED for, and the search decided the COURSE too,
which was not the plan.** A rod is an infinite line and the course is a closed
geodesic wrapping several cells, so a carelessly placed rod meets it somewhere.
Sweeping the offset grid against the whole course line:

    (1,0,0)  len 3.00   best rod clearance 1.400
    (1,1,0)  len 4.24                      0.961
    (1,1,1)  len 5.20                      0.961  on ALL THREE axes
    (2,1,0)  len 6.71                      0.571
    (2,1,1)  len 7.35                      0.571
    (3,1,1)  len 9.95                      0.374

(2,1,1) was the first choice, for being the more elaborate wrap. It leaves
0.571 against a gate radius of 0.55, so a rod misses a gate's rim by 0.021 and
the scaffold has to be built around the race track. **(1,1,1) is shorter, is
far easier to say -- fly down the cell diagonal and you are back after
`L*sqrt(3)` -- and leaves 0.41 of genuine margin.**

### The torus course

`Course = torus`, key K, preset 10. Four gates along the closed (1,1,1)
geodesic, so **flying dead straight takes every one and returns you to the
start** -- which is word for word what the bounded world's hoop course does and
what the S^2 x R lap course does, in a third mechanism. Three worlds, one
sentence, and running them back to back is the point of having all three.

**The start is already looking down the line**, and the hyperbolic course
cannot manage that. Its hoops have to lie on the axis through the CELL CENTRE,
because a geodesic parallel to a generator's axis but offset from it does not
close up, so `beginRun` has to move the player onto the course. Here every
parallel translate closes, so the course could be laid anywhere and the player
could join it anywhere along its length.

**The course pins the world to `open (3D wrap)`, and the pinning is the mirror
of the hyperbolic one.** The (1,1,1) course rises, and in the slab z is not
glued, so a geodesic with any rise never comes back. Compare the octagon world,
which is forced the other way and for a much deeper reason: every generator
there is a translation along an axis lying IN the floor plane, so every closed
geodesic lies in it too -- all six hoops at altitude 0.0000, a floor-level
slalom, and no aim can change that. Here the flat course is 3D by construction
and the flat FLOOR world simply has no closed geodesic with any rise at all.

### In the shader, and what it costs

The flat arm is short because a geodesic is a straight line: `rayLocal` is
`dir*s`, `chartMap` is a plain `mat4` multiply that is exactly right rather
than nearly right, `geoStep` is `p + n*d`, and `boostMat` is the affine
translation the boost degenerates to at k = 0.

**The k = 0 arm of `cosK/sinK/asinK` has to be written out**, and this is a
trap worth naming: the shared selector tests `uCurv < 0.0`, so a zero curvature
would fall through to `cos` and `sin`, which are not the flat limits of
anything. `cosK -> 1` and `sinK -> t` is the limit that keeps
`cosK^2 + k sinK^2 = 1` true at k = 0.

**`projT` needs its own arm too.** The tangent space at a flat point is all of
R^3 and the form is degenerate, so there is no constraint to project out --
only the affine row to clear. `G + mdot(G,p)*p` is meaningless here.

**A latent S^3 bug fell out of writing it.** `geoStep` said `cosh` and `sinh`
unconditionally, which is right in H^3 and wrong in S^3. The error is O(d^3)
and ambient-occlusion steps are short, so it never showed -- but the spherical
build was stepping off the sphere a little at every AO tap. It is `cosK/sinK`
now, which also makes the flat arm free.

**`p.xy / p.w` works unchanged here**, and it is worth saying why after S^2 x R
made such a mess of it. In flat homogeneous coordinates `p.w` is 1, so the
"Klein" checker is just `p.xy` and a 7-per-unit grid on the floor is exactly
right. On a sphere the same expression is a gnomonic projection that covers
half a world; here it is the identity.

**The gold cell boundary is drawn, and it is NOT locked off the way "no
fundamental domain" is everywhere else.** There is one here, it is a square,
and it matters MORE than the octagon's: there the rooms visibly crowd together
and the corners give the quotient away on their own, and here **nothing on
screen distinguishes a 3-metre cell that wraps from an endless plain.** The
line is the only evidence.

**It is the CHEAPEST scene program in the project.** Link times, warm, on a
5070 Ti: hyperbolic **8.6 s**, spherical **3.9 s**, H^2 x R **4.0 s**,
S^2 x R **3.9 s**, **E^3 / lattice 3.1 s**. It has no quotient apparatus and no
transcendentals at all -- `cosK`, `sinK` and `asinK` are `1`, `t` and `x` --
so the D3D compiler has almost nothing left to inline.

### The bug that only a screenshot found

`unglued` in main.js meant "spherical or a product", and the flat world made
the name wrong: **E^3/Lambda emphatically HAS a group, and it is still wrong to
send its points through `foldPoint`,** which reduces against the octagon or
dodecahedral generators. A flat point put through those comes back as nonsense
-- the same class of mistake as handing the spherical marcher a Lorentz matrix.

It hid well. The self body drew at a plausible-looking wrong place, and **at
the spawn it was right, because the flat origin and the hyperbolic origin
happen to have identical coordinates.** What gave it away was a rendered frame
of the 3-torus with green spheres in it: those are material 12, "the player,
seen as a copy", and they are correct and free here -- `hDist` folds every
displacement, so the player's body is drawn in every cell down every sightline
with no machinery at all. Chasing why they were there found where they were.

`unglued` is now `adapterWorld()`, which is what it always meant: has no
HYPERBOLIC fold.

**Finite light speed is still locked off, and the reason had to be corrected
too.** It is not that there are no self copies -- there are, and they come
free. It is that `selfHist`, the ring of FOLDED samples plus the group elements
linking them, is built on the hyperbolic fold.


## Porting a flat map into a curved one — `port.js`

**There is no isometric embedding, and Gauss says so in one line.** Curvature is
intrinsic (*Theorema Egregium*), so a distance-preserving map between surfaces
of different curvature does not exist. Same fact as an orange peel not lying
flat. The question is therefore never "which projection is right" but **WHICH
PROPERTY DO YOU WANT KEPT**, and there are exactly three classical answers,
each exact in one thing and wrong in the others:

    embedding     exact                             cost
    ---------------------------------------------------------------------
    polar         distance and bearing FROM THE      everything transverse,
                  CENTRE. It is the exponential      stretched by sinh(u)/u
                  map, so `translation([a,b,0])`
                  already IS this one
    conformal     ANGLES, everywhere. A small        scale, by 2/(1-u^2):
    (Poincare)    circle stays a circle at every     rooms shrink toward
                  radius                             the rim
    projective    STRAIGHTNESS. A Euclidean chord    angles and distances
    (Klein)       of the disc IS a geodesic, so
                  every wall stays a wall

**Usually you want the projective one, and that is not taste.** A map made of
straight walls is a map whose entire meaning is which straight lines exist: the
rooms, the corners, the sightlines. Klein keeps all of that exactly — measured
at **1e-16** over every interior point of every segment, at every scale — and
changes only the metric, which is what you asked for by porting into a curved
space at all. Take the conformal one when the map is about SHAPES (a curve, a
spiral, a logo) and the polar one when it is about RANGES from one place.

**In E^2 all three are the same map**, and that is the control rather than a
footnote: the difference between them IS the curvature. `port.test.js` asserts
it, along with the three defining properties and the two that fail.

The radial profiles are the whole file, and they are the usual sinh/sin swap:

                    hyperbolic      flat     spherical
      polar         u               u        u
      conformal     2 atanh(u)      u        2 atan(u)
      projective    atanh(u)        u        atan(u)

**The hyperbolic disc models end at u = 1, and that edge is infinitely far away
in the metric.** A point outside it THROWS rather than clamping — a clamp would
hand back a finite answer for a point that is not in the model, and the level
would build and be silently wrong, which is the worst failure available here.

**And what NO embedding can do, which is the useful half.** A hyperbolic
quadrilateral has angle sum strictly less than 2*pi, so **a square room with
four right angles does not exist in H^2 at all**. Any map that keeps the walls
straight must lose the right angles; any map that keeps the right angles must
bend the walls. Measured: a right-angled corner comes out at 55 degrees under
all three, and WIDE in S^2 for the mirror reason. A ported level that needs
both needs re-authoring, not re-projecting.

**`fitScale`'s `fill` is the real design lever**, and a large one. It says how
much of the model disc the map may use, which in the curved cases is the same
thing as how hyperbolic it feels: the same plan at fill 0.30 has a distance
spread of 1.15x and at fill 0.95 has 3.4x. The default is 0.9 rather than 1
because in a disc model the last tenth of the radius is most of the space.

**THE FOURTH STRATEGY IS DIFFERENT IN KIND, and for an extended map it is the
one to reach for.** The three above are all radial, measured from ONE centre,
which suits a compact blob and crushes a corridor whose distortion is then set
by how far it happens to be from a centre that has nothing to do with it. The
alternative is a DEVELOPING MAP: unroll the flat instructions one edge at a
time, carrying the frame along, and

    KEEP EVERY EDGE LENGTH AND EVERY TURN ANGLE, EXACTLY.

A corridor 8 long is 8 long and a right-hand turn is 90 degrees, everywhere on
the map. It has exactly one cost and it is not negotiable:

**THE LOOP DOES NOT CLOSE, AND THE GAP IS THE AREA IT ENCLOSES.** Walk a flat
rectangle -- four edges, four right turns -- and you are back where you
started; develop the same instructions into H^2 and you are not. That is not
accumulated error and no care removes it: a geodesic n-gon in H^2 has angle sum
`(n-2)pi` MINUS its area, so a polygon with the flat angles has nowhere to be.
Measured, `spin = k * area` in the small-polygon limit -- squares of side 0.4,
0.2, 0.1, 0.05 give `spin/area` of **-1.052, -1.013, -1.003, -1.001 in H^2**
and **+0.946, +0.987, +0.997, +0.999 in S^2**, and E^2 gives exactly zero.
The headline number: **a 1x1 flat square developed into H^2 comes back 0.87
short and 75.6 degrees rotated.**

**It is the same integral the holonomy dash banks.** `physics.sweptArea`
integrates `(cosh(r) - 1) dtheta` around the player's path and calls it a
charge; `port.developClosure` composes isometries around a path and calls it an
error. One fact, seen twice, with opposite attitudes.

**So develop along a SPANNING TREE and the port is exact.** Any part of a map
with no loops -- a corridor, a branch, a dead end, a whole tree of rooms --
ports with every length and every angle intact, in any geometry, measured to
1e-12. Only the CYCLES cannot be satisfied, and there are exactly
`edges - nodes + components` of them; cut those, develop the rest, and re-close
each cut by hand. `port.fundamentalCycles` finds them and `developClosure` says
what each one is asking a cut to absorb. Under a few degrees, nudge a corridor.
Over a right angle, the geometry will not take it.

**And the encouraging half: BRANCHING MAPS PORT TO H^2 BETTER THAN TO E^2.** A
tree of rooms needs room that grows exponentially with depth, which is what
hyperbolic space has and flat space does not -- in E^2 a deep branching level
has to fold back on itself and crowd. Cycles are what hyperbolic space is bad
at; trees are what it is BETTER at. The demo plan's two cycles ask a cut to
absorb 57.9 degrees; a tree plan of the same size asks for nothing at all.

**`node tools/port-map.js`** closes the loop: a flat floor plan of line
segments in, the comparison table, the clearance check, the CYCLE REPORT (what
a developing port would cost, at the same scale) and a `WALLS` array ready to
paste. `--embed=`, `--world=`, `--fill=`; with no arguments it runs a
built-in demo plan. It fits to `inradius - thickness` rather than to the
inradius, because a wall has to fit inside the domain WITH its thickness, and
getting that the wrong way round is how a wall ends up cut off at a face —
which nothing else notices, since both SDFs still agree and the physics still
collides correctly.

**A triangle mesh is the wrong input and a floor plan is the right one.** The
marcher steps by exact distance and a mesh has none; every primitive here is an
intersection of slabs whose distance is one `asinh` of one inner product. A
`WALL` is already three of those built from two floor points, so segments in
and walls out is the natural pipeline, and it works in both worlds that have a
floor. Read the input coordinates as geodesic polar, never as a Euclidean grid.

**`distToGeodesic`: the perpendicular part of the log is NOT the distance**, and
it looks exactly like it should be. Splitting `log_a(p)` into components along
and across the axis and taking the norm of the second is the FLAT answer done
in the tangent space; it underestimates, by 0.299 against a true 0.35 in the
test that caught it. The right relation is the right-triangle one, a single
line in all three curvatures:

    sinK(d) = sinK(rho) * sin(theta)

and it degenerates to `d = rho sin(theta)` at k = 0, which is why the flat
answer looks correct until it is measured. **Take `sin(theta)` from the CROSS
PRODUCT, never from `sqrt(1 - cos^2)`** — the angle asked about is usually near
zero, since "the point is on the line" is exactly theta = 0, and there the
square root reads 3.55e-8 for an exact zero.
