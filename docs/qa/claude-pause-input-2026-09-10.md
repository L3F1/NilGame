# The pause the contract asks for, and three checks that were lying

Claude, 2026-09-10. Assignment: "Follow-up for Claude" in
`docs/qa/astra-editor-input-2026-09-10.md`.

Base bb7c868 plus Astra's uncommitted doorway fix, `app/mouse-look.js`,
`editor-input-route.test.js` and Muse's clearance work, all **preserved
untouched**. Host LeoPC (win32), Node v24.20.0, queue worker pid 38432.
`node tools/host-probe.js`: browser checks run directly here; the queue worker
now accepts `--region-lab`, so everything below went through the queue.

## The defect, restated

`region-lab.advance` fed `result.state` into the next frame whatever came back.
For `complete` that is right. For a result carrying `pendingLift` it is the
thing REGION_MOTION_CONTRACT names outright — "do not silently drop debt or
feed only out.state back as if the move completed" — because the settle was
applied as a lift and never paid back, so the next frame flies on from a
position the solver had not finished putting the walker in. For `unresolved` it
replays a refusal every frame until one of them happens to land somewhere.

## What was built

**`app/motion-pause.js`** (new) — the decision, on its own, with no DOM in it,
so Node and the page test the same table. `motionPause(result)` returns `null`
to carry on or a frozen reason to stop. Two rules:

- **Any `pendingLift`, whatever the status.** A correction goes unpaid under an
  exhausted budget, under a refused crossing, and beside a clock that already
  reads zero. `resumable: false` — there is no correction-resume API to resume
  WITH, so the only sound exit is a reset to a validated spawn.
- **`unresolved`.** The competing gate IDs are named in the text, because the
  contract requires them shown and requires either gate to stay editable.
  `resumable: true`: steering, editing or an explicit retry is a NEW request,
  and the refused request's unspent time stays discarded.

**Deliberately not pauses**: `domain-exit`, `blocked-exit`, `stopped`, and a
`budget-exhausted` carrying no debt. Each leaves a fully settled state — the
contract's "budget exhaustion stays at the last validated state with remaining
time reported" — and the next frame asking again with a fresh budget is a new
request, not a replayed one. That discrimination is the load-bearing part: a
policy that pauses on every non-`complete` status makes the editor unusable and
a policy that reads only the clock misses the case the contract warns about.

**`app/region-lab.js`** — `advance` consults it, `halt()` stops the flight and
puts the refusal on the page, and a halted session issues no further request at
all until a control clears it. Recoveries: **Reset to region spawn** (always
offered, and what an owed correction gets) and **Resume as a new request**
(offered only for a tie, and it does NOT respawn and does not replay the
refused time). A scene edit or a fixture load clears the pause too, since the
document that stranded the player is no longer loaded.

**`tools/region-lab.html`** — the amber halt panel with those two buttons, and
the old "Reset view" renamed to what it does.

**Input lifecycle**, in both editors, dispatching real events at the real
listeners: no turn before the lock, none inside the 250 ms settle, a spike
dropped, a burst accumulated once and capped, nothing held back to arrive a
frame later, focus loss clearing keys and the pending turn together, a fresh
settle on re-acquisition, and an unlock stopping the flight. The S3 editor also
checks that its own frame loop drains the accumulator with no help from a check.

**One thing there is simulated and should be read as such.** Headless Chrome
will not grant pointer lock without a user gesture, so
`document.pointerLockElement` is shadowed for the duration of that block and
restored afterwards (a check asserts the restore). Every handler, the filter
and the frame loop are the real ones. **An operating system's mouse stream is
still covered by nothing**, so a hardware-specific snap would not appear here.

## Evidence

| check | result |
|---|---|
| `node tools/test.js` | **60/60 suites**, exit 0 (59 before, plus `motion-pause`) |
| `node motion-pause.test.js` | 9/9 |
| `node tools/check-queue.js page-check --region-lab` | **59 checks** (36 before), no page error, no boot panel |
| `node tools/check-queue.js page-check --ball-lab` | **101 checks** (90 before), no page error |
| `node tools/shader-check.js` | S3 region viewport compiled and linked |
| `node tools/scene-check.js levels/fixtures/s3-room.nil.json` | passed, 1 region, 9 entities |
| `git diff --check` | clean |

Every browser number above is the queue worker on LeoPC, real GPU (`ANGLE
(NVIDIA GeForce RTX 5070 Ti, Direct3D11)`), cold shader cache. The S3 run still
reports 0.63 ms/frame over 30 frames at 604x505 with 160 march steps, which is
the same probe as the previous report and not an input-latency measurement.

**The refusals are real.** No result in either suite is hand-built. The debt
case puts the player a tenth of a unit under the floor of the loaded fixture
and gives the real coordinator two steps: the lift is applied and the settle is
not affordable, so `pendingLift` comes back at 8.0e-4 with the clock still
holding 1.67e-2 s. The tie case is two apertures the kernel refuses to order.
The only constructed object in the whole change is one precedence case in the
Node suite, labelled where it sits.

### Mutation matrix, Node

| mutation | fails |
|---|---|
| pause never fires | 5 |
| debt judged by `timeRemaining === 0` | 3 |
| every status is a pause | 4 |
| a debt offered as resumable | 2 |
| status checked before the debt is | 1 |
| only the first competing gate named | 1 |

### Mutation matrix, browser

Each was applied to the tree, run through the queue, and reverted. The column
is the check that stopped the run — position numbers are deliberately not
quoted, because several of these were run before the last check was inserted
and the ordinals shifted under them.

**S3 editor** (`--region-lab`):

| mutation | stopped by |
|---|---|
| `advance` feeds `result.state` on regardless (**the reported defect**) | and the host stops flying rather than spending the debt |
| halt reports but does not stop play | and the host stops flying rather than spending the debt |
| a halted session keeps issuing requests | a halted session issues no further movement request |
| resume offered for an owed correction | and an owed correction is not offered a resume |
| reset leaves the pause on screen | reset returns the player to the validated spawn and clears the pause |
| resume respawns instead of continuing | and resuming neither respawns the player nor replays the refused time |
| no lock settle window | and a move inside the lock settle window is discarded too |
| turns without a pointer lock | a move with no pointer lock is refused even while the filter is armed |
| no spike rejection | a pointer-lock spike is dropped rather than applied |
| accumulator not cleared on drain | a pointer-lock spike is dropped rather than applied |
| no per-frame cap | a burst is accumulated once and capped inside the frame |
| the frame loop never drains | the frame loop drains the accumulator itself, and a still frame does not |
| an unlock leaves the flight running | releasing the pointer lock stops the flight |

**Flat editor** (`--ball-lab`):

| mutation | stopped by |
|---|---|
| no lock settle window | and a move inside the lock settle window is discarded too |
| turns without a pointer lock | a move with no pointer lock is refused even while the filter is armed |
| no spike rejection | a pointer-lock spike is dropped rather than applied |
| accumulator not cleared on drain | a pointer-lock spike is dropped rather than applied |
| no per-frame cap | A BURST IS CAPPED INSIDE ONE FRAME |
| blur does not clear the pending turn | losing focus clears the keys and the pending turn together |

Two mutations are caught by the spike check rather than by the check named for
them — "accumulator not cleared" leaves the previous frame's wish in place, so
the spike frame re-applies it and the spike check trips first. Caught either
way, but the credit belongs to the earlier check and not the later one.

## Three of my own checks passed while lying, and how

Worth more than the feature. All three were caught by mutation, not by reading.

**A burst that wrapped.** "A burst is capped inside the frame" measured the
angle between the before and after forward vectors and required it in
`(0.5, 0.6]`. With the cap deleted, a hundred moves of 60 is twelve radians of
raw yaw — and an angle between two vectors WRAPS, so twelve radians reads as
**0.5664**, inside the band, and the check passed. Fixed by using twenty-five
moves: three radians of raw wish, deliberately under pi, where an uncapped turn
cannot be mistaken for a capped one.

**A guard clause that nothing reached.** "A mouse move outside the pointer lock
turns nothing" ran right after `startPlay`, which leaves the filter INACTIVE
anyway — so it passed whether the handler's lock guard existed or not, and
deleting the guard from either editor changed nothing. Fixed by dropping the
lock without firing the change event, which is the only state where the guard
is the thing doing the work; there is now a separate check for each.

**Two confounds in the pause block.** "A halted session issues no further
request" could not fail, because `halt` clears the keys and the second frame
had a zero wish either way; it now restores the key and asserts `motion` is the
same OBJECT, which says no request was issued rather than that one looked
static. And "the frame loop drains the accumulator" compared camera identity —
but the carry rebuilds the frame every tick, so `state.camera` is a new object
whether anything turned or not, and the check survived deleting `applyLook`
from the loop entirely. It now measures a still frame as a control and requires
the still frame to move the numbers by less than 1e-9 and the moved frame by
more than 1e-3.

The pattern in all three: the assertion was about a quantity that changes for
reasons other than the thing under test.

## Image inspected

`page-check-shot-s3-after-input-lifecycle.png`, taken after the whole block and
a reset: the room from the spawn with a level horizon, the checkered floor
widening into the distance, the enlarged ball still carrying the radius edit
through undo/redo and a JSON round trip, the carved doorway standing open onto
what is behind it, and the chart edge as a red band across the top. Level and
centred is the point — the roll from the earlier block is gone because the
reset went back to a validated spawn.

## Findings for Astra — reported, not fixed

1. **`stop()` clearing the keys hides a class of defect from any check that
   asserts "nothing moved" after a refusal.** It is right for a host and it
   made one of my own checks unfalsifiable for an afternoon. Anything asserting
   an absence of motion after a pause should assert on the REQUEST, not on the
   position.

2. **`motionPause` is host policy, not kernel, and it lives in `app/`.** If a
   second host appears it should import this module rather than re-deriving the
   table; if the kernel ever grows a correction-resume API, `resumable: false`
   for debt is the line that has to change and nothing else does.

3. **Still open from before, none touched**: renderer capacity caps (16
   primitives / 72 planes against the WebGL2 224-uniform-vector guarantee),
   `objective` and `spawn` entities not drawn, `connected-lab.nil.json` still
   not compiling, nested-cutter conservatism (MUSE-37).

4. **The user's snapping report is still unconfirmed either way.** The shared
   filter is now covered end to end in both editors, and the ball lab's yaw axis
   was fixed earlier — but nothing here touches a physical high-DPI mouse or an
   OS event stream, so if the snap persists it is a fresh reproduction with the
   fixture, the gravity state and whether it follows lock acquisition.

## Next

Astra reviews this. Not started and not queued: curved gravity and a support
policy, cross-region rendering, marker rendering for non-solid entities, and a
correction-resume API — which is the only thing that would make an owed
correction recoverable without a reset.
