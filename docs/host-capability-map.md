# Host readiness: browser reference, bounded Godot integration

Connected-preview row updated 2026-09-11; other rows reviewed 2026-09-10. Historical assessment and measurements:
[archive](archive/host-capability-map-pre-connected-sight.md),
[runtime experiment](decisions/001-runtime-strategy.md). Their numbers have not
been rerun for this assessment. Current direction remains a geometry kernel and
level editor, with a host providing services.

## Current capability boundary

| Capability | Delivered / limitation |
| --- | --- |
| Historical geometry experiments | Eight geometries; not eight authored kernel adapters |
| Authoring document | Version 2, region ownership, E3/S3 constructions, validated edits |
| Flat solids | Oriented boxes, balls, half-spaces, scoped Booleans, analytic ray queries |
| Curved solids | S3 balls, great-sphere planes/cells, conservative Boolean fields |
| Motion | E3/S3 geodesic sweeps, carried cameras, cross-region transit, correction resumption |
| S3 walking | One unmodified designated floor, gravity/jump/local horizon; other solids obstruct but do not provide support |
| Editor | Flat and single-S3 authoring/play, undo/save/load; curved walking available |
| Connected sight | CPU reference plus bounded E3/S3 GPU portal preview with continuous flight; not connected-region editing. See docs/connected-preview.md |
| Direct manipulation | General curved gizmos, snapping and clearance guidance still need work |
| Godot prototype | Rendering reference plus scene-v1 ball-document/Control UI experiment; not current scene-v2 parity |

Do not collapse a geometry demo, a query implementation and a usable editor
feature into one status. Current sight contract/evidence:
[connected sight](qa/astra-connected-sight-2026-09-10.md).

## Ready for what?

A bounded Godot host-service experiment can start now. Full migration is not yet
justified. Start with a custom editor main screen or dock containing our own
viewport; do not begin by forcing the curved scene into Godot's ordinary 3D
viewport. Reuse native inspector controls, file/resource handling and undo.
[Godot editor plugins](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/index.html)
provide the extension boundary.

Before making Godot the primary authoring host, demonstrate:

1. One current version-2 S3 room loads with identical IDs, frames, physical units
   and refusal behavior; editing, undo and reload round-trip without lossy conversion.
2. Camera transport, floor walking and collision pass language-neutral fixtures
   against the JS reference, including invalid starts and correction debt.
3. Custom curved picking/overlay coordinates agree with the rendered viewport.
   Native flat-space transforms and physics are not the authority for curved motion.
4. Compare cold preparation, frame-time distributions, input behavior and visual
   structure at identical resolution/hardware. Historical H3 shader-link gains do
   not establish gains for today's smaller S3 editor shader.

Connected GPU preview is now demonstrated separately from host migration.
Connected editing and broad numerical coverage remain outstanding. A host
migration does not supply that geometry work automatically.
Keep the browser runnable during any native experiment.

## Why Godot first, rather than Unity?

This is a project-fit recommendation, not a benchmark verdict. Godot permits
source changes under its [MIT license](https://godotengine.org/license/), and we
already have a native rendering/authoring experiment. That makes it a sensible
first host to evaluate for a small team owning an unusual geometry pipeline.

Unity is technically viable: it supports
[native plug-ins](https://docs.unity3d.com/6000.0/Documentation/Manual/plug-ins-native.html)
and [custom editor UI](https://docs.unity3d.com/6000.0/Documentation/Manual/UIElements.html).
Choose it if specific production requirements, existing Unity expertise or
required integrations outweigh the additional host implementation. It does not
remove our geometry work. Neither engine's default character controller is a
replacement for this metric-aware kernel.

Useful host services: editor UI, resource/file management, undo integration,
asset decoding, audio playback, input/window management and packaging. Imported
mesh placement, curved projection, occlusion, metric audio propagation and
navigation still require our adapters. E3 regions can potentially use more native
services, but ownership at a curved connection must remain explicit.

JavaScript modules do not become GDScript/C# modules automatically. Port or bind
one tested kernel slice at a time; consider compiled native math only after
profiling. Changing language is not a promise of faster rendering, and replacing
WebGL does not repair a costly or incorrect ray algorithm. Staying on the web
remains useful for instant distribution and the executable reference.

## Corrections to the earlier assessment

- Union via min is not generally an exact signed distance inside overlapping
  solids. Preserve exterior bounds, interior sign and intersection guarantees
  independently; analytic Boolean rays need not depend on exact distance.
- A single collision skin is not a universal numerical tolerance. Aperture side,
  root uncertainty, chart limits, renderer precision and authoring clearance
  require their own specified meanings.
- Implicit sign avoids mesh cracks in the mathematical representation; finite
  stepping, degenerate solids and numerical classification can still fail.
- Mesh/asset experiments are evidence for their tested construction and scale,
  not permission to import arbitrary architecture unchanged into every metric.
