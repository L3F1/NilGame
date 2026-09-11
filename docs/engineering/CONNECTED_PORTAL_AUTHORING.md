# Next contract: author portal pairs

Use the existing connected-document transaction, not incremental runtime portal
mutation. The final graph must compile and pass current-player/spawn checks and
GPU capacity checks before any document, camera, texture or history is replaced.
Existing metric/coverage conversion restrictions still apply.

## Create

Create two new anchor entities AND their connection as one operation. Require
distinct, globally unused IDs; explicit region ownership and cover chart IDs;
physical author-coordinate positions; local orthonormal forward/up construction
vectors; one shared aperture radius. Use the existing preserve-speed, scale1
portal policy. Do not claim that finite E3 and S3 apertures are isometric.
New connection records belong to the connected envelope. Anchor records belong
to their respective base scene or cover documents. A failure at either end
creates nothing; undo removes the whole pair in one step.

Orientation is expressed in each endpoint's own construction frame, then decoded
by the existing anchor compiler. Do not copy ambient E3 three-vectors into S3
four-vectors or rebuild orientations from an unrelated world-up axis.

## Reconnect

Accept a batch of existing connection IDs with their desired endpoint IDs, so
swapping two pairs can validate the FINAL graph without an invalid intermediate
graph. Keep connection IDs stable. Each endpoint may belong to only one pair.
Do not steal an occupied endpoint or silently disconnect its previous pair.

A rewritten connection originally inside baseScene.connections must be removed
from that container and written into envelope connections in the same candidate
document: the base compiler cannot resolve a cover-region endpoint. Untouched
base connections retain their ownership. Validate all endpoints after the batch.

## Clearance and checks

Compilation validates frames/radii/ownership, not a whole aperture's walkability.
Do not call a centre-only clearance check proof that the entire opening is free.
Use the existing crossing coordinator for centre-route probes and label such
evidence as centre-route only. Destination clearance is still checked for each
actual crossing; blocked/off-centre exits must refuse safely.

Acceptance: create E3/S3 pair, traverse both ways using the actual movement API,
undo/redo and file round-trip; reject duplicate/occupied endpoints, radius/frame
mismatch, invalid charts, capacity and unsafe current/spawn placement atomically.
Test a two-pair swap, base-to-envelope migration, and obstructed destination.
UI must state the one-sided entering direction and distinguish an image from a
nearby physical endpoint. Preserve the existing portal guide and refusal display.

Separate follow-ups: removing pairs/anchors and visual endpoint manipulation.
No generic deletion that leaves dangling connections; no new geometry required.
