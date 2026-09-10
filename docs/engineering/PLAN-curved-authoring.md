# Plan: honest queries, construction frames, and an authored curved level

Adopted 2026-09-09. Author: Astra (peer lead), in answer to
[the brief](../qa/astra-brief-2026-09-09-direction.md). Implementation and
status notes: Opus.

The milestone is **a small spherical level built through the editor**, with
movement, collision, scale and saved data you can trust, and then connected to
an E3 region. The browser stays the host; Godot remains a candidate for
specific services, not a port.

## The four answers

**1. Preserve useful exact queries, not whole-scene exactness.** The
organising principle is honest guarantees and predictable cost. A Boolean
solid can carry a conservative distance field and still support analytic ray
intersections — so the 20–50× cliff on the first modifier was **a consequence
of a choice**, not a property of Booleans. The choice was to switch the entire
scene to marching. Correcting it means one carved wall no longer costs every
untouched ball its closed form.

The benchmark never established that the cliff was unavoidable, and the figure
is CPU `rayHit` throughput from `tools/carve-bench.js` rather than frame time.
Analytic ray casting of Boolean solids is long-established practice — Roth's
original CSG ray-casting paper is the reference.

**2. Allow orientation, but separate a construction frame from a rigid
transformation.** Rotated E3 boxes are straightforward and are supported. In
another geometry, a primitive's CONSTRUCTION determines what changing its
frame means. Sol's restricted rotational symmetries are real, but they do not
prohibit defining a shape using a local frame — they only stop you claiming
that turning it is an isometry. So the schema stores a frame and each geometry
says what it can honour.

This corrects the reasoning in the previous entry, which concluded from "Nil
and Sol have no such isometry" that the schema must not carry a frame at all.
A local orientation is not automatically a rigid motion of the surrounding
space, and the two questions are separable.

**3. Add a second geometry now: bounded S3.** This tests the kernel boundary
before more E3 assumptions accumulate.

**4. Converge through shared capabilities, not a wholesale arena rewrite.**
The scene-based application becomes the authoring/play runtime. The existing
arena and geometry experiments stay as references and their tested mathematics
gets reused. A duplicate implementation is retired only after the
corresponding kernel feature passes parity checks.

## The four work items

### 1. Correct query guarantees, remove the rendering cliff — **LANDED**

Two defects found by read-only probes during the assessment, both reproduced
against the previous commit before being fixed:

- **An overlapping union advertised an exact signed distance it did not have.**
  Two unit balls one apart report −0.5 at the midpoint where the true distance
  to the union's boundary is 0.866. An under-estimate, so nothing was unsafe;
  the CLAIM was false, and `clearance()` rests on it.
- **The analytic `rayCast` path ignored `maxDistance`** and returned a hit at
  t = 1008 when asked for a range of 64.

Guarantees are now reported separately — exterior distance, interior distance,
interior sign, intersection, normal, normal uniqueness — because one word was
making several claims and two of them were wrong for a union. Non-smooth seams
are explicit: a deterministic contact normal is not necessarily a unique
surface normal, and `normalSample` says which you got. A hit, a miss within
the requested range, and an unresolved query stay three different answers.

Each additive solid compiles with the modifiers that apply to it, and ray
intervals resolve analytically per group for balls, boxes and half-spaces. The
marcher stays as reference and fallback under `method: 'march'`.

**Status:** landed. `march-truth.test.js` agrees with a brute-force reference
to 7e-15 on the analytic path. Still owed: the measurement half — CPU query
time and actual GPU FRAME time, separately, over rooms, doorways, overlapping
solids, mostly-unmodified scenes and grazing rays, with cold compilation and
exhausted-ray counts. **No GPU path gets promoted on CPU throughput alone.**

### 2. Frames and primitive construction semantics — **LANDED for E3**

A versioned optional construction frame in the entity's local orthonormal
tangent frame. Existing v1 boxes load with identity orientation, dimensions
and placement preserved; `upgradeScene` migrates explicitly and never
re-embeds.

Oriented E3 boxes transform the query into the box's rigid local frame.
Rotation preserves the distance and hit guarantees, travels through the
uniforms, and participates in undo/save/load.

For curved architecture, an explicitly named **geodesic half-space cell**
rather than a silently reinterpreted E3 box: faces built from a centre, a
frame and face offsets. Its distance may be conservative even where individual
face intersections are analytic.

Support stays geometry-specific, and the schema enforces it: E3 boxes take
arbitrary rigid orientations; S3 cells take their defined spherical
construction; Nil and Sol constructions remain unsupported until their
adapters define and verify them. Changing a region's geometry never silently
distorts an object.

**Status:** schema, field and renderer all carry the frame. The shader derives
the third axis by the same cross product the field uses rather than being
handed it, so the two cannot disagree about handedness — a flipped axis would
mirror the box on screen while collision kept the original, which no Node test
can see. **Still owed:** S3 cell field/render implementation.

### 3. The authored S3 room — **IN PROGRESS**

Refactor collision and the camera boundary FIRST. Geometry adapters own point
and tangent validation, metric products, geodesic advancement and transport;
velocity and camera frames travel along the actual movement segments.

**Collision: done.** `engine/world/collision.js` now consumes
`createMetricSpace` and holds no Euclidean assumption of its own. `e3Space()`
is the same adapter with `kind: 'e3'`, so every existing caller is unchanged --
and every existing E3 walking, physics and portal test still passes, which is
what makes the refactor faithful rather than merely green.

Three things changed in substance rather than in shape:

- **Points are no longer assumed to be three numbers.** An S3 point is a
  four-vector on the unit sphere. Where a space is in hand the space validates;
  `clearance` has no space and so checks only what it can, leaving the field as
  the authority.
- **The metric takes the point it is evaluated at.** `norm(p, v)`,
  `dot(p, u, v)`, `project(p, u, n)`, `transport(p, q, v)`. Outside E3 an inner
  product and a parallel transport are properties of a PLACE, not of a pair of
  arrays.
- **A sweep carries a vector along the path the probe actually took**, not
  between its endpoints. Endpoint transport is transport along the shortest
  geodesic joining them, and a probe that slid round a corner or crossed a
  portal did not travel along that. Each leg contributes its carry and they
  compose in path order. In E3 every carry is the identity, which is exactly
  why this was invisible until now.

`curved-collision.test.js` runs the solver against a metric ball in S3 with
curvature radius 4 -- sweeping, overlap resolution, sliding, carrying -- with
no change to the solver. Contact distances are checked against the
great-circle closed form; a free move is checked to cover its arclength rather
than its chord (they differ by ~8% there, which no tolerance would hide); the
composition of the sweep's legs is checked to equal one long transport; and
the patch boundary is checked to be a REPORTED distance rather than a
collision.

**Portals are now refused outside E3 rather than approximated.**
`apertureCrossing` interpolates linearly between two points -- the geodesic in
flat space, and in S3 not even a point ON the sphere. It would not throw; it
would return a plausible crossing in the wrong place. Since everything else in
the solver is geometry-correct, that was the one remaining place a curved world
could quietly misbehave, so `sweep` refuses. Curved apertures are item 4 and
their policy is Astra's; a chord-shaped guess would sit in the way of it.

**Still owed for this item, in order:**

1. ~~**The S3 scene field.**~~ **DONE, and it already existed.** Astra had
   built `sphereField` and `sphericalPrimitive` in `region-world.js`; nothing
   exercised them. `s3-room.test.js` does, against independent closed forms --
   the strongest being the flat limit, where the same authored room at
   curvature radius 10000 agrees with Euclidean arithmetic to 1.35e-8. The
   room compiles, the ball is exact along a great circle, cell faces sit at the
   authored arclength along the cell's own construction axis, the bound never
   overestimates, up varies from point to point, and a probe walks through the
   doorway and is stopped by the wall beside it.

   One defect found and fixed in the fixture: the doorway cutter overhung its
   wall by only 0.5 against a player radius of 0.25, and the carver's own far
   face -- a PHANTOM SURFACE in open air -- stopped the walker at y = 2.05.
   Not curvature-specific; see the rendering contract and MUSE-33.
2. ~~**A transported camera frame.**~~ **DONE in the engine; not yet wired
   into the lab.** `engine/world/camera-frame.js`. The frame is state now: it
   is created once, rotated in place about its OWN axes by the mouse, carried
   along the path actually walked by the same `carry` the velocity uses, and
   mapped through a portal by the same matrix the walker is.

   Two properties had to hold at once, and they pull against each other. In E3
   it must be the OLD camera exactly, or it is a rewrite wearing a
   generalisation's clothes: `turn(canonical, { yaw, pitch })` matches the
   lab's `basis()` to **2.22e-16** over 153 look angles. And on a sphere it
   must do what the old one cannot: carried round a closed geodesic triangle
   the frame comes back rotated by the enclosed area over R squared, matching
   l'Huilier's theorem to **3.25e-17**, and exactly 0 in E3. A camera that
   quietly re-derived itself from `space.frame(p)` would come home unrotated
   and fail that by the whole excess.

   Roll survives, because yaw and pitch about the frame's own axes do not
   commute: a loop of look-inputs leaves 0.486 rad of roll that the old camera
   reports as zero. Gravity alignment is `alignUp`, an explicit policy a host
   may snap, ease or decline -- and it never re-aims forward, because standing
   a walker upright is not turning them.

   The lab is wired to it: `yaw`/`pitch` scalars are gone, the mouse turns the
   frame about its own axes, and a transit carries all three vectors through
   `portal.mapVector` -- the same map the walker is carried by -- so roll
   survives a tilted aperture. `aimAlong` is gone with them. 90 GPU checks on
   a real GPU, cold cache.

   ONE ASSUMPTION LEFT, and it is now named where it lives: the pitch clamp
   stops the view tipping past vertical against a world up. That is a walking
   policy, not a fact about the space, and a curved region will have to state
   it differently or decline it.
3. **The room itself**, once those two exist.

The S3 subset: metric balls and oriented great-sphere half-spaces;
conservative Boolean composition and the defined cells; physical distances
scaled by curvature radius; gravity from a chosen spherical floor's
signed-height field; fully transported camera frames, with gravity alignment
an explicit walking policy rather than an assumption.

Keep the first level inside a supported open-hemisphere patch, and handle
numerical-domain exits explicitly — **an authoring extent must not silently
become a collision wall.**

One room, with a passage, an obstacle and a short route. The author can change
dimensions and placement, see the result, walk the route, undo and reload.
Player clearance and intrinsic measurements are on screen. Existing edit
controls are kept; a gizmo system is not a prerequisite.

### 4. Connected E3 and S3 regions

Replace the single-region runtime assumption with independently compiled
regions and region-owned player state. The portal uses radial aperture
coordinates in the two anchor frames. Preserving speed and player radius are
**gameplay policies, stated as such** — not a claim that two finite apertures
are isometric.

A crossing preserves remaining movement time, carries the camera frame, checks
destination clearance and prevents immediate recrossing. Rendering queries the
destination region with bounded traversal and reports unresolved rays.

Acceptance: a short E3 → S3 → E3 route that survives traversal, editing and
save/load.

The spherical bubble comes later — retain original terrain, define deformation
and clipping, then reversible activation and safe expiry.

## Division of work

- **Astra** — query guarantees, construction semantics, curved movement and
  transport, cross-geometry connection policy.
- **Opus** — implementation within those contracts, editor integration,
  renderer execution paths, measured performance.
- **Muse** — the box corpus and independent reference continue. The
  coincident-face investigation is **revised**: failing to reproduce a GPU
  artifact in Node is a VALID result, a legitimate change of normal across an
  edge is not a defect, and no universal editor warning distance may be
  derived from a single camera or epsilon.

## Required acceptance checks

- Independent distance, intersection, normal and transport identities.
- Range limits, tangencies, overlaps, thin cuts, budget exhaustion.
- Large-step collision, sustained walking, edit-induced overlap, transported
  frames.
- JSON migration, rotation, undo/redo, cross-region persistence.
- CPU/GPU comparisons, plus saved images inspected for structural artifacts.
- Representative frame-time distributions, reported with hardware and
  resolution.

Use the host probe and the browser-check queue. Historical suite counts and
performance figures remain attributed evidence until rerun.

## Boundaries

JavaScript, WebGL and the existing dependencies for this phase. No host
migration, no general rigid-body physics, no broad asset importing and no
further game modes while the curved authoring contract is being established.

After the connected-room milestone: direct manipulation and feature snapping,
then evaluate host-provided editor services, then terrain transfer and the S3
ability. Nil and Sol authoring follows through explicit constructions with
measured numerical guarantees.

**Success is a reusable kernel demonstrated by an authored curved level** —
not another geometry demo disconnected from the editor.
