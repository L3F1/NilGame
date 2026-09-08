# Archive: the gameplay kit, the modes, and multiplayer

Moved out of CLAUDE.md on 2026-09-07, when the project turned toward an
engine/editor. The abilities, courses, characters and netcode described here
all still exist and still work; they are simply no longer the active roadmap,
and TODO.md keeps the dropper, race and grapple experiments as regression
levels.

**The TRAPS from these sections were NOT moved.** They live in CLAUDE.md under
"Traps in the archived subsystems", in imperative form. Read that list before
touching any of this, and come here for the reasoning.

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

## Game modes

`modes.js` holds the round system — phase, clock, ordered checkpoints, best
time — and it is DOM-free like physics.js so the rules are testable.
`modes.test.js` has 56.

**The crossing TEST belongs to the COURSE, not to `runStep`.** `hoopCrossed`
is the right one for a hoop in H^3 — a sign change of `<p,N>` against a
geodesic plane — and it is wrong for a dropper gate, which is a horizontal disc
in a space where the height is a coordinate. So a course may carry
`crossed(p0, p1, gate)` and `runStep` defers to it; the hyperbolic courses
carry none and get the default. Everything else about a run — the phase, the
clock, the ordering, the best time — is the same in every geometry, which is
what made `modes.js` reusable across three of them without a rewrite.

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

### Three that were considered, and what became of them

**Rescaling the curvature radius ("flatten") is impossible in the quotient.**
The octagon's 45 degree angles depend on its size, so a smaller octagon stops
being a genus-2 fundamental domain. The group is rigid. Zoom is the substitute,
though a weaker one: it magnifies uniformly rather than converting the falloff.

**Tethering to an ideal point is impossible.** A compact manifold has no
boundary at infinity. Holonomy dash is the substitute.

**A DROPPER is impossible IN H^3 — and that turned out to be a fact about
H^3 rather than about droppers. It is now a mode, in `h2r.js`.** Keep the
measurement below: it is what says which geometry the mode needed, and it is
the reason H^2 x R was built. The finding is that in H^3 steering and
descending are ANTAGONISTIC. A geodesic tangent to an
equidistant surface of the floor plane has its lowest point there and rises
away on both sides, so horizontal motion is motion that climbs. Above a
critical horizontal speed the geometry beats gravity outright and you stop
descending, and that speed collapses with altitude — measured by bisecting on
the real integrator: 1.854 at altitude 1, 0.924 at 2, 0.417 at 3, 0.178 at 4,
0.073 at 5, roughly halving per unit.

`WALK_SPEED` is 0.9, so **a player at full walking speed stops descending above
altitude 2.034**. Ordinary play never meets this, because the floor is at 0 and
the player walks at 0.07 — but anything played high does. Holding a steady
sideways input while falling from 2.4 is a cliff and not a dial: 0% input
reaches the floor in 1.29 s, and 20% or more never arrives at all in 60 s.

Below the cliff there is no room either: that 1.29 s fall puts gates 0.13 s
apart while `WALK_SPEED` buys 0.12 of lateral movement in the same time, so the
gate radius does all the work. Swept over radius, offset and gravity scale,
there is no setting where a straight drop fails and a steered run succeeds.
**Lowering gravity makes it worse** — the critical speed scales down with
gravity, so a gentler fall is one that any input stops completely.

**What fixes it is changing the SPACE, not the numbers.** The whole failure is
that the level sets of the height in H^3 are EQUIDISTANT SURFACES of a geodesic
plane: they curve away from it, so a horizontal geodesic climbs. In H^2 x R the
level sets `z = const` are TOTALLY GEODESIC copies of H^2, a horizontal
geodesic stays at its height for ever, and the fall time is exactly independent
of the input — measured at every horizontal speed from 0 to 3, identical to
every printed digit. See "H^2 x R" below.

## Two modes that shipped unplayable, and what it took to notice

`racing.js` (the orbital sprint, S^2 x R) and the dropper's lethal baffles
(`h2r.js`) both arrived complete-looking, both booted, both drew correctly, and
**neither could be finished by any input whatsoever.** Neither had a test.

That is the whole lesson, and it is the one this project already knew: the
opponent spawn, the grapple ring, the dropper's gate layout and the flat
world's rods were all SEARCHED FOR against criteria simulated on the real
integrator, precisely because a layout that looks right and cannot be played
is invisible from a screenshot. These two were written down instead.

Both are now searched and both have `racing.test.js` behind them, 44 tests.

### The dropper: 0/5 at every input from 0.0 to 1.0

Two independent faults, and the second is the more instructive.

**The baffles were holed over the wrong gate.** A baffle is a horizontal slab
across the shaft with one hole in it, and each sat 0.5 below its own gate with
the hole concentric with that gate. But the NEXT gate is 2.937 sideways, so the
hole was nowhere near the path: pass one gate, and the only way onward was
through solid slab.

The fix is what a baffle is FOR. A gate says "be here at this height". A baffle
says "and be ON THE WAY between here and the next one" -- which is the
constraint the mode's own skill argument is about, since an aiming error `e` at
distance `d` misses by `sinh(d) e` while the gate's apparent size falls like
`1/sinh(d)`. Without one, nothing checks the line, only the endpoints. So the
hole goes at the midpoint of the geodesic between consecutive gates, at the
midpoint height. **SEARCHED** over height fraction and hole radius, 36
candidates against the four original criteria, 6 passed:

    frac 0.50, hole 0.95   aimed 5/5 in 11.35s   lazy(0.55) 1/5   no input 0/5

picked because its hole rim stands **0.348** clear of the column field, widest
of the six. Two numbers say it is not decoration:

- **the aimed line uses 94% of a hole and 54% of a gate**, so the baffle is the
  TIGHTER of the two constraints, which is the only reason to have one;
- **an 0.85-input run dies ON A BAFFLE** rather than merely missing a gate,
  which is the difference between a hazard and a checkpoint.

And 11.35 s is exactly what the aimed run cost before baffles existed, so a
correct line pays nothing for them.

**THE COLUMNS WERE MADE LETHAL, AND THAT INVALIDATED A SEARCH THAT HAD ALREADY
BEEN RUN.** This is the one to remember. The gate ring was searched with the
column field as SCENERY -- CLAUDE.md records "Ring clearance from the columns
0.260", and a gate's RIM comes within **0.220** of a column with the player
0.10 across. Adding the columns to the lethal set turned a 0.12 margin into
instant death, and the aimed run died at altitude 42.6, above every baffle,
having flown out to the 1.70 column ring on its way to a gate at radius 1.5.

The columns are scenery and stay scenery. They are still SOLID -- they are in
`h2rSDF`, so `h2rCollide` stops you -- which is the honest reading: you bounce
off the furniture and you die on the course. `dropperObstacleSDF` is the
baffles and nothing else.

**A lethal surface must be tested SWEPT.** The slab is 0.16 thick against a
player 0.20 across, so the hit zone is 0.36 and a single fast substep can start
above it and end below it with neither endpoint inside -- a point test reports
a clean pass through solid rock. `dropperImpact` sphere-traces the substep;
`racing.test.js` builds exactly that tunnelling case and checks both that the
sweep catches it and that a point test at either end would not have.

### The race: stopped dead at arc 1.241, told to do the impossible

**The HUD recommended a detour the road is too narrow for.** A hurdle is 0.23
of arc in a road of half-width 0.29, so the on-road gap beside one is **0.060
against a player 0.10 across** -- and the only text on screen said "jump
earlier or go around". Every driver drove into the side of it and stayed there.

The mode already had the right mechanic and never said so. Measured against the
jump the racer actually has (apex 0.405, hang 0.600 s, a top at 0.14 to clear
plus the player's own 0.10):

    arc covered while clear of the top   0.413 at road speed
                                         0.728 on turbo
    arc a hurdle of radius r needs       2r + 0.20  =  0.66

**You cannot clear a hurdle at cruising speed. You can on turbo.** So drifting
the turns pays for the jumps, which is the loop an arcade racer wants, and it
was all there and undiscoverable. On the real integrator: **6.81 s a lap on the
boosted line, 22.92 s on the off-road detour, and a run that does neither stops
dead** -- at arc 1.240 against a hurdle edge computed at 1.241.

The gap beside a hurdle is left impassable rather than widened. A hurdle you
can thread on the tarmac is one nobody ever jumps.

**The gates overlapped each other and were wider than the road.** Twelve of
radius 0.40 sat 0.524 apart: a diameter of 0.80 in a gap of 0.52, so the course
was a tunnel of interpenetrating rings rather than a line of checkpoints. And
at 0.40 against a road half-width of 0.29 you could be off the tarmac and still
score, so the two instructions the mode gives -- stay on the road, take the
gates -- pulled apart. Now **ten of radius 0.30**: they clear each other (0.600
in 0.628), they match the road, and ten does not divide the lap into quarters,
so no gate lands on a hurdle at a quarter and three quarters of the way round.

**ON A SPHERE THE FAR GATES ARE THE BIGGEST THINGS ON SCREEN**, and an overlay
is where that stops being a curiosity and becomes a bug. Apparent size goes
like `r/sin(d)`: smallest a quarter turn away and growing again after. Drawing
a whole lap put every ring already passed, and every one half a world away,
across the view as huge concentric circles -- **the ones you could not use were
the loudest.** Three ahead is what a racing line needs and is the only range
where `r/sin(d)` is still doing the ordinary thing.

**And `raceObstacleSDF` used `Math.acos` of the inner product.** Algebraically
the arc distance, numerically the wrong way to get it: `acos` loses precision
exactly where its argument is near 1, which is where two points are CLOSE --
the only regime a collision test ever runs in. Worse, its GLSL half used
`hHorizDist`, the `4 sin^2(d/2)` form, so **the two sides did different
arithmetic for the same number** -- precisely the drift `tools/sdf-check.js`
exists to catch, and could not, because `race-track.js` was not one of its
cases. It is now, and it agrees to 9.1e-8.

**Two smaller ones worth the note:** `racing.js` carried its own bare `0.29`
for the road width beside `race-track.js`'s `RACE_WIDTH`, which is two places
for one number in a file pair that exists to have one; and `race-track.js`
importing `horizDist` back out of `s2r.js` makes an import CYCLE, since `s2r`
imports it to emit its GLSL. The cycle happens to work, because nothing calls
across it at module scope, and that is exactly the kind of thing that stops
working when someone adds a constant. The identity is three lines; it is
written out.

### `tools/sdf-check.js` grew a fourth case and a failure mode

It now checks the hyperbolic level, both flat worlds and S^2 x R with the race
track on. Adding the fourth broke it in a way worth naming, because the symptom
named nothing: **`browser failed: exit null`, with the page having run
perfectly.** The page embeds its own sample points and `--dump-dom` hands the
whole document back, so input and output came home in one buffer -- past
`execFileSync`'s 1 MB `maxBuffer`, which kills the child with SIGTERM. The
script node now removes itself before the dump, `maxBuffer` is 64 MB as the
belt to that brace, and the error message distinguishes the two cases that look
identical from outside: a kill with output already produced is this side's
buffer, and one without is the shader or the time budget.

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
