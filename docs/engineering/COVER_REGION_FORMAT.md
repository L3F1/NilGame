# Cover-region serialization contract (experimental v1)

This is separate from scene-v2. Do not silently expand its bounded chart meaning.
Format: {format:'nil-cover-region', version:1, id, geometry:{kind:'s3',
curvatureRadius:R}, charts:[{id,center:[4],basis:[[4],[4],[4]],extent}],
entities:[{id,kind,chartId,position:[3], ...kindFields}]}.

All IDs stable lowercase strings and unique within the document (region, charts,
entities). Reject unknown keys, nonfinite numbers, unrecognized versions and kinds.
Charts are explicit local authoring frames: unit center, three orthonormal
tangents, positive orientation relative to space.frame(center), extent in (0,πR/2].
Entity position has physical tangent coordinates within the open chart. Charts
need not contain the whole object; they place its center, not clip its geometry.

First kinds: ball {radius}, spawn {}, anchor {radius,forward:[3],up:[3]}.
Exactly one spawn; no CSG, floors, cells, objectives or implicit conversion.
Ball and anchor radii positive and below πR/2. Anchor forward/up are orthonormal
in the chart basis transported along the local center-to-placement segment.
Spawn orientation uses that same transported basis. Ball/spawn cannot carry
anchor-only fields. The compiler checks spawn clearance against all balls.

API in engine/world/cover-region-document.js:
parseCoverRegion(json) validates and returns source data;
compileCoverRegion(source,{playerRadius=.25}={}) validates then returns
{id,space,balls,anchors,spawnPosition,spawnFrame,document()}.
space=createSphericalCover; balls={id,center,radius}; anchors={id,regionId,
space,center,normal,up,radius}. Frame vectors are ambient physical unit tangents.
document() returns a fresh copy of validated author data; snapshot caller arrays
so future mutations cannot change compiled geometry. Refuse bad input, don't repair.

compileFramedPortals(connections,anchors,playerRadius) consumes those physical
anchors, shared with scene-v2. Connection records retain kind:'portal', a/b IDs,
velocity:'preserve-speed',scale:1,matching radii. The enclosing mixed world must
check cross-document ID collisions and save its base scene, cover documents and
connection records together. No claim of editor/GPU support follows from parsing.
