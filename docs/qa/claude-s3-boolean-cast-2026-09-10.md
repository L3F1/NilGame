# The Boolean answer: where a ray first enters solid in one S3 region

Claude, 2026-09-10. Assignment: `docs/engineering/CLAUDE_NEXT.md`, against the
contract in `docs/qa/astra-s3-events-2026-09-10.md`.

Base 2dd646a. Host LeoPC (win32), Node v24.20.0. CPU only: no renderer, no
runtime integration, no shader, no portal, and `field.rayCast` still does not
exist. Written: `engine/world/s3-ray-cast.js`, `s3-ray-cast.test.js`, this file.
Nothing else. Muse's work untouched.

## What it does

`castSphericalRegion(region, position, direction, {maxDistance, maxEvents=512,
maxWork=2048})` returns **hit**, **miss** or **unresolved**.

The method is the one thing that cannot quietly disagree with the field:
classify each atomic surface from its own inequality, then evaluate the SAME
Boolean expression `field.groups` describes, again at every event in order.

- **Atomic occupancy comes from the inequalities, never from `field.distance`.**
  A plane or cell face is inside where `dot(p, n) <= 0`; a ball where
  `dot(p, c) >= cos(radius/R)`. Both are written as one signed margin,
  `sign * (level - A)`, using the same `sign` and the same `error` the event
  layer builds, so a point the classifier calls uncertain is a point whose root
  the solver would also decline to place. A conservative bound cannot classify
  occupancy, and deciding a Boolean from one is the mistake this avoids.
- **A cell is the conjunction of its faces.** Which is exactly why a subtracted
  cell is not the conjunction of its inverted faces: *outside* a cell is
  NOT(all faces inside), a disjunction. Inverting each constraint and
  conjoining describes the intersection of six outer half-spaces, which is a
  different and usually empty region.
- **Group occupancy reads `field.groups` rather than re-deriving the scoping
  rule.** A modifier with no target is already in every group's list; a
  targeted one is in exactly one. The two cannot disagree about which cutter
  bites what.
- **Three-valued, Kleene.** `false AND unknown` is false and `true OR unknown`
  is true, so an uncertain primitive nobody is looking at cannot poison an
  answer the rest of the scene settles.
- **An event sets its own surface from the transition the solver reported**, not
  by flipping a bit, and then the whole Boolean is asked again. A cell face
  whose other faces are still outside changes nothing — which is how an
  inactive face root skips itself with **no epsilon step** that could also skip
  a thin cut.
- **Coincident candidates are refused across primitives as well as within one.**
  Choosing between them by primitive id would be an ordering the geometry never
  gave.
- **A hit carries both owners.** `additiveOwner` is the group whose solid was
  entered, `surfaceOwner` the primitive whose root it was; the normal is that
  primitive's outward normal, **negated when the surface belongs to a
  subtraction**, because the solid is on the far side of a cutter's boundary
  from the cutter's own outside. When one event makes more than one group
  occupied, `additiveOwner` is null and `additiveOwners` lists them — the hit
  is certain, only the attribution is plural.
- **An occupied origin is `hit` at t=0 with `contact: 'inside'` and
  `normal: null`.** An occupancy convention, not a surface; there is no
  boundary there and inventing one would be answering a different question.
- **A miss is a positive claim** and is returned only when every primitive's
  list came back complete and every evaluation along the way was definite.
  Budget, exhaustion and ambiguity are `unresolved`, never `miss`.

**What it does not own**, and refuses rather than deciding: portals, chart
exits, and any span longer than half a great circle. A longer `maxDistance`
throws with a message saying the sight coordinator must arbitrate it. It is
**not subdivided here**, because which parts of an over-long sightline mean
anything is a question about portals and chart exits.

## Work, in one unit

One atomic surface classified, one atomic surface solved for roots, or one
event applied to the Boolean.

At the compile-time caps (`REGION_LIMITS`: 64 primitives, 192 face planes) a
region has at most **256 atomic surfaces**, so classify-and-solve costs at most
**512 work units before a single event is applied** — which is why the default
allowance is 2048, leaving 1536 for events. The classify-and-solve cost is
bounded by the SCENE, not by the ray; only the event count depends on the ray.
That whole up-front cost is known before anything is spent, so an impossible
allowance is refused having spent **zero** (`work: 0` on that refusal).

## Evidence

| check | result |
|---|---|
| `node s3-ray-cast.test.js` | **19/19** |
| `node tools/test.js` | **73/73 suites**, exit 0 |
| `git diff --check` | clean |

**Every expected distance is an authored number, not one this code produced.**
In the normal chart, `decode([0,0,z])` is `cos(z/R)O + sin(z/R)e3` and a plane
authored at the origin with up `[0,0,1]` has pole `e3`, so its signed height
there is `R*asin(sin(z/R)) = z` exactly. The same cancellation puts a cell's
face at exactly its half-extent and a ball's entry at exactly centre distance
minus radius. That identity is asserted on its own before anything depends on
it, and every ray in the suite leaves the chart origin along a chart axis,
because that is the only family for which normal coordinates are exact.

Covered, at **R = 0.5, 8 and 100** with physical scale where the case is
geometric: ball, plane and cell routes against those closed forms; a passage
cut through a wall (the ray passes; moving the doorway aside makes it a wall);
a subtraction boundary entered from inside the carve, with a reversed normal; a
cut **2e-4 of a chart wide** landing at exactly the cut's far face rather than
the wall's own; global versus scoped modifiers; an intersect narrowing its
group; inactive infinite-face roots that are crossed and are not hits (with
`events > 0` asserted, or the check would be vacuous); an inside origin; an
empty region; coincident surfaces; a root exactly at the range end refused,
with comfortably-short a miss and comfortably-past a hit; a ray beginning on a
boundary; budgets; input validation; and immutability of the caller's arrays.

One invariant is asserted on **every** surface hit and is independent of any
primitive's convention: an entry normal opposes the direction of travel,
`dot(point; normal, tangent) < 0`.

### Mutation matrix

Each applied to `s3-ray-cast.js` alone and reverted; the suite was untouched.

| mutation | suite | first failure |
|---|---|---|
| a cell is the disjunction of its faces | 9/17 | a geodesic cell is entered at exactly its half extent |
| a subtract is applied as an intersect | 13/17 | a passage cut through a wall lets the ray through |
| a subtraction boundary keeps the cutter's own normal | 16/17 | a reversed cutter normal must still oppose travel |
| enter and exit are swapped | 6/17 | a ball is entered at centre distance minus radius |
| the origin is assumed outside everything | 16/17 | an origin inside solid is a hit at zero |
| a near-boundary classification is guessed | 17/19 → 2 fail | A RAY THAT BEGINS ON A BOUNDARY IS REFUSED |
| coincident candidates are ordered, not refused | 16/17 | coincident surfaces are refused |
| the work budget is checked after spending | 16/17 | budgets are validated before they are spent |
| an unresolved primitive list used as complete | 15/17 | a root at the end of the range is refused |
| the ball inequality uses the plane's sign | 16/17 | a ball is entered at centre distance minus radius |
| modifier scoping re-derived, not read from groups | 16/17 | a global cutter bites every group |

(The counts in the middle column are from the run at the time each mutation was
applied; the suite grew from 17 to 19 checks while closing the near-boundary
gap, which is why that row reads differently.)

## One branch I could not reach

`castSphericalRegion` also refuses when occupancy becomes undecidable **part
way along a walk** (`ambiguous-occupancy`). Deleting that branch breaks nothing
in the suite, and I could not construct a scene that reaches it. The argument:

> A surface is undecidable at a point exactly when that point is a root of its
> own equation. The event layer refuses a root at the start of the range
> (`range-boundary`), refuses a ray lying in the surface
> (`coincident-or-ill-conditioned`), and refuses tangency
> (`tangent-or-ill-conditioned`). So origin ambiguity is caught before any walk
> begins, and a surface decidable at the origin only ever changes at an event,
> which sets it to a definite value.

**That argument rests entirely on the event layer refusing**, so there is a
check pinning exactly those refusals: from a point on a surface, the tangential
direction refuses `coincident-or-ill-conditioned` and the crossing direction
refuses `range-boundary`, and the cast refuses `ambiguous-origin` before either
is reached. If the event layer ever stops refusing there, that check breaks and
points at the branch.

**I am stating this as a claim I could not break, not as a proof.** I argued
something unreachable earlier today and was wrong about it, and the shape of
the error was identical: a step that seemed to retrace ground already covered.
If MUSE-51 can construct a mid-walk ambiguity, that is the more useful result.

## Contract notes for Astra

1. **A quarter turn from any cell, its perpendicular faces pile up.** For a
   ray along a chart axis through a cell centred on that axis, the four faces
   perpendicular to the ray all have roots at the same `t` a quarter circle
   away, so the coincidence policy refuses the whole cast. That is correct, and
   it means **a span reaching `pi*R/2` past a cell is effectively unusable**.
   The suite therefore looks `0.95 * extent`, and since `extent <= pi*R/2` that
   stays clear. Worth knowing before a sight coordinator asks for a long span:
   the practical limit is much shorter than `pi*R`.

2. **Origin ambiguity is reachable and useful; mid-walk ambiguity may not be.**
   See above. If you want `ambiguous-occupancy` removed rather than left as a
   defensive branch, that is your call and it is one line.

3. **`additiveOwners` is plural on purpose.** A global cutter can open several
   groups at one event. I report the hit as certain with the attribution
   listed, rather than refusing or picking one. If the sight coordinator needs
   a single owner, that policy belongs to it.

4. **No advertised capability changed.** `field.capabilities` is untouched,
   `sphereField` has no `rayCast`, and `traceRegionSight` is as it was. This
   module is not wired to anything.

5. **The guards are inherited screening policies, not enclosures.** Everything
   the event layer says about that applies unchanged: these are floating-point
   screens, not proved interval arithmetic, and nothing here should be
   described as certified in that sense.

## Next

Astra reviews the query guarantees before any integration. MUSE-51 audits the
primitive event layer independently; the mid-walk ambiguity question above is
the most useful thing an independent attempt could settle.
