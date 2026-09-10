# Refusal re-check after the region-motion repair (MUSE-41)

Muse, 2026-09-10. Corpus: `region-refusal-truth.test.js` — 8 checks, green.
Allowed reads only (contract + amendment, public API, repair report); the
implementation is unread here. `PORTAL_PLANE_TOLERANCE` and
`portal.signedHeight` are used as the contract's own judge.

## Repeated-refusal table

E3 occupied exit, 12 fresh frames per combo, gate at y = 2.0:

speed 2 dt 1.5/2, speed 4 dt 0.5/1/2, speed 8 dt 0.5/1 — all held at
y = 1.9999000 (one skin back), `blocked-exit`, 0 crossings, height above
tolerance, clock balanced. S3 (R = 2): 12 refused, heights 1.00e-4 stable.
Tilted 30° + off-centre: 12 refused. Graze at 0.02 rad: 12 held at height
2.00e-6 — micrometres out, above 1e-9, corroborating the repair's number
from independent geometry. No frame on or past the plane in 100+ refusals.

## Restored clearance

Plug removed: the very next frame crosses, from 1 refusal deep and from 5
deep. No cooldown armed.

## Time audit

Frame 1 charges exactly the approach ((2 - 1e-4)/s); frames 2..12 charge
exactly 0 (travel 0 included); the 12-frame sum equals the one real
approach (0.499975 s at speed 4). `consumed + remaining == dt` and
`travel + rest == consumed` on every frame. Neither accumulates nor loses.

## Budget sweep (floor + wall scene, uncapped 37 steps / 2 contacts)

maxSteps 4/8/12: `budget-exhausted`, spend <= cap, time retained.
maxContacts 0: zero responses + `limitingContact` naming the floor;
1: exactly one response + `limitingContact` naming the wall;
2: both responses, ends stopped. No overrun anywhere.

## Work counters

Refusal approach flanked by march-solids: frame 1 reports its 6 marched
steps (kept, not zeroed by the rollback); every frame's spend bounded by
the step budget. No per-call blowup.

## Unreachable path: verdict

(a) Authored on-plane / inside-tolerance starts raise no event and walk
through — crossing() guards the branch. (b) A staged portal forcing the
event reaches it: `unresolved` / `uncertifiable-checkpoint`, leg
uncommitted, clock balanced — characterises the fallback, does not refute
the flag (it bypasses the guarding rule). (c) Inside-tolerance starts raise
no events however many gates share the plane. Flag stands; fallback sound.

## Fail-demo and runs

Tolerance widened 1e-9 → 1e-2 in an isolated worktree: 4 checks fail (E3
absolute checkpoint pin, S3 charge, graze micrometre pin, frame-1 refund
pin). Worktree removed; real tree green:

`node region-motion.test.js` → `46/46 region motion checks passed`
`node region-motion-truth.test.js` → `21 checks passed, 0 failed`
`node region-refusal-truth.test.js` → `8 checks passed, 0 failed`
`node tools/test.js` → `54/54 suites passed`, exit 0
(WSL node v22.23.2 @ 4e9dbc9). Status: READY FOR REVIEW.

Note: one full-suite run during this session read 52/53 with no FAIL line
captured; two reruns before and one after read 53/53 (then 54/54). Single
unreproduced occurrence in four runs — recorded as a flake watch, not a
result.
