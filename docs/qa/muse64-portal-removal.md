# MUSE-64 portal removal / reorientation truth

Independent Node-only checks against real model APIs (`removePortalPair`,
`editEntities`, `reconnectPortals`, `undoEdit`, `act`, `advance`) on the
`connected-global.nil.json` fixture. Does not repeat the lead corpus
(`portal-removal.test.js`, still green); no source touched, no commits.

## Results (`node portal-removal-truth.test.js`: 6/6 pass)

1. Swap-then-remove deletes SAVED endpoints (`flat-entry`/`sphere-exit`),
   retains `sphere-entry`, leaves `leave-sphere` as sphere-entry→flat-return.
2. Base-owned link migrates to the envelope on reconnect, then removes from
   actual owners (base anchors gone, cover anchors kept); undo restores it.
3. Undo after 8 forwards refuses (`player on a portal aperture`), state
   identity and `canUndo` retained; stepping back lets undo restore 4 portals.
4. `domain-exit` halt (63 advances after yaw π) refuses removal and edits
   (`Reset the halted movement`), state frozen, history kept; reset recovers.
5. Cover reframe after transport (sphere pose ≈[0,0,0,1]): `sphere-exit` →
   forward [1,0,0]/up [0,1,0] changes saved construction frame and world
   normal ([0,0,0,-1]→[0,0,1,0]); partner `flat-return` and transported
   camera byte-identical. Construction forward/up are author vectors, never
   the player camera frame.
6. Isolated invalid graph (in-memory clone): shared endpoint refuses
   (`referenced elsewhere`), input byte-identical, fixture untouched.

## Defects / limits

No defects found; nothing repaired. Note: the shared-endpoint graph is also
rejected at compile (`Unknown or already connected anchor`) — defense in
depth, reported not changed. The near-entry pose check uses 1e-3 tolerance;
the roughly 5e-5 displacement is consistent with the explicit exit offset in
unit-sphere coordinates, not evidence of integration drift. Browser checks unavailable here
(host-probe: no worker serving); no browser/queue/full-suite run.

READY FOR REVIEW — `node portal-removal-truth.test.js` 6/6 pass;
`node portal-removal.test.js` still passes; engine untouched.

Lead review: accepted after source review and focused rerun. Added explicit
expected normals [0,0,0,-1] and [0,0,1,0] to the cover-reframe check; the original
only tested inequality despite naming the expected values in this report.
