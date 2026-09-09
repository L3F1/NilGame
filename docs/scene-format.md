# Scene document v1

Status: implemented authoring-data foundation, not a playable scene loader.
The separate [ball lab](ball-lab.md) executes a restricted E3 subset with
editable rendering and distance queries; connected-lab remains tools/tests only.
Source of truth: `engine/world/document.js`. Example:
[`connected-lab.nil.json`](../levels/fixtures/connected-lab.nil.json).

Run `node tools/scene-check.js [path]`. Unknown versions, fields, geometry kinds,
missing references and invalid coordinates fail explicitly. `parseScene`
parses JSON and validates; `validateScene` leaves input untouched;
`prepareScene` creates chart objects and model points for tooling.

## Document fields

| Field | Meaning |
| --- | --- |
| `format`, `version` | `nil-scene`, `1`; incompatible changes require migration. |
| `id` | Stable lowercase ID, not a filename or engine resource path. |
| `units` | `name: design-unit`, positive `playerRadius` for authoring clearance. |
| `regions` | Independent IDs, geometry descriptions, topology and bounded extent. |
| `entities` | Stable IDs, region ownership, kind and authored position. |
| `connections` | Bidirectional portal intent between named anchor entities. |

All scene/region/entity/connection IDs are globally unique within the document.
Units are intentionally not assumed to be meters. Import tools must declare
conversion; changing a display label must not silently change curvature.

## Regions and coordinates

`geometry` contains `kind` (`e3`, `h3`, `s3`) and positive `curvatureRadius`.
E3 uses radius 1 as a convention since it has no curvature radius. In curved
regions, physical sectional curvature is sign / radius squared. The registry
key `e3t` is a legacy playable experience, not a document geometry kind.

`topology` currently accepts only `cover`. Quotients are deliberately rejected
until per-region fold and object-carrying adapters exist. Existing playable
quotient worlds are unaffected. Product geometries remain playable but do not
yet implement this new authoring-chart contract.

`extent` is a positive chart-authoring bound, not a collision wall. S3 extent
must be less than `(pi - 0.0001) * curvatureRadius`; H3 extent is limited to
`4 * curvatureRadius` for numerical conditioning. Larger worlds require more
charts, not increasing this limit without tests.

Entity `position: [x,y,z]` is a radial tangent offset from the region origin.
Its vector length is the geodesic distance in design units; it is not an
ambient model point. In H3 and S3, subtraction of two such offsets generally
does not give their physical separation. `prepareScene` converts positions
into the correct four-component model points. Runtime chart poses and body
frames are separate from this authoring position.

## Entities

- `spawn`: position plus clearance using `units.playerRadius`.
- `objective`: point marker; no game rule implied.
- `ball`: positive intrinsic radius. Center plus radius must fit the chart.
- `anchor`: positive aperture radius plus unit, perpendicular `forward` and
  `up` vectors, expressed in the frame obtained by parallel transport along
  the radial geodesic from the region origin. The default example uses z-up.

Entity bounding radii are conservatively checked against chart extent. This
does not establish spawn/objective reachability, collision clearance against
other entities, doorway usability or a valid smooth seam between regions.

## Connections

Each connection has `kind: portal`, `a` and `b` anchor IDs,
`velocity: preserve-speed`, and `scale: 1`. Endpoints must differ, have equal
aperture radii and belong to at most one connection each. Same-region portals
are allowed. Both endpoints can belong to different geometry kinds.

These fields are TRAVERSED and rendered through. There is no
velocity implementation yet. Equal aperture radius does not assert isometric
matching of entire discs across different curvatures. The runtime must define
aperture coordinate mapping, side/orientation conventions and exit placement.
Scale-changing portals, smooth seams and bubble regions require later schema
versions and corresponding simulation/rendering support.

## Terrain-transfer API

`createChart({kind, curvatureRadius, maxDistance, origin?})` creates a bounded
chart. `origin` is an optional valid normalized-model placement (16 column-major
numbers); it is copied. `decode(offset)` returns an ambient model point;
`encode(point)` returns a design-unit tangent offset. `distance` uses intrinsic
distance within the cover, not an obstacle-avoiding or quotient path.

`transferPoint(source, target, point)` preserves the source radial offset.
`transferStretch(source, target, distance)` reports infinitesimal radial,
transverse and volume scaling. It is a distortion diagnostic, not a collision
bound over a whole object. The map respects chart origins; it does not consult
document portal anchors or implement portal transit.

## `plane` entities (added 2026-09-09)

A half-space. `position` is any point on the plane and `up` is its unit normal;
the solid side is the one the normal points AWAY from, so a floor points up.
`radius` and `forward` are refused on a plane.

A plane is unbounded inside its region, so the extent check applies to its
anchor `position` only -- unlike a ball, whose surface must fit. Region extent
remains an authoring bound, not a wall: the field answers for points outside it.

`experiments/godot/ball_document.gd` does not implement planes yet and rejects
documents containing them.
