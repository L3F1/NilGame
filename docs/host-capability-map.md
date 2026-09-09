# What this project needs, what a host supplies, and what we must build

The question this answers: **are we building things Godot would give us for
free, and are there Godot features we could build on instead of reinventing?**
Plus a second one that turned out to be related: **would the things a CAD
geometry kernel has -- topology, booleans, tolerances, watertightness -- help
here?**

Read with [what this is](what-this-is.md) for the vocabulary and
[decision 001](decisions/001-runtime-strategy.md) for the measurements.

## 1. What the project actually needs to do

The stated goal is an engine with an editor supporting complex interactions
between geometries, with physics, and eventually portals between DIFFERENT
geometries. That decomposes into needs, and it is worth being concrete, because
"we need an editor" hides the fact that most of an editor is chrome and a small
part of it is the thing nobody can supply.

| # | Need | Status |
| --- | --- | --- |
| 1 | Distance, normal, exact ray hit in a parameterised metric | done, eight geometries |
| 2 | Swept collision, contact normals, depenetration | done, E3; portable by design |
| 3 | Walking, gravity, ground contact with `up` as a parameter | done, E3 |
| 4 | A scene document that is host-neutral and validated | done, v1 |
| 5 | Author entities: add, select, edit, delete, undo, save | done, E3 |
| 6 | Author portals; traverse and see through them | done, E3 |
| 7 | **Direct manipulation: drag a thing in the view** | not done |
| 8 | **Snap and attach: put this ON that, centre it in that wall** | not done |
| 9 | **Carve: a doorway in a wall, a room out of a block** | not done |
| 10 | **More than one region, with different metrics, at once** | not done |
| 11 | **A portal between two different geometries** | designed for, not built |
| 12 | Assets: meshes, textures, audio | not needed yet, nothing is authored art |
| 13 | Packaging and distribution | the browser gives a URL |

Items 7-11 are the whole remaining editor. Keep them in view, because the host
question is really "who supplies 7 to 11", and the answer is not uniform.

## 2. Would CAD-kernel machinery help?

Taking the four things a B-rep kernel has, one at a time. The answers differ,
and lumping them together is what makes this look like a single yes or no.

**Booleans -- YES, and cheap.** Union, intersection and subtraction on implicit
surfaces are `min`, `max` and negation. `compileSceneField` already does union
by nearest solid. Subtraction is what need 9 is: a doorway is a wall minus a
box. This is days of work, not months, and it multiplies what an author can
make more than any other single feature.

One caveat that must be written into the contract rather than discovered:
**`min` of two exact SDFs is still exact, but `max` and subtraction are only a
bound.** Sphere tracing stays correct with a bound -- it just takes more steps
-- but `clearance()` promising exactness would become a lie.
[The rendering contract](rendering-contract.md) already separates distance
bound, exact ray hit and shading sample, so this fits an existing distinction
instead of needing a new one.

**Topology -- NO for full B-rep, YES for a cut-down version.** A B-rep face is
usually a trimmed NURBS or analytic patch, and NURBS are affine combinations of
control points. **H3 has no affine structure**, so the representation does not
transfer; you would need geodesic patches, plus robust surface-surface
intersection in a curved metric, which is a research programme.

But the *reason* to want topology here is need 8: snapping and attaching. That
needs far less than a B-rep. It needs a **feature reference** -- a named,
addressable part of a primitive, "the +z face of this box", "the equator of
this ball" -- with a point, a frame and a bounded extent. That is enough to say
"put the portal in the middle of that wall" and enough for a gizmo to snap to.
It is not topology; it does not survive booleans automatically; and it is worth
building. Do not call it B-rep, because the moment somebody expects a boolean
to produce correct new faces, the cut-down version breaks.

**Tolerances -- NO.** CAD tolerance machinery exists because B-rep booleans
generate near-degenerate geometry that must still be classified. We do not have
that disease, so we do not need the medicine. We have `skin`, one number, and
it is enough.

**Watertightness -- ALREADY HAVE IT, for free.** An SDF's sign *is* inside and
outside. A solid cannot fail to enclose a volume; there is no such thing as a
leaking SDF. This is one of the reasons the representation is right here rather
than a poor imitation of B-rep.

The deeper point: **a CAD kernel is B-rep because CAD needs exact manufacturing
geometry and dimensional constraints. We need a distance and a normal.**
Different requirement, different representation. The SDF choice is not a
compromise; in a space where you cannot write down a general surface patch, it
is the only representation that still works.

## 3. What Godot supplies, item by item

Checked against current Godot documentation, September 2026, not from memory.

| Godot feature | Usable here? | Notes |
| --- | --- | --- |
| Window, GPU context, input, audio | yes | the browser also supplies these |
| **Editor docks, inspector widgets, file dialogs, tree** | **yes, directly** | `EditorPlugin.add_control_to_dock`; real UI we would otherwise write |
| `EditorUndoRedoManager` | yes | we have about 30 lines doing this already |
| **Compute shaders** | **native only** | "Compute shaders can only be used from RenderingDevice-based renderers (the Forward+ or Mobile renderer)" -- so NOT Compatibility, and therefore NOT the web export |
| Threads | native only | same boundary |
| Asset import (glTF, textures, audio) | yes, when we have assets | need 12; currently zero value |
| Packaging, Steam | yes | against a URL, which is not obviously worse |
| **Shader compilation speed** | yes, and measured | 0.7 s first frame vs 8.4 s ANGLE link |
| `Camera3D`, `Transform3D` hierarchy | **no** | affine 4x4; our placements are Lorentz matrices with a different invariant |
| `CharacterBody3D`, rigid bodies, `PhysicsServer3D` | **no** | Euclidean sweeps and contacts throughout |
| `NavigationServer3D` | **no** | a navmesh assumes a flat metric |
| Mesh rendering, culling, LOD, shadows | **no** | we do not draw meshes; we march a field |
| Positional audio | **no** | attenuation and panning assume Euclidean distance |
| **3D editor gizmos** | **partly -- see below** | the handle protocol is reusable, the drawing is not |

### The gizmo finding, which is the interesting one

`EditorNode3DGizmoPlugin._set_handle` has this signature:

    void _set_handle(gizmo, handle_id: int, secondary: bool,
                     camera: Camera3D, screen_pos: Vector2)

The documentation says the implementation should "use the camera to convert it
to raycasts". **Godot's gizmo system already hands you a screen position and
expects you to do your own projection.** That is exactly the shape we need: our
projection is not Godot's, and the protocol never assumed it would be.

What does NOT transfer is the *drawing*. `_redraw` adds meshes and lines in
Euclidean world space, drawn by the editor's own perspective camera, which we
cannot replace. So a handle would appear where flat space says it should, over
an image of curved space where it should not.

There is a way around it, and it is worth ONE experiment rather than a
commitment: Godot sky shaders receive a per-pixel eye direction, and a sky is
drawn behind everything else in the viewport. March the curved world in a sky
shader, then place gizmo geometry by back-projecting the screen position we
want through the editor camera -- Godot's gizmos become screen-space widgets
whose positions we compute. `EditorInterface` exposes the 3D editor
`SubViewport` and `get_camera_3d()`, so both halves are reachable.

**This is a design sketch, not a measured result.** It has not been tried. It is
the cheapest test of whether Godot's 3D editor can host a non-Euclidean viewport
at all, and it should be run before any migration decision, because criterion 4
of decision 001 -- an editable primitive with a gizmo -- is exactly this
question.

## 4. The finding that changes the host argument

Decision 001's headline number is shader preparation: **8444 ms in the browser
against 721 ms in Godot.** That measurement is real and it is the strongest
single argument for a native host.

But it is a measurement of **the arena's hyperbolic program**, which inlines a
large scene function across many primitives. The editor's own program is not
that. Measured today on the same machine, `page-check --ball-lab` links
`BALL_FIRST_PERSON_GLSL` on a real GPU with a **cold** shader cache in **0.7 s**
-- the same as Godot's figure, on the host we already have.

So: **the compile-time argument does not currently apply to the editor.** It
applies to the arena, and it will apply to the editor on the day the editor
authors H3. That is a trigger to watch for, not a reason to move now.

## 5. So: are we rebuilding anything Godot would give us?

Almost nothing.

- Needs 1, 2, 3, 6, 10, 11 -- the metric, collision, walking, portals, multiple
  regions, cross-geometry connections -- **no host supplies these and none
  will.** Every engine has Euclidean space compiled into its camera, its physics
  and its navigation.
- Need 7, the viewport gizmo, is **ours in either host.** Godot's handle
  protocol saves the event plumbing; the projection, the picking and the drawing
  are ours regardless. `rayHit` already provides the pick.
- Needs 8 and 9, snapping and booleans, are **kernel work.** No host has a
  curved-space CSG.
- Needs 4 and 5 -- documents, validation, undo, save and load -- are done, and
  the parts Godot would have supplied (an undo stack, a file dialog) are the
  cheapest lines in the file.
- Need 12, assets, is where a host would genuinely save months. We have no
  assets. **That is the honest trigger to revisit.**

The one thing we are plausibly rebuilding is **editor chrome** -- panels,
inspector widgets, a list. HTML is a good UI toolkit, so that trade is not
obviously bad today. It gets worse as the editor grows.

## 6. What to do, in order

1. **Booleans in the field.** Highest ratio of authoring power to work, and pure
   kernel: no host involved. Extend the contract to say which operations return
   an exact distance and which a bound.
2. **The viewport gizmo, in the browser.** It is ours in either host, so
   building it costs nothing against a future migration and it settles
   criterion 4 on the host we already have.
3. **The Godot sky-shader experiment**, one afternoon, to find out whether a
   non-Euclidean viewport can live inside Godot's 3D editor at all. This is the
   only cheap question whose answer would actually move the host decision.
4. **Feature references** for snapping, once booleans exist and there is
   something to snap to.
5. Revisit the host when there are assets to import, or when the editor authors
   H3 and link time becomes the binding budget again.

## Sources

- [Godot compute shaders](https://docs.godotengine.org/en/stable/tutorials/shaders/compute_shaders.html)
- [Godot 3D gizmo plugins](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/3d_gizmos.html)
- [EditorNode3DGizmoPlugin class reference](https://docs.godotengine.org/en/stable/classes/class_editornode3dgizmoplugin.html)
- [EditorPlugin class reference](https://docs.godotengine.org/en/4.4/classes/class_editorplugin.html)
