# Hyperbolic grapple game, in a compact 3-manifold

A game in a **compact hyperbolic 3-manifold** — H^3 of curvature -1, quotiented
by a genus-2 surface group, so the world closes up on itself in every
direction. Movement, gravity,
rendering and a grapple hook, all done honestly in the geometry. No build step,
no framework, no package manager.

- `hyp.js` — the geometry. Lorentz matrices, geodesics, exp and log. No graphics.
- `hyp.test.js` — proves `hyp.js` is right. Run this before trusting anything.
- `level.js` — the level, as data plus a JS and a GLSL reading of it.
- `physics.js` — gravity, movement, collision, the grapple.
- `physics.test.js` — proves the physics conserves what it should.
- `shader.js` — the GLSL.
- `index.html` — a canvas.
- `main.js` — WebGL2 setup, input, the frame loop, drawing the rope.
- `net.js` — two players over WebRTC. The packet format and the connection.
- `tools/` — optional dev helpers, no dependencies. See "When the screen is
  black" below, and `tools/relay.js` under "Playing against someone else".
  Nothing in the game imports them.

## Setup

**1. Install [VS Code](https://code.visualstudio.com/) and [Node](https://nodejs.org/)** (the LTS build).

**2. Install the Live Server extension.** In VS Code press `Ctrl+Shift+X`
(`Cmd+Shift+X` on Mac), search `Live Server`, install the one by Ritwick Dey.

You need this because the project uses ES modules (`import` / `export`).
Browsers refuse to load modules from `file://` URLs for security reasons, so
double-clicking `index.html` will give you a blank page and a CORS error.
Live Server runs a tiny local web server so the imports work.

**3. Open this folder in VS Code**: File → Open Folder, pick the folder itself,
not an individual file.

**4. Run the tests.** Open a terminal in VS Code (`Ctrl+` `` ` ``) and type:

```
node hyp.test.js
node physics.test.js
```

Every line must say `ok`. If not, stop and fix the math.

**5. Run the app.** Right-click `index.html` in the sidebar → *Open with Live
Server*. A browser tab opens. Click the canvas to capture the mouse.

## Controls

| | |
|---|---|
| `WASD` | move |
| mouse | look |
| `space` | jump |
| hold left mouse | fire and hold the grapple; release to let go |
| hold `shift` | reel the rope in — this is how you pull yourself forward |
| `F` | gravity beacon — plant it and "down" becomes radial |
| `Q` | holonomy — spend the rotation you banked by circling. **Which way you went round decides what you get**: counter-clockwise is a dash, clockwise is a blast |
| `B` | boomerang — bounces off things and comes back to where you are *now* |
| `G` | build a block, after a three-quarter-second delay |
| `V` | decoy — a copy of you, out of your own last three seconds |
| `H` | recall — back to where you were, along the path you walked |
| `T` | a pane of geodesic plane across the lane you are looking down |
| `E` | swap places with the grapple anchor |
| scroll | zoom, 1x to 8x; `X` snaps back |
| `Z` `C` | roll the camera (needs Camera up: free) |
| `1` `2` | place a portal (switch Portals on first) |
| `3` | clear the portal pair |
| `N` | multiplayer panel — see below |
| `O` | options: world, gravity, camera up, roll, light speed, portals, boomerang, build, holonomy, opponent, fog, shading, quality |
| `[` `]` | render quality, if the frame rate hurts |
| `R` | reset |
| `Esc` | release the mouse |

Flat vision used to be on `V` and is gone; the scroll wheel replaced it. It
scaled the ray fan by `t/sinh(t)`, which converted the hyperbolic `s/sinh(d)`
falloff into the flat `s/d` one exactly — lovely, and a lens rather than a
zoom: the sample path stopped being a geodesic and depth stopped reading as
depth, which is hard to fight in.

## The level

A single octagonal room, glued to itself. The floor is a closed **genus-2
surface**, so it has no edge at all: there are no side walls, and walking any
direction eventually brings you back.

Inside it: a pinwheel of four **walls** at floor radius 1.0 with wide gaps
between them, two **towers** (one reaching the ceiling), and a scaffold of
pillars, bars, a platform and grapple orbs threaded through the middle. One
wall is raised so you can run underneath it; one is low enough to vault.

The band outside radius 1.1 is left clear all the way round, and that matters:
it is the same corridor in every copy, so it is the one route that keeps going
for ever. Walk it and the room ahead of you is the room you are standing in.

Walls and towers exist in the **bounded** world only. The open world's cell is
a dodecahedron of inradius 0.996, and a wall long enough to hide behind does
not fit inside one — a surface that straddles a face gets cut off at it.

## Five things to notice

**The world has no edge.** Space is H^3 quotiented by a genus-2 surface group,
which makes it a compact 3-manifold. Walk any direction and you return. The
HUD counts how many times you have crossed a face.

**Those are not copies.** The pillars and orbs tiling away to the horizon are
the *same* two pillars and two orbs, seen again along longer and longer
geodesics. The gold octagon outlines on the floor are where one copy is glued
to the next — eight of them meet at every corner, which is what genus 2 looks
like from the inside. Grapple a distant orb and reel in, and you arrive at the
near one.

**Everything shrinks, fast.** Volume in H^3 grows like `e^{2r}`, so an orb
twice as far away is far more than twice as small. Distance is expensive here
in a way it never is in a flat world.

**The floor curves away but never hides anything.** It is a *geodesic plane*,
which cuts hyperbolic space into two convex halves — so the straight line
between any two points above it stays above it. You can always see the whole
corridor. That was a deliberate choice; see below.

**Walking is hyperbolic.** The floor is an H^2, not a Euclidean plane. Walk
out and back by a different route and the distances will not add up the way
you expect. Circling something is cheap; chasing it in a straight line is not.

**The rope is bent.** It is drawn as the actual geodesic from your hand to the
anchor, sampled and projected point by point, so it bows exactly as much as
the geometry says.

## The kit, and what each thing borrows from the geometry

The bar for every ability here is the same: it should be a thing you cannot do
in a flat world, or a thing that means something different when you do it.

**Decoy (`V`) — a copy of you, out of your own past.** In a compact manifold
you can already see yourself: your images stand one cell away down every
sightline, so anyone looking at you is looking at a dozen of you and only one
is where you are. A decoy is therefore not a costume — it is drawn with your
own material and it replays your last three seconds on a loop, which makes it
genuinely indistinguishable from the copies already on screen. In a flat game
there is one body to compare it against and the lie has nowhere to hide.

**Recall (`H`) — back down the path you walked.** Three seconds ago you may, in
coordinates, have been in a different copy of the room; recall puts you back at
that point of the *manifold*, which is why the trail is stored unfolded and
carried through every crossing. It also refuses to drop you somewhere that has
been built in since.

**Sightline cutter (`T`) — a pane of geodesic plane.** A totally geodesic plane
is the flattest surface hyperbolic space has, and an unbounded one cuts H^3
into two convex halves, so it blocks line of sight completely at any range —
the same fact the floor rests on. This one is a disc, so it does not manage
that, but 0.6 across a cell of inradius 1.0 shuts a great deal of a lane. Its
plane comes free from your aim: the tangent to your own sightline at the point
you are looking at is already the plane's normal.

**Build (`G`) — a block, after three quarters of a second.** The delay is the
design. An instant wall is a panic button; one that arrives in 0.75 s is a
prediction, and a prediction is something an opponent can read and beat — so it
is drawn at full size while it forms. It is worth more here than it would be
flat, because volume grows like `e^{2r}`: a 0.34 sphere blocks an enormous
solid angle from two units away and almost nothing from six. Cover is intensely
local.

**Holonomy (`Q`) — and the sign of the meter is a second ability.** Transport a
frame around a closed loop on a curvature -1 surface and it comes back rotated
by the area enclosed. The meter accumulates exactly that, and the area is
*signed*, so going round something counter-clockwise banks a **dash** and going
round it clockwise banks a **blast** — and going back the other way empties
what you had. Which ability you have charged is decided by the shape of the
path you walked. Circling wide is worth enormously more than circling tight,
because area is; walking in a straight line banks nothing at all.

The blast's radius runs 0.55 to 1.60 on charge, which sounds like a factor of
three and is about a factor of six in space covered.

**Anchor swap (`E`) — trade places with the grapple hook.** Ordinary in a flat
game. Here the rope's length is unchanged, so you arrive at the radius you left
at and keep swinging from the other end of the same circle — and the anchor may
be down a sightline that wrapped, so you can trade into a different copy of the
room. You fired at something that looked far away, and you were looking at the
back of your own head.

## Playing against someone else

Press `N`. Two ways to connect, and the first needs no server at all.

**Direct.** Press `Host`, and a long code appears. Send it to the other player
however you already talk to them — a chat message, an email. They paste it,
press `Join`, and get a code back; they send that to you, you paste it and
press `Finish`. A few seconds later you are connected, browser to browser, with
nothing running in between. Then set `Opponent: network` in the options (`O`).

**Relay.** Run `node tools/relay.js` in the project folder. It serves the game
*and* swaps the two codes for you, so both players just type the same room name
and press Host / Join. On a home network the other player opens
`http://<your machine's address>:8080/`. The relay never sees a frame of play:
once the two ends have found each other the traffic is peer to peer, and you
could kill the relay mid-match without interrupting it.

Both players must be in the **same World**. The two worlds are quotients by
different groups, so a position in one is not a position in the other — the
game notices and tells you rather than drawing nonsense.

### If you want other people to be able to play it

The whole project is static files: no build, no server, no dependencies. Any
free static host works — GitHub Pages, Netlify, Cloudflare Pages, itch.io — and
"deploying" is a `git push` or a drag and drop of the folder. Then you send
people a link and the direct connection above does the rest.

Sending someone a zip works too but is worse, because ES modules will not load
from a `file://` URL, so they would have to run a local server anyway.

One thing to know: **pointer lock and WebRTC both need HTTPS**, or `localhost`.
Every host above is HTTPS by default. A page served over plain `http://` from
another machine's IP address will load but will not capture the mouse.

## What the geometry does to a fight

Worth knowing before you design a mode around it.

- **Volume grows like `e^{2r}`.** Someone six units away is a speck; someone two
  units away fills the view. Engagements here want to be short-ranged, and
  cover is intensely local — you cannot wall off a lane, only the piece of it
  you are standing in.
- **There is no standing off at range.** The octagon world's covering radius is
  under two, so on the manifold there is nowhere further than that from
  anywhere else. A fully charged holonomy blast very nearly covers the cell.
- **Flanking is cheap and retreating is very cheap.** The floor is a hyperbolic
  plane, so a straight-line chase is a losing move — which is exactly what the
  bot demonstrates by failing to catch you.
- **Most of the figures you can see are images.** Your opponent's copies stand
  one cell away down every sightline. Only one of them is where they are, and
  with a decoy out, one of them is not them at all.

## Why the floor is a plane and not a horosphere

The obvious choice for "flat ground" in H^3 is a *horosphere*, because a
horosphere is intrinsically **Euclidean** — a genuinely flat, infinite floor
inside a curved space. Walking on it would feel completely ordinary.

It does not work, for a reason worth knowing. A horosphere curves away from
you, so the sightline between two points above it dips *below* it. From eye
altitude `h` you can see along the ground only

    horizon = sqrt(1 - e^{-2h})

which **saturates at 1** — one curvature-unit, ever, no matter how high you
climb. At standing height that is about two and a half eye-heights. You would
be playing in a bubble. The only fix is to make the player tiny compared to
the curvature radius, and then nothing looks hyperbolic at all.

A geodesic plane has no such problem: convex half-spaces mean the ground never
occludes anything. The price is that the floor is hyperbolic rather than flat.

Both are implemented — `busemannHeight` and `planeHeight` in `hyp.js` — and
switching is two lines, though the level would need re-authoring.

## When the screen is black

A black screen has two completely different causes that look identical, and
guessing between them wastes hours. Run this first:

```
node tools/shader-check.js
```

It compiles both shader programs in headless Chrome — the same ANGLE compiler
the browser uses — and prints the error.

- **It reports a GLSL error.** The shader is wrong. Fix and rerun.
- **It reports that `shader.js` did not load as JavaScript.** You probably put
  a backtick in a shader comment. The shaders live in JS template literals, so
  a backtick ends the string early and the module never loads — which is why
  nothing appears; the shader was never reached, so the `COMPILE_STATUS` check
  never got a chance to fire. Use 'single quotes' in shader comments.
- **Everything passes but the screen is still black.** Open the browser
  console (`F12`). It is a JS error, or you are not serving over Live Server.

Three more checks worth running after a change:

```
node tools/sdf-check.js      # do the JS and GLSL level SDFs still agree?
node tools/march-check.js    # does every ray terminate, in every copy?
node physics.test.js         # is energy conserved, is the rope still a rope?
```

`march-check` is the one to run after touching the renderer. It replays the
marching loop over twelve thousand rays fired from faces, edges and corners,
and counts the two failures you cannot tell apart by looking: rays that use
their whole step budget, which come out as background — a grey wedge along a
seam — and samples the fold loop could not bring back inside the fundamental
domain, which quietly draw the wrong copy of the level. Both must be zero.

To see what the app renders without a browser:

```
node tools/preview.js out.png
node tools/preview.js far.png "player = placeCorridor(-1.4, 0, 0.25); yaw = 0;"
```

The second argument is JavaScript spliced in after `main.js` runs, so it can
set `player`, `yaw`, `pitch`, `vel`, or call `fireGrapple()`. Rendering is
software, so keep it small — the default 300x200 takes about a second.

## What to do next

1. **Read `hyp.js` until you believe it.** Change a sign in the Minkowski form
   and watch which tests break. That tells you what each line is load-bearing
   for.

2. ~~Two characters and a collision check.~~ Done — a bot, or a real player
   over the network.

3. ~~A kit worth fighting with.~~ Done, and listed above.

4. **Game modes.** This is the part that is missing. There is a kit and no
   reason to use it: no win condition, no rounds, no map built for a fight
   rather than for looking at. Bear in mind what the geometry gives you —
   flanking is cheap, straight-line chasing is bad, anything more than a few
   units away is nearly invisible, and there is nowhere in the room further
   than about two units from anywhere else.

   One structural thing to fix first: `physics.js` holds one boomerang, one
   block and one pane, so two fighters cannot each have one out locally. Make
   them lists before adding a fourth projectile, not after.

## Reference implementations

- **"Ray-marching Thurston geometries"** (Coulon, Matsumoto, Segerman,
  Trettel), source at `plmlab.math.cnrs.fr/3-dimensional.space/source` — the
  renderer for all eight Thurston geometries, and the spec this one follows.
- **HyperRogue** and **Hyperbolica** — shipping games in hyperbolic space, for
  how navigation actually feels to a player.

## The boomerang

Press `B`. It flies dead straight, **rebounds off anything it meets**, and
comes back to where you are *now* rather than to where you threw it from.

The rebound is free, and the reason is worth knowing. Along a geodesic, the
direction of travel written in the *frame you are carrying* never changes — a
geodesic is exactly the path that parallel-transports its own tangent. So at
any moment the boomerang already knows which way it is going in the local
frame, and a bounce is the ordinary "reflect about the surface normal" with
nothing hyperbolic to correct for. It then sets off along a new geodesic. A
bounced throw is as exact as a straight one.

Coming back is a chase rather than a geodesic, because you have moved. It aims
at the *nearest copy* of you — which may be through a face, so it can come home
by a route you did not expect.

Gravity has never been in its integrator, and the thing that made it look
otherwise is in the next paragraph.

### Why it used to skim the ground

Set `Boomerang: closed geodesic` and watch it drag along the floor however you
aim. Nothing is pulling it down. In the bounded world **every** closed geodesic
of the group lies in the floor plane — the generators are all translations
along axes lying in that plane, so their axes do too, all eight measured at
altitude 0.0000. The throw starts at your feet and stays there because that is
where those lines are. In the open world the axes range over 1.36 of altitude
and the same mode is a genuine 3D path.

That is why the default is `aimed`: straight down your sightline, out and back,
which works at any angle. Aim 40 degrees up from altitude 0.6 and it reaches
2.9.

### And why the closed-geodesic mode is still there

A closed hyperbolic 3-manifold has a discrete spectrum of **closed geodesics**:
straight lines that return to where they started. Here the easiest ones to find
are the axes of the group's own generators, which all run through the centre of
the cell. Leave the centre in one of those directions, travel 3.06 units in the
floor world or 1.99 in the 3D one, and you are back where you began, pointing
the same way. Nothing steers the boomerang; the space brings it back.

In the open world the **spokes are drawn along exactly those geodesics**, so
the level tells you where to aim. Fire down a spoke and it returns down the
spoke behind you.

The frame it carries does not come back. The dodecahedral gluing includes a
3/10 turn about the axis, so one lap rotates the boomerang by 108 degrees —
holonomy you can watch happen.

## The rolling ball (designed, half built)

The idea: the player is a ball that moves by rolling, driven by friction
against whatever it touches, and the camera is a **second, weighted ball
hanging inside it** — heavy at the bottom, so it hangs along "down" and swings
when the outer ball starts or stops.

**The camera half is built.** Set `Camera up: pendulum`. A weight on a pivot
hangs along gravity *minus* acceleration, which is why the thing dangling from
a car mirror swings backwards when you pull away and forwards when you brake.
That is the whole model: a damped harmonic oscillator driven by the player's
own acceleration. It is deliberately underdamped (ratio 0.51), so a hard stop
leans the view about 12 degrees, overshoots twice, and settles in under two
seconds.

**The movement half is built too.** Set `Movement: rolling`. Input becomes a
torque; contact friction turns the spin into motion; ask for more grip than the
contact can supply and you slip. Everything downstream is unchanged, so the two
models can be switched between freely and compared.

What it feels like, measured: holding forward takes about two seconds to reach
the top speed of 1.35, and letting go leaves you still doing 0.8 three seconds
later. Walking, given the same input, stops in under a hundredth of a second.
That is the trade — you plan ahead, or you overshoot.

Worth knowing before committing to it: on an H^2 floor a rolling ball is
already strange. Parallel transport around a loop rotates the ball by the area
enclosed, so rolling in a circle and returning to your starting point leaves
you facing a different way, by an amount that depends on how wide you circled.
The holonomy dash already banks exactly that quantity.
