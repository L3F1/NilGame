# Connected-world editing increment

The complete E3/S3 preview now exposes a transactional property editor over its
existing nil-connected-cover document. It reuses the compile-before-install
pattern of region-lab; no new scene format or geometry conversion is introduced.

`patchConnectedEntities(document, [{id,patch},...])` produces detached author
data. Allowed properties: ball position/radius, anchor position/radius/forward/up,
spawn position. IDs, kinds, region ownership and chart IDs cannot be patched.
Duplicate entries are refused. Paired aperture radii must change together in one
batch; the existing portal compiler enforces matching endpoints.

Preview model API: document(), editEntities(), loadDocument(), undoEdit(),
redoEdit(), addBall(), removeBall(), addPortalPair(), reconnectPortals(), removePortalPair(),
canUndo/canRedo. Compile the whole candidate, compare physical region
descriptors and body radius, certify the current body and all saved spawns, and
rebind the existing camera axes to the new adapter at the SAME point. Reference
up and velocity are preserved; recompilation is neither transport nor a reset.
Never use the construction frame to replace the carried camera.

Metric/coverage/region-set changes and player-radius changes need an explicit
world-opening policy and are refused here. Uncertifiable clearance, a new aperture
through the current player centre, or halted movement also refuse the transaction.
Clearance refusal is not proof of geometric overlap for conservative fields.
Reset first if movement is halted; editing cannot erase pending correction debt.

Only after CPU validation does installWorld(nextWorld) run. Its host implementation
must install atomically or throw. The connected renderer's replaceWorld validates
the GPU subset/capacities, prepares a new texture, then swaps it and its packet.
Upload failure restores prior bindings/uniforms; context loss still requires host
recovery. Shader/program compilation is unchanged. Old textures and old timing
queries are released. The world getter and renderer.packed getter then reflect
the committed candidate. No callback is invoked for initial creation/no-op edits.

History advances only after successful installation. Normal edits/loads are
undoable, discard redo only on success, and retain at most64 previous documents.
Undo/redo themselves validate before consuming an entry. Saved JSON contains all
regions, charts, endpoints and connections; player pose/history are session state.

UI coordinates are physical author coordinates in the selected region/chart,
not ambient S3 four-vectors. Ball creation requires an explicit chart selection
for a cover region; bounded regions omit chartId. New IDs cannot collide with
any region, chart, entity or connection ID. The UI suggests a fresh ID but the
model never silently renames one. Position must be supplied, not guessed from
the player's location. The chosen chart changes placement, not the geometry.

Removal supports additive balls only. Spawns, anchors, modifiers and solids
referenced by a modifier are protected. Both operations use the same transaction
and history, including GPU capacity and player/spawn clearance refusals. Undo can
restore a removed ball only if it is still safe at the current player position.
Imported documents can replace supported entity sets through this same validation.
New portal pairs/reconnection now have browser forms; see CONNECTED_PORTAL_AUTHORING.md.
Both endpoints need explicit coordinates and orthonormal forward/up components.
Apply all changed reconnect rows together when swapping endpoints. The
portal removal API deletes a saved pair and its two anchors, not draft row choices;
its browser controls name both saved endpoints. Existing-anchor orientation fields
edit only that anchor's forward/up vectors, preserving its partner and the player.
Global surfaces/cells, new charts and visual manipulation remain follow-up work.
