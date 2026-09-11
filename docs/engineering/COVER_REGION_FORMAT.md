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
spawnFrame is the transported ordered basis [e0,e1,e2]; the host uses e1 as
forward and e2 as up. It is not reconstructed from a global coordinate axis.

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

The envelope implemented by compileConnectedCoverWorld is
{format:'nil-connected-cover',version:1,id,baseScene:<scene-v2>,
coverRegions:[<nil-cover-region>],connections:[<portal records>]}.
Base scene connections remain owned by that document; envelope connections
join endpoints across documents. Entity and region IDs must remain unambiguous
across the world, each endpoint may connect once. Units/player radius come from
baseScene.units and are passed to cover compilation. Save/load includes all
authoring charts; no conversion to the base region's coordinates occurs.
Mixed-world renderData refuses until a renderer can consume global regions.

The initial global collision field is an additive union of metric balls: exact
exterior distance, interior sign with conservative magnitude, and nonunique
normals at ties or ball center/antipode. There is no floor/gravity policy here.
Sight uses the complete-sphere ball query with the shared work budget; inside
starts, tangencies and uncertain range endpoints retain its unresolved verdict.
Global portal crossings search future entering roots even from the back side;
each root must lie in the local aperture disc, not its antipodal counterpart.
The older bounded-region start-side restriction remains in force.
