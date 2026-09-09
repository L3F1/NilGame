# What this project is, and what to call it

Short version: **a non-Euclidean geometry kernel and level editor, hosted in a
browser today and possibly Godot later.** Not a game engine.

## Why "engine" is the wrong word

Godot is a game engine: a scene tree, asset import, audio, input, UI, physics,
navigation, an editor and export/packaging. This project has none of that
generically and should not grow it. Calling both "engines" makes them look like
competitors, and that framing has quietly distorted the host decision -- it
turns every conversation into *migrate or not*, when the real question is much
narrower.

## The three layers

| Layer | What it does | Who can supply it |
| --- | --- | --- |
| **Geometry kernel** | metric, geodesics, parallel transport, distance fields, exact ray hits, swept collision, quotients and folding | only this project |
| **Authoring tool** | scene documents, validation, selection, undo, save/load, edit-while-playing | this project, possibly using a host's UI toolkit |
| **Host** | window, GPU, input, audio, file dialogs, packaging | Godot, the browser, Unity |

The kernel is `geom.js`, `product.js`, `engine/geometry/*`, and
`engine/world/collision.js`, `walker.js`, `scene-field.js`. It answers *where am
I, how far is that, which way is straight, what does this ray hit, how do I
carry a direction from here to there.* No existing engine answers those
correctly off the shelf, and none will: every one of them has Euclidean space
compiled into its camera, its physics and its navigation. Decision 001 says the
same thing from the other side -- "ordinary mesh cameras, rigid-body physics,
navigation and positional audio assume Euclidean geometry".

## What follows from it

- **Godot is a candidate HOST, not a rival.** The kernel is kept portable and
  gets ported to whichever host wins; it is never replaced by one. The open
  migration gates in TODO.md are host questions -- input latency, an editable
  primitive with a gizmo, networking with two instances -- not kernel ones.
- **"Physics support" means the kernel's collision contract**, not adopting a
  host's rigid-body solver. A `CharacterBody3D` cannot walk on a surface whose
  geodesics diverge; `engine/world/collision.js` can, because it asks only for a
  distance bound and a normal.
- **The editor's job is documents, not rendering.** Scene v1 is host-neutral
  JSON; both the browser and Godot read the same file, and a host that cannot
  execute a feature must reject it rather than approximate it.

## What it is NOT, today

Not a game engine. No asset pipeline, no audio, no UI framework, no packaging,
no navigation mesh, no general physics. One region, one geometry at a time; the
kernel supports eight geometries in the reference app but the editor authors E3
only. Portal connections are recorded as intent and not yet traversed.
