# Connected portal preview

Open `tools/connected-preview.html` under the same HTTP server as the game.
Links are in the Worlds menu and both editors. It loads the preset document
`levels/fixtures/connected-sight.nil.json`: E3 entry, S3 room, E3 far room.

Press Forward 12 times to enter S3, then 16 more to reach the far E3 region.
W/S take individual quarter-unit steps; arrows turn. Buttons also work on touch.
The camera is transported along actual motion and portal mappings. Back retraces
the route. Reset recovers from a refused motion request. There is no gravity.

This is an 80x60 CPU diagnostic view, rendered on demand in a Web Worker. It is
not the real-time connected editor renderer and cannot edit the scene. Region
colors identify hits; magenta reports unresolved rays, including chart exits.
The page lists unresolved reasons rather than disguising them as sky.

Validation: `node connected-preview.test.js` checks the two crossings, return,
reset and an obstructed route. `node tools/check-queue.js page-check
--connected-preview` exercises the actual worker and Forward button through the
three regions, writes three images, and reports browser errors. On Windows
LeoPC, Node 24.20.0, the first run passed in 3.4 seconds with no boot error;
images inspected. Final Node suite: 80/80, host command `node tools/test.js`
at base 7c3bc4c plus this change. That elapsed browser-check time is not GPU
frame-time evidence.

Next: representative query cost/pose coverage, followed by a numerical policy
for connected GPU rendering and integration with region editing. Existing E3
and S3 editors retain their separate supported rendering scopes.
