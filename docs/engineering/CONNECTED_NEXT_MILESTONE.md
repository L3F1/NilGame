# Direction checkpoint — 2026-09-11

The project is on track as a connected-geometry kernel plus editor. The playable
E3/complete-S3/E3 preview now exercises movement, transported cameras, collision,
portal traversal and GPU sight together. It is not yet the authored connected
level milestone: global-cover documents and the existing bounded editor remain
separate. Avoid making polished test fixtures a substitute for that integration.

## Finish the current vertical slice

Progress: existing-entity properties, paired radii, undo/redo and JSON file
round-trip now run in the complete connected preview (CONNECTED_EDITING.md).
Next extend that transaction path to creation/removal and portal reconnection;
the current form alone cannot build an entirely new level.

1. Keep contact recovery and ray uncertainty honest. Display sampling may improve
   edges, but must not broaden collision/ray tolerances or turn unresolved rays
   into certified misses. Preserve a cheap centre-ray diagnostic path.
2. Load the connected fixture through an editor transaction model: select a
   region, edit supported balls and anchors, recompile affected runtime data,
   undo/redo and save/reload. Reuse existing editor transactions and codecs.
   Explicitly refuse edits that strand the player or invalidate suspended motion;
   do not silently relocate the player or deform an object on geometry changes.
3. Exercise an edited E3/S3/E3 route through both portals after reload. Include
   an invalid aperture pairing, blocked destination and capacity refusal in the
   authoring checks. Make these visible errors rather than partial scenes.

## Then test the adapter boundary

Add bounded H3 metric balls first, reusing the existing hyperboloid mathematics.
Before implementation, specify coverage, distance/ray guarantees, construction
frames, transported movement and GPU numerical limits. Adapt existing portal
anchor-frame mapping; do not invent geometry-specific teleport control flow.
Require CPU independent identities, rendered parity and a saved E3/H3/E3 route.

The current GPU packer supports a deliberately narrow E3/S3 subset. Its kind
branches are not a generic geometry plug-in system. When H3 arrives, every dispatch
must reject unimplemented kinds explicitly; never let an unknown kind take an
existing flat-or-spherical branch. Share capability metadata across editor and
compiler when a third adapter makes that distinction necessary, rather than add
an unused abstraction now. Nil/Sol follow with explicit constructions and bounded
numerical geodesic queries; they are not simple shader tags.

Godot remains a possible host for editor/asset services after this slice. Moving
hosts does not provide curved geodesics, collision or mixed-geometry portal rays.
Current work should preserve host-free modules and serialized contracts; no host
migration or general physics system is needed to finish the slice above.
