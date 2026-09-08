# 001: Evaluate a native host before building the full editor

Date: 2026-09-07. Status: evaluation direction selected; migration not executed.

## Context and decision

The goal is now an engine/editor for interacting geometries, not only a browser
game with additional modes. That strengthens the case for adopting existing
editor and asset tooling early. **Godot is the first native host to evaluate.**
Retain the current web app as a playable and numerical reference during the
evaluation. Unity remains a viable alternative if Godot has a measured blocker.

This is not a commitment to reimplement every feature twice. The short native
experiment must settle the host decision before substantial editor investment.
Keep authored scenes and numerical fixtures independent of either vendor.

## What a host contributes

Godot supports custom editor gizmos, and its RenderingDevice-based renderers
provide compute shaders. Those are useful foundations for authoring and future
GPU work; they do not supply curved-space collision or geodesic rendering.
[Editor gizmos](https://docs.godotengine.org/en/stable/tutorials/plugins/editor/3d_gizmos.html),
[compute shaders](https://docs.godotengine.org/en/stable/tutorials/shaders/compute_shaders.html).

Unity is also a candidate for a custom-rendered engine with C# gameplay code.
Its scripting and Web platform documentation explain the runtime/export model.
[Unity scripting](https://docs.unity3d.com/6000.0/Documentation/Manual/intro-to-scripting.html),
[Web technical limitations](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html).

For either host, ordinary mesh cameras, rigid-body physics, navigation and
positional audio assume Euclidean geometry. Use their platform/editor services
while implementing the curved equivalents explicitly. A default CharacterBody
or character controller does not replace NilGame's geometry-aware simulation.

## Language and performance

Godot supports GDScript, C# and C++ through GDExtension. Start the host experiment
with a small amount of typed GDScript for editor integration; select C# or C++
for CPU kernels only after measurement. C# would be a familiar transition from
Java, but changing language is not itself an optimization.
[Godot language choices](https://docs.godotengine.org/en/stable/getting_started/step_by_step/scripting_languages.html).

The current scene renderer already runs shader code on the GPU, not JavaScript
per pixel. Changing the CPU language cannot remove ray-march steps, expensive
geometry queries or shader inlining. A native backend may improve compilation,
threading and access to GPU features, but must be benchmarked. Preserve double
precision in the mathematical reference; do not accidentally substitute native
engine float vectors for all geometry state without checking numerical error.

## Web versus native

Web makes sharing a test easy and keeps the current edit-refresh cycle short.
Native builds offer less restricted file access, threads, graphics backends and
network transports. These are platform differences, not guarantees of higher
frame rate.

Godot's current stable documentation says Web export uses WebGL2 Compatibility,
does not support Godot 4 C# projects, and needs additional isolation headers
for threaded exports. A Godot Web export still has browser restrictions; it
does not provide the native renderer's compute path. Recheck these details
when selecting an exact release.
[Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

## Multiplayer

Moving to a native client does not make multiplayer inherently harder or
require players to host publicly reachable servers. Native clients can connect
to an authoritative hosted server just as browser clients can. Distribution
is less immediate than sending a link, but transport options broaden.

Godot's multiplayer API supports transports including ENet; browser builds
have WebSocket/WebRTC limitations and cannot simply use the same raw UDP path.
Cross-platform clients must agree on both protocol and available transport.
[Godot multiplayer](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html).

Dedicated authority, or a peer host with suitable relay/NAT handling, remains
a design choice. Hosting and bandwidth still need provision. No engine fixes
latency by itself. NilGame's hard part is synchronized region ownership,
content revisions, boundary events and prediction/reconciliation through those
events. Packets must identify which geometry/region a pose belongs to.

The current root app uses WebRTC. The separate `server/` Colyseus experiment
simulates flat 2D motion and cannot be adopted as curved authority unchanged.

## Both kinds of architecture, and the S3 bubble

Curved architecture and flat rooms with portal connections can coexist as
different region types. The editor must expose the actual metric inside each
region and the connection rule at each boundary. This does not require forcing
every connection to be a smooth manifold seam.

A region with positive curvature is a plausible first bubble experiment.
A complete S3 has no boundary; a bounded patch of it can have one. First map a
static patch, then make entry/exit and terrain collision agree, then activation,
expiry and motion. A smoothly blended metric is another research stage: it
changes geodesics, transport and distance estimates throughout the blend.
Do not describe a sharp gameplay portal as a smooth curvature transition.

Radial terrain mapping preserves distances from its chosen center while
distorting other lengths. The first implementation measures this distortion;
it does not claim arbitrary imported structures remain rigid or isometric.

## Evaluation acceptance criteria

1. Load the same JSON and pass language-neutral geometry fixtures.
2. Render a representative H3 quotient scene and compare identical viewpoints.
3. Record CPU/GPU frame time, frame-time spikes, cold/warm shader preparation
   and input response at matching resolution, ray budget and scene complexity.
4. Place/edit one primitive with undo and immediately test it in first person.
5. Exercise the selected network transport with two instances.

Record the exact engine build, GPU and graphics backend. If authoring and
runtime behavior are satisfactory, move the host and editor to Godot while
preserving fixture-driven parity. If custom rendering/editor constraints block
the experiment, compare that same case in Unity rather than restarting blindly.

No new plugin or service is required for the current foundation. Godot, Unity
and dotnet were not found on PATH during this pass; that is not an inventory
of all installed applications. A Godot executable is needed for the native
experiment, and Blender becomes useful when asset authoring begins.
