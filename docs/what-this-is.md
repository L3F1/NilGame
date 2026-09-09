# What this project is, and what to call it

Short version: **a non-Euclidean geometry kernel with a level editor.** The
kernel is the part nobody else has; the editor and the renderer are ordinary
work built on top of it.

One sentence, if you need to explain it to somebody:

> A geometry kernel where the curvature of space is a parameter -- plus an
> editor to author worlds on top of it. Every game engine hardcodes flat space;
> this one takes the metric as an input, so the same collision, movement and
> portal code runs in hyperbolic space, spherical space, Nil, Sol and the rest.

## What a kernel is, and what a *geometry* kernel is

A **kernel** is the small trusted core of a system that owns a resource and
mediates every access to it. An operating-system kernel owns the CPU, the
memory and the devices; nothing else touches them directly. The word carries
three claims, and all three have to be true or it is just a library:

1. it is the innermost layer -- nothing beneath it;
2. it is small and stable relative to what is built on it;
3. dependencies point only inward -- it knows nothing about its clients.

A **geometry kernel** is a term of art from CAD. Parasolid, ACIS and Open
CASCADE are geometry kernels: the component that owns the mathematical
representation of shape and answers geometric questions -- what is a solid,
where do two of them intersect, is this point inside, what is the distance,
what is the surface normal. The application on top owns the UI, the feature
tree and the file format. The illustration that makes it click: **SolidWorks
and NX are different products sitting on the same Parasolid kernel.** One
kernel serves many applications, and the application is the replaceable part.

## Why the term fits here, and where it does not

It fits. There is a layer that owns what space *is* and answers exactly those
questions -- `field.distance()`, `field.normal()`, `clearance()`, `sweep()`,
and the `space` interface of `step` and `transport`. Everything above asks it
and cannot answer for itself. It has no DOM, no WebGL and no game; it runs
under Node. Dependencies point inward. That is a kernel by all three tests.

Two places the word would mislead somebody who knows CAD, so say them out loud:

- A CAD kernel is a **B-rep** kernel. It owns topology -- faces, edges,
  vertices -- plus booleans, tolerances and watertightness guarantees. We have
  none of that. We have implicit surfaces and no topology at all. A much
  smaller class of thing.
- Parasolid is **always Euclidean**. It assumes flat space so completely that
  the assumption is invisible. So this is not a geometry kernel in the CAD
  sense; it sits a layer *below* where CAD kernels start.

Which gives the inversion that is actually the point:

> **Parasolid owns shapes in a fixed space. This owns the space itself, and the
> shapes are trivial** -- spheres and planes. The variable is not the geometry
> of the object. It is the geometry of the world.

## On the word "engine"

An earlier version of this file said flatly "not a game engine". That was an
overcorrection and it is worth naming, because the tidy answer was wrong in a
way that distorts planning.

The project **is** engine-shaped in most respects: a renderer, a collision
system, a scene format with validation and serialisation, a level editor with
undo, input and camera handling, game modes, and WebRTC multiplayer. Calling
that "only a kernel" understates it.

The precise claim is narrower. **The kernel is the irreplaceable part; the rest
is generic engine services we currently write ourselves** -- and writing them
ourselves is a choice with a real cost, which is what the host question is
actually about. "Engine" describes the whole project. "Geometry kernel" names
the part that is distinctive.

## The three layers

| Layer | What it does | Who can supply it |
| --- | --- | --- |
| **Geometry kernel** | metric, geodesics, parallel transport, distance fields, exact ray hits, swept collision, portal isometries, quotients and folding | only this project |
| **Authoring tool** | scene documents, validation, selection, undo, save/load, edit-while-playing | this project, possibly using a host's UI toolkit |
| **Host** | window, GPU, input, audio, file dialogs, packaging | the browser today; Godot, Unity |

The kernel is `geom.js`, `product.js`, `engine/geometry/*`, and
`engine/world/collision.js`, `walker.js`, `scene-field.js`, `portal.js`. It
answers *where am I, how far is that, which way is straight, what does this ray
hit, how do I carry a direction from here to there.* No existing engine answers
those correctly off the shelf, and none will: every one of them has Euclidean
space compiled into its camera, its physics and its navigation. Decision 001
says the same thing from the other side.

## What a host is for, honestly

A host supplies **editor infrastructure** (docking panels, gizmos, file
dialogs, an undo framework), an **asset pipeline**, faster **shader
compilation** (measured: 8.4 s browser link against 0.7 s Godot first frame),
**compute shaders and threads**, and **packaging**. What it cannot supply is
the kernel, because its camera, physics, navigation and transform hierarchy all
assume Euclidean space -- `Transform3D` is an affine 4x4 and our placements are
Lorentz matrices with a different invariant.

So adopting Godot would mean taking its window, editor UI and asset import
while bypassing its renderer and its physics entirely. **That is a real risk:
using an engine while bypassing most of it can cost more than not using it.**

Which makes the decision **per service, not all or nothing** -- and it has
already been made once. The browser is the current host, supplying GPU, input,
windowing and distribution, while we wrote everything else. The live question
is only *which generic services do we want to stop hand-writing, and what does
adopting them cost.* The trigger to revisit is a viewport gizmo and asset
import, not a date and not "the kernel is finished".

## What it is NOT, today

Not a general game engine: no asset pipeline, no audio, no UI framework, no
packaging, no navigation mesh, no general rigid-body physics. One region and
one geometry at a time; the kernel supports eight geometries in the reference
app, but the editor authors E3 only. Portals are traversed and seen through in
E3; a portal between two DIFFERENT geometries is designed for and not built --
`portal.js` is where it goes, and the map there stops being an isometry of one
space and becomes a correspondence between two.

There are also **two of everything** right now, deliberately. The arena game
has its own portals (`physics.js`, hyperbolic only, a player ability shot at
runtime) and its own world definition (`levels/presets.js` plus `shader.js`,
not authorable). The new stack has authoring, a portable collision contract and
E3 only. They do not talk to each other. That duplication is kept while the
generalizable version is being developed, and it cannot stay for ever.
