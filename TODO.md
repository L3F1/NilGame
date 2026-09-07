# Game modes: what to build, and in what order

CLAUDE.md item 10 says the next task is "actual game modes — there is now a
kit; what is missing is a reason to use it". This file is that task, broken up.

The ordering principle: **every mode below needs the same five or six pieces of
machinery, and none of them exist.** Build the machinery once, cheaply, against
the easiest mode; then the rest are level authoring and rules rather than
engineering. Building Rocket League first means building all of it at once,
badly.

Effort labels are relative: **S** is an evening, **M** is a weekend, **L** is a
project, **XL** is a rewrite of something load-bearing.

---

## Part 0 — the machinery every mode needs

Nothing here is interesting on its own. All of it blocks everything else.

### ~~M1. A round system~~ **DONE** — `modes.js`

There is no score, no timer, no phase, no win condition anywhere in the
codebase. `grep -i "score|round|timer|win"` finds a spawn-clearance heuristic
and nothing else.

Built as: `modes.js` exporting `{ name, onStart, onTick(dt), onEvent, hud() }`,
with main.js delegating to whichever is selected. **No DOM**, like physics.js,
so it is testable — that rule is what makes physics.js testable and it should
not be broken for game logic.

### ~~M2. Projectiles become lists~~ **DONE**

Was four module-level singletons — `boomerang`, `block`, `decoy`, `cut` — so
two fighters could not each have one out and a bot that threw a boomerang took
the player's. All four are now `Map`s keyed by owner id.

Every function grew a trailing `id = 0`, so the local player is owner 0 and
every existing call site reads as it did; `physics.test.js` went 140 → 160 with
no change to the original 140. The parts that needed real care were the
functions acting on all owners at once: `blockSDF` and `cutSDF` now take a
minimum over every one, the four `carry*` functions move every one through a
fold, and `boomerangHits` skips each throw's own `b.owner` instead of a `skip`
argument the caller had to remember. Both of those were confirmed to fail
against a deliberately single-owner mutation.

**What it cost the shader: nothing.** Markers already go through `uMark[10]` +
`uMarkN`, built exactly so more objects cost no link time.

**But `MARKS = 10` is now the binding limit**, and it fails silently —
`marker()` just returns once `markN >= MARKS`, so the eleventh object is not
drawn and nothing errors. The anchor, beacon, opponent and blast already take
slots. Raise it in main.js *and* shader.js together and re-run
`tools/link-time.js` before any mode puts many objects in the world at once.

### ~~M3. Trigger volumes~~ **DONE** — hoops, ordered

"Is this character inside region k, and did they enter regions in order?"

Cheap, because the pieces exist: an SDF for the shape, and `orbitDist` for the
"on the orbit, not in coordinates" rule that every character interaction here
already obeys. A checkpoint one cell away must count as reached.

Needs per-player state and ordered activation (checkpoint 3 only counts after
2), or players will cut the course by wrapping — which in a compact manifold
they absolutely will, and that is a feature to design around rather than a bug.

### ~~M4. Timer and scoreboard on the HUD~~ **DONE**

Trivial, and nothing exists. Needed by every timed mode.

### M5. Teams and roles  **S**

`makeCharacter` returns `{ id, M, vel, spin, health, hurtFor, deadFor }` — no
team, no role, no score. Add them there rather than in a parallel structure:
that struct is what a network packet carries, so anything not in it does not
survive multiplayer.

### M6. More than two players  **L**

The netcode is deliberately 2-player peer-to-peer, each end authoritative over
its own body, damage self-assessed at both ends. That model does not extend to
four — with three peers, "I decide whether their boomerang hit me" stops being
symmetric and starts being an argument.

**This is where the Colyseus server in `server/` earns its place.** The hard
part is already solved and CLAUDE.md says why: `reduceToDomain` is canonical, so
a folded representative is a name every client agrees on. That is exactly what
makes a server-side `Schema` of positions mean anything. `hyp.js` and
`physics.js` are DOM-free ES modules, so the server can run the real physics
rather than a reimplementation of it.

Decide deliberately: Colyseus **replaces** `net.js`, it does not sit alongside
it. 1v1 stays cheaper peer-to-peer forever.

### M7. A ball — a persistent physical object  **M**

Not a projectile. It lives for the whole round, collides with the level *and*
with players, and gets pushed rather than aimed.

Most of it exists: the `rolling` movement model is a rigid sphere with a proper
contact impulse (the `1 + r^2/I` = 3.5 factor for a solid sphere). A ball is
that, with no input torque. Reuse `rollControl`'s contact solver rather than
writing a second one.

### M8. Level content that is not an arena  **M**

A maze, a track and a hoop course are three shapes the current primitives do not
make. Either add primitives (a hoop; a tube that follows a path) or add a path
authoring helper.

Two constraints that bite immediately, both already documented:
- **Clearance:** centre distance + thickness must stay under the inradius —
  1.5286 for the octagon, **0.996 for the dodecahedron**.
- **Straddling a face gets CUT OFF.** The marcher never leaves the fundamental
  domain, so the part in the neighbouring copy is simply not drawn, and nothing
  else notices: both SDFs agree, physics collides correctly, the picture is
  quietly wrong.

### M9. Ghost replay  **S**

Nearly free. `trail` and `selfHist` already record position history, and
`plantDecoy` already replays a slice of it as a body. A ghost is a decoy that
replays a *saved lap* instead of the last three seconds. Racing and every time
trial want one.

---

## Part 1 — the modes, easiest first

### ~~1. Drone hoops, timed~~ **DONE** — and it built M1, M3 and M4 with it

`modes.js` + `modes.test.js` (56 tests), option `Hoop course`, key K. The round
system, ordered trigger volumes and the HUD clock all exist now, which is what
this mode was chosen to pay for.

Two things worth knowing before the next mode uses them:

- **The bounded world's course is FLAT**, measured at altitude 0.0000 for every
  hoop, and it is forced: every closed geodesic of the octagon group lies in
  the floor plane. The open world gives an altitude range of 1.315 and is a
  real 3D course. Any mode built on closed geodesics inherits this.
- **The crossing test rides on `bankFrom`**, the substep start point already
  carried through any fold. Racing and the grapple course need the same
  segment, so reuse it rather than re-deriving one.

The original plan for it, kept because the reasoning is still the argument for
the next few modes:

**Why first:** almost all of it already exists. `Gravity: none` and
`Camera up: free` are shipped options; flight works; zoom works. What is missing
is M1, M3, M4 and a hoop shape.

The hoop: a disc with a hole. `cutSDF` is already a geodesic-plane disc — the
slab `asinh(<p,N>)` intersected with a ball. A hoop is that same slab
intersected with a **shell** instead of a ball, which is one `max` and one
`abs`. Exact, one inner product wide, and it reuses code that is already tested.

**The hook that makes it not a flat game:** put the hoops **along a closed
geodesic**. The course then returns to its own start with no turning — you fly
dead straight and arrive where you began. In the dodecahedral world those
geodesics are the SPOKES, which are already drawn, so the level literally shows
you the racing line. `closedGeodesicDirs` and `closedGeodesicLength` already
expose them; the boomerang already flies them.

### ~~2. Grapple course, timed~~ **DONE** — `Course = grapple`, key K

Everything mechanical exists: rope, swing, reel, `anchorSwap`, swing-to-fly
above `sqrt(G)`. Needs M1, M3, M4 and a reset-to-start.

**The hook, and it is the best unused idea in the codebase:** `sweptArea` is
**signed**, and it fills by circling — `(cosh(r) - 1) dtheta`, so a wide circle
is worth exponentially more than a tight one, and going back round the other way
*empties* it. Right now that meter only feeds the dash and the blast, both
combat abilities.

Put a gate on the course that opens only at a given charge, and the player has
to swing **around** something, the right way round, at the right radius, to
open it. That turns a curvature integral into a puzzle mechanic. Nothing in a
flat game can do it, because in a flat game the integral is always zero.

### 3. Racing / time trial  **M**

`rolling` is already a car: torque in, friction, slip, rolling resistance,
`ROLL_TOP` capping spin about the input axis so speed carried in from a slope
survives. Needs M1, M3 (ordered checkpoints, laps), M4, M9 (ghosts), M8 (track).

**The hook is the racing line itself.** On an H^2 floor the circumference of a
circle grows like `sinh(r)`, not `r`. So the inside line is not slightly
shorter, it is *dramatically* shorter, and going wide to overtake is punishingly
expensive in a way no flat racer can reproduce. Defending the inside is nearly
free; the whole overtaking economy inverts.

Second hook: a track laid along a closed geodesic means a "lap" is completed by
driving **straight**. The corner is the manifold, not the tarmac.

### 4. Hide and seek  **M** — the mode the manifold was built for

Needs M1, M3, M4, M5 and a detection rule.

Look at how much of the existing kit is already a hide-and-seek kit that was
built for something else:

- **Your copies stand down every sightline.** A seeker looking at you is looking
  at a dozen of you and none of them may be the body.
- **Decoy** is drawn with the player's own material, on purpose — "not a
  costume, genuinely the same thing to look at".
- **Finite light speed** means a distant sighting is *stale by construction*.
  The copy five cells off shows where you were long before. A seeker chasing
  what they can see is chasing the past.
- **The sightline cutter** shuts a corridor with a convex half-space.
- **Recall** is an escape hatch that leaves no trail forward.

**Reconsider the maze.** A literal maze fits badly — the octagon's inradius is
1.53 and anything straddling a face is cut off. But the manifold *is* the maze:
walk straight and you come back to where you started from the other side. Build
the mode out of sightlines and copies, not out of walls, and it will be better
and cheaper.

### 5. Rocket League  **L** — needs the most new machinery

Needs M7 (the ball), M5 (teams), M3 (goals as trigger volumes), M2 (lists), M1,
M4 — and 2v2 needs M6. Build 1v1 first; it needs everything except M6.

Three hooks:

- **There is no "behind the goal".** The arena wraps, so you can score from the
  far side by going around. Defending means defending a *volume*, not a line.
- **Aim spreads like `sinh(d)`.** A long shot is far harder to place than in a
  flat game, which pushes play close — the same reason CLAUDE.md says "a fighter
  here wants short engagement ranges". Long-range sniping is not a strategy the
  geometry supports.
- **A ball launched down a closed geodesic comes back to you.** A pass to
  nobody, that returns.

---

## Part 2 — other geometries

### Spherical, S^3  **XL** — the big one, and it pays engineering rent

Not just novelty. Three things change and all three matter:

1. **Compact with no quotient.** S^3 already closes up, so you see the back of
   your own head with no group at all. Every geodesic closes, at period 2*pi.
2. **Coordinates are BOUNDED by 1.** The hard range limit that caps this whole
   project — `<p,p>` cancelling terms of size `e^{2d}`, out of digits at d = 16
   in float64 and **d = 7 in float32** — simply does not exist. The level could
   be any size. That is a real payoff, not a curiosity.
3. **Volume grows and then shrinks.** Past `pi/2` objects get *larger* with
   distance, and the antipode focuses light so a point there fills the sky. Every
   design rule here that rests on `e^{2r}` inverts.

**The codebase already names the target.** CLAUDE.md records that the same
dodecahedron glued with a **1/10** turn instead of 3/10 gives the **Poincare
homology sphere** — which is spherical — and `hyp.test.js` already asserts that
1/10 is *not* a valid hyperbolic reduction. Spherical support is what would let
the game actually contain the thing its own test suite names.

Work: `hyp.js` becomes an interface — `form`, `exp`, `log`, `dist`,
`translation`, `height` — with H^3 / S^3 / E^3 implementations. The marcher and
every SDF assume `asinh`/`sinh` and would need the same treatment. This is the
XL, and it should not start until the mode system exists, or there will be
nothing to play in the new geometry.

### Euclidean E^3 on a 3-torus  **M** — do this BEFORE spherical

The boring case, and that is exactly its value:

- It **validates the geometry interface** with arithmetic that can be checked by
  hand. Every bug in the abstraction shows up here first, in numbers a person
  can verify without trusting `asinh`.
- It is the **control**. Play the same grapple course flat and hyperbolic and
  the difference curvature makes stops being a claim and becomes a measurement.

### More H^3 manifolds  **S each, once the group interface is clean**

Same machinery, different group. Cheap and each one feels different:

- **Weeks manifold** — the smallest-volume closed orientable hyperbolic
  3-manifold (0.9427, against Seifert-Weber's 11.199). A far tighter cell means
  many more copies in view: the "hall of mirrors" turned up.
- **Figure-eight knot complement** — **cusped**: finite volume, infinite extent.
  You can fly up the cusp forever while the cross-section shrinks around you.
  Visually unlike anything else here, and the most famous manifold in the field.
- **Higher-genus surface groups** — the octagon machinery generalises; a
  12-gon gives genus 3. Wider floor, more directions home.

### The other Thurston geometries  **L each**

This project started in **Nil**. The reference already used for the renderer
(Coulon, Matsumoto, Segerman, Trettel) covers all eight: E^3, S^3, H^3, S^2xR,
H^2xR, SL2R~, Nil, Sol.

- **H^2 x R** is the interesting one, and it is nearly what this game already
  pretends to be: a hyperbolic floor with a genuinely flat vertical direction.
  Plane gravity here is an approximation of it. Doing it properly would make
  "up" honest instead of chosen.
- **Sol** is the strangest — exponential stretching along one axis and
  contraction along another, so navigation is genuinely disorienting rather than
  merely unfamiliar.

---

## Part 3 — modes that could not exist anywhere else

These are the reason to build any of the above. None of them are ports of a flat
game.

**Which one is real?** Everyone already sees a dozen copies of everyone. Add
decoys and a copy, a plant and a person are indistinguishable. The core skill is
reading *which image is the body*. This cannot be built in a flat world, because
there you have one body on screen to compare against.

**Holonomy race.** Score = swept area banked in ninety seconds. You must circle
things; wide circles are worth exponentially more (`cosh(r) - 1`); and going
back round the other way empties the meter, so the map becomes a set of things
to orbit and a decision about which way. A game whose score is a curvature
integral.

**Tag your own past.** Finite light speed already draws where you were, indexed
by distance. Make *that* the target: chase a perfect record of your own
movement from ten seconds ago. The better you play, the harder your opponent.

**Geodesic golf.** Strike a ball down a closed geodesic; par is the number of
laps to the hole. Only possible because some geodesics close, which is only true
because the manifold is compact.

---

## Suggested order

1. ~~**M2** (lists)~~ — **done**, 160 tests.
2. ~~**M1 + M3 + M4**~~ (round system, triggers, HUD) — **done**, built
   against mode 1 exactly as planned.
3. ~~**Mode 1, drone hoops.**~~ **done** — 56 tests.
4. ~~**Mode 2, grapple course.**~~ **done** — charge gates, 78 tests. The
   signed holonomy meter now has a non-combat use.
5. **M9 + Mode 3, racing.** The hyperbolic racing line is worth the weekend.
   **This is the next step.** M9 (ghosts) is nearly free from the existing
   trail; the checkpoint machinery is already built and tested.
6. **M5 + Mode 4, hide and seek.** The kit is already 80% there.
7. **M7 + Mode 5, Rocket League 1v1.**
8. **M6 (Colyseus)** when a mode actually needs three players.
9. **E^3 torus**, then **S^3**. Geometry work last, because a new geometry with
   no modes in it is a tech demo, and this stopped being a tech demo at item 8
   of CLAUDE.md.
