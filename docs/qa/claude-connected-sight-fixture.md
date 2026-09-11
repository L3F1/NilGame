# A connected level, walked and looked at: connected-sight

Claude, 2026-09-11. Assignment: `docs/engineering/CLAUDE_NEXT.md`, against the
integration accepted in `docs/qa/astra-s3-sight-integration-2026-09-10.md`.

Base c4b9bc7. Host LeoPC (win32), Node v24.20.0. **CPU only**: no renderer, no
shader, no browser, no GPU, no runtime gate touched. Written:
`levels/fixtures/connected-sight.nil.json`, `tools/connected-sight-probe.js`,
`connected-sight-fixture.test.js`, this file. Nothing else. The historical v1
`connected-lab.nil.json` is untouched and still unrelated to this work.

## The level

Three regions, E3 -> S3 -> E3, scene-v2, `playerRadius` 0.25.

| region | metric | extent | holds |
|---|---|---|---|
| `entry` | E3 | 12 | floor at z = -0.9, spawn at [0,-3,0], a crate off to the left, the aperture `entry-gate` |
| `curve` | S3, R = 8 | 6 | floor, a geodesic-cell wall with a passage **cut** from it, a ball past the doorway, apertures at both ends |
| `far` | E3 | 12 | floor, a pillar, the target ball and the `goal` objective |

The route is one straight walk along +y out of the entry spawn: through
`entry-portal`, through the cut passage, through `far-portal`, to the target.
Because the S3 leg lies on a great circle through the chart origin, its
distances are exact in normal coordinates, so the expected numbers below are
**authored arithmetic and not outputs of the code under test**: 3 to the first
aperture, 4 across the curved region, 4.4 to the target's face, 11.4 in all.

Every S3 aperture radius (0.9) and every cell face offset (<= 1.2) is far
inside the open hemisphere `pi*R/2 = 12.566` the portal and cell compilers
require, and far inside the span at which a cell's perpendicular faces pile up
on one root (see the classifier's contract note; the whole S3 leg is 4 units).

Compiled size: 9 primitives and 15 planes, against caps of 64 and 192.

### Three authoring decisions that are not obvious

**The cutter overhangs the wall it cuts, and the depth is load-bearing.** The
wall is 0.35 deep; the doorway cell is 1.2 deep. That extra reach removes no
extra material -- there is no wall out there -- but it sets the *conservative
bound* inside the passage. Where the wall's own face distance and the cutter's
face distance cross, the field reports their common value: half the gap between
them. At 0.9 deep that minimum is 0.275, and a 0.25 body walks the passage with
0.025 to spare. At 1.2 it is 0.433. Both doorways are the same hole; only one
of them is comfortably walkable by a solver that trusts a bound.

**No two authored surfaces are made to coincide.** The crate floats 0.05 above
the floor and the wall is buried 0.3 below it, rather than resting flush. Exact
coincidence is refused by design, and a level that authors it is asking for a
refusal it cannot act on.

**The carve names its target.** Untargeted it would be global, and the same
cell -- which now cuts down past the floor line, as a doorway should -- would
take the floor out under the opening. The suite asks the question that
separates the two: stand in the doorway and look down.

## The probe

`tools/connected-sight-probe.js` samples `traceRegionSight` once per pixel on a
96x72 grid from a named pose and saves a PNG plus a JSON packet.

Ray construction is the convention already pinned for the shader and the marker
overlay: `u = (2*(px+0.5)-W)/H`, `v = (H-2*(py+0.5))/H`, `dir = normalize(forward/tan(fov/2)
+ right*u + up*v)`, with **both axes normalised by height**, so the quoted 70
degrees is the vertical field. Directions are built from the region's own
construction frame through `createCameraFrame`, never from hand-written basis
vectors, and are unit tangents in the metric that owns them.

Colour is a classification, flat and unshaded, because depth shading would make
one hue mean two things:

- **hit** -- one colour per (region, owner). Three region families.
- **miss within range** -- one neutral colour, the only one that may read as sky.
- **unresolved** -- saturated, one colour per reason, and never the miss colour.

The picture is **a map of query answers, not a rendered frame**. Every number it
reports is CPU query time on one Node thread. There is no GPU in this
measurement and no frame was ever presented.

## What the default view shows

`node tools/connected-sight-probe.js`, pose `entry-spawn`, range 32, maxWork 2048:

| | |
|---|---|
| hit | 4141 |
| unresolved | 2771, **all `domain-exit`** |
| miss | 0 |
| hit owners | entry-floor 2132, entry-crate 1359, curve-wall 476, curve-floor 112, far-target 32, far-floor 30 |
| work per ray | min 3, median 3, p90 38, max 46; 50147 total; **0 rays at budget** |
| CPU query time | 79.44 ms for 6912 rays; mean 11.5 us, median 4.4 us, p99 87.6 us |

The centre pixel is the objective, seen through two portals and the cut
passage, at 11.4152 (half a pixel off the optical axis; the axis ray is 11.4
exactly). Three regions appear in one view, which is the thing the fixture
exists to make visible.

## Unexpected refusals

Both are handed back, not repaired. The kernel is unchanged.

### 1. There is no sky, and 40% of a normal view says so

At the documented range every ray that leaves the room is
**`unresolved/domain-exit`** -- not a miss. A `cover` region is a bounded
chart; when a ray runs out of it the topology has nothing further to say, so
the query refuses rather than claiming empty space was proved empty. That is
correct, and it means the background of any outward-looking view is a refusal.

It is entirely an artefact of range against chart size, not of the scene. The
same view at `--range 8`, below the 12-unit chart, resolves completely: 3968
hits, 2944 misses, **zero unresolved**. So a sight coordinator that wants a
usable sky needs a policy for chart exit; it cannot get one by asking for more
range, which only reaches the refusal sooner.

### 2. A ray beginning on an inactive cutter face refuses the whole cast

`curve-door` overhangs the wall it cuts, so its far faces sit at chart
y = +-1.2 in open air, bounding nothing and cutting nothing. A query that
*starts* on one of them is refused:

```
region curve (S3, R = 8), chart position [0, 1.2, 0]
position   [0.000000000000000, 0.149438132473599, 0.000000000000000, 0.988771077936042]
field      +0.850000000   (plainly in open space)

direction  [1.000000000000000, 0.000000000000000, 0.000000000000000, 0.000000000000000]
  -> unresolved / primitive-events / "curve-door: coincident-or-ill-conditioned"

direction  [0.976009456351363, -0.215283283517834, 0.000000000000000, 0.032536885998774]
  -> unresolved / primitive-events / "curve-door: range-boundary"

the same look from chart [0, 1.19, 0] -> hit curve-post at 1.010664
```

Two direction families, two refusal reasons, one cause: a root of that face's
own equation at zero range, or a ray lying in it. Both are exactly what the
event layer promises. The consequence is the part worth deciding on: **a
modifier's face is not a surface of the scene, and it can still veto a query
from a point that is in open space by 0.85 units.** A cutter that never touches
its target still carries a knife edge across the region.

I did not change anything to avoid this. The fixture's own content is kept off
that plane, and the suite pins both refusals by constructing the ray
explicitly, so if the event layer's policy changes the check says so.

Whether the classifier should screen modifier surfaces that cannot affect the
Boolean before asking the event layer for their roots is your call, not mine --
it is a change to accepted kernel behaviour and it is not obviously safe: a
face that is inactive at the origin is not inactive everywhere along the ray.

## Evidence

| check | result |
|---|---|
| `node connected-sight-fixture.test.js` | **18/18** |
| `node tools/test.js` | **75/75 suites**, exit 0 |
| `git diff --check` | clean; only the four allowed paths added |

The route is walked with **real movement** -- `moveRegionProbe` at 2 units/s,
1/60 s frames, velocity along the carried camera forward -- not with a sight
ray standing in for a walker:

| | |
|---|---|
| entry -> curve | frame 89, t = 1.5000 s |
| curve -> far | frame 209, t = 3.5000 s |
| stops | frame 334, chart y = 1.14995, i.e. 2 - 0.6 - 0.25 |
| statuses seen | `complete` x 334, then `stopped`; **no frame owed a correction** |
| worst clearance in `curve` | 0.432933 |
| worst clearance overall | 0.250050 -- resting contact with the target, which is the floor of this quantity, not a breach of it |

Sight, all from the entry spawn along +y:

| ray | answer |
|---|---|
| centre | hit `far/far-target` at **11.400000**, crossings at 3 and 7, segments entry/curve/far |
| lateral 0.62 | hit `curve/curve-wall` at 4.645186, one crossing, and on the wall by the region's own field |
| doorway carve deleted | hit `curve/curve-wall` at **4.650000** -- the passage is a cut, not a gap |
| looking down from the doorway | hit `curve/curve-floor` at **0.900000** -- the carve is scoped |
| `maxWork` 0,1,3,5,8,20,40,43 | `unresolved/work-budget` every time, never spending past the cap; 44 is the hit |
| `maxCrossings` 1 | `unresolved/crossing-budget` |
| `maxDistance` 11.39 / 11.4 | honest miss at 11.39, same hit at 11.4 -- the range was not shortened until an answer improved |

### Coordinate width is not physical clearance, and it errs both ways

The doorway's authored half-width is 0.45.

| measured | value |
|---|---|
| physical half-width on the chart axis | 0.450000 (exact: normal coordinates are arclength there) |
| at chart height 0.20 / 0.40 / 0.60 / 0.70 | 0.449860 / 0.449439 / 0.448738 / **0.448282** |
| lateral entry offset that still reaches the far room | **0.459284** |

Read as a height budget the coordinate is too generous -- the faces are great
spheres, so the passage narrows as you rise. Read as a lateral budget for a ray
it is too mean -- a ray entering 0.455 aside, wider than the authored
half-width, still clears the doorway, because the geodesic converges on its way
there. Both are in the suite with their numbers.

### The field value in the passage is a bound, not the clearance

At the narrowest point of the walk the field reports 0.433, which is the
distance to the wall face the walker is about to pass. The real clearance is
larger: the nearest material is the doorway's edge, off to the side. Sampling
240 directions on a ball of **1.25x the reported bound** finds nothing solid,
which is only possible if the bound understates. That is the conservative
contract working as advertised, and it is why the walk has margin the number
does not show.

### Mutation matrix

Fifteen mutations, each applied alone to the fixture or the tool and reverted;
the suite was never touched. **All fifteen were caught.**

| mutation | suite | first failure |
|---|---|---|
| F1 the doorway carve is deleted | 8/18 | a walker actually walks the route |
| F2 the cutter is shallow (1.2 -> 0.9) | 16/18 | the body keeps clearance: 0.28293 in the passage |
| F3 the doorway is narrowed (0.45 -> 0.3) | 16/18 | the body keeps clearance: 0.29906 |
| F4 the entry anchor faces away from its own room | 9/18 | save, reload and recompile answer the same |
| F5 the curved spawn is moved into the wall | 16/18 | every region has one clear spawn |
| F6 the carve loses its target and cuts the region | 17/18 | the carve is scoped, the floor is unbroken |
| F7 the far target is moved out of the sightline | 12/18 | save, reload and recompile answer the same |
| T1 a refusal is painted as sky | 17/18 | unresolved is never painted as sky |
| T2 the horizontal axis is normalised by width | 17/18 | the pixel rays use the shader convention |
| T3 image rows run bottom to top | 16/18 | the pixel rays use the shader convention |
| T4 the png declares a filter it did not apply | 15/18 | the saved image is the sample, pixel for pixel |
| T5 the packet records a range the sample did not use | 17/18 | the packet repeats |
| T6 a miss is reported in a refusal colour | 17/18 | unresolved is never painted as sky |
| T7 work is reported as the budget, not the spend | 17/18 | the packet repeats |
| T8 the pose is nudged 0.02 rad off its frame | 17/18 | a second pose sees the same objective |

F6 and T6 survived a first pass. F6 because the doorway then stopped short of
the floor line and a global carve had nothing to cut -- the fixture was
accidentally insensitive to the scoping it depends on, so the doorway now cuts
down past the floor and the check asks the question directly. T6 because the
per-pixel colour rule was only applied to the run that has no misses in it. The
matrix above is the rerun after both were closed.

## The saved image, described honestly

The PNG is the sampled grid, one pixel per query, verified byte-for-byte
against the in-memory sample by the suite, which decodes the file it wrote. It
is **not** a screenshot: there is no DOM, no canvas and no renderer anywhere in
this path. `--scale` magnifies the saved file by nearest neighbour for reading;
it changes no pixel's value.

The default view reads as: a magenta field (chart exit, a refusal), the crate
in light blue on the left, the entry floor in slate across the bottom, the
aperture as a green disc showing the curved region's wall, and inside it the
doorway -- through which the far room's floor, and the objective in yellow, are
visible two regions away.

## Findings outside this assignment, not acted on

- `levels/fixtures/connected-lab.nil.json` (v1) still does not compile. Not
  touched here; this is a new fixture, not a replacement.
- The probe writes its PNG to the working directory by default, where the root
  `/*.png` gitignore rule keeps it out of the repository. There is no allowed
  path in this assignment for committing a diagnostic image, so none is
  committed; the tool reproduces it in about 80 ms.

## Next

Astra reviews the fixture and decides the two policy questions above: whether a
chart exit should have a sky policy, and whether an inactive modifier surface
should be screened before its roots are requested. MUSE-52's independent audit
of composed S3 queries is unaffected by anything here -- this adds a scene, a
tool and a suite, and changes no kernel behaviour.
