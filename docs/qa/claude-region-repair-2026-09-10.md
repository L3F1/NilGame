# Region motion repair: a refusal that stays on the entering side

Claude, 2026-09-10. Assignment: the "Claude follow-up: bounded repair, then
stop" section of `docs/qa/astra-region-review-2026-09-10.md`, against the
finding-4 amendment and the strict-budget clauses in
`docs/engineering/REGION_MOTION_CONTRACT.md`.

Base: e3300e6, plus Astra's uncommitted review and contract amendment, which are
untouched by this work. Host: LeoPC (win32), Node v24.20.0. No browser check:
this repair adds no shader, renderer or UI path.

## What changed, and why each piece is where it is

**`engine/world/region-portal.js`** — `PORTAL_PLANE_TOLERANCE` (1e-9, exported)
and `portal.signedHeight(p)`, the PHYSICAL signed distance to the aperture
plane: the plane offset in E3, `R·asin(p·n)` on S3. `crossing` now uses both, so
the coordinator certifies a checkpoint against the same number the crossing test
used. The S3 test previously compared `R·(p·n)`, which agrees with the physical
height only near the plane — which is the one place a tolerance must not be
approximated.

**`engine/world/collision.js`** — `sweep` hands back a `checkpoint` for the leg
an event stopped it on: where the leg started, its unit tangent, how far along
it the event sits, and the transport composed strictly *before* it. That is what
makes rollback arithmetic on one already-validated geodesic instead of a second
attempt at the move. Replaying with a shortened `dt` was explicitly rejected:
a shorter move is free to meet a different surface and lift by a different
amount, so it can end somewhere the first run never went.

Corrections that reach an aperture are now discarded **whole** — the lift or
settle is not committed at all, so the probe stays at the contact it was
correcting from, which is the pre-leg checkpoint the contract asks for. The
aperture it would have reached is reported as the event's attempted point.

Budgets are strict. Lift takes `min(8, maxSteps − steps)`, settle
`min(16, maxSteps − steps)`, and both are skipped outright when nothing is left;
a settle that cannot be paid is reported as `pendingLift` rather than borrowed
against a budget that does not exist. Contact responses are counted directly
rather than by loop iterations, so `maxContacts: n` buys exactly `n` responses —
the old `bounce <= maxContacts` bound permitted `n + 1`. A contact met but not
answered is reported as `limitingContact`, apart from the `contacts` /
`contactSamples` response list.

**`engine/world/region-motion.js`** — `rewind` rebuilds the state anywhere on the
event leg; `certifiedCheckpoint` picks one skin before the crossing, falls back
to the leg start that qualified the crossing, and returns nothing if neither can
be certified strictly on the entering side — in which case the leg is not
committed at all and the result is `unresolved` / `uncertifiable-checkpoint`.
Nothing is nudged backwards along a guessed normal; every candidate lies on the
leg the probe actually travelled.

The same checkpoint holds a portal stopped by the crossing budget. A tie returns
to the pre-leg checkpoint. Work counters commit unconditionally — a rolled-back
approach still asked the field real questions, and pretending otherwise is how a
bounded call becomes unbounded by refusing often enough. Only discarded travel
time is refunded. Events now carry `at` (aimed at) and `stoppedAt` (ended at)
separately.

## Evidence

`node region-motion.test.js`: **46/46**, exit 0 (34 before).
`node region-motion-truth.test.js`: **21/21**, exit 0.
`node tools/test.js`: **53/53 suites**, exit 0.
Focused: `collision` 22/22, `curved-collision` 12/12, `motion-carry` 2/2,
`camera-frame` 9/9, `cross-region-frame` 6/6, `portal` 24/24,
`walk-bound` 13/13 over 20800 steps. `git diff --check` clean.

### Finding 4, before and after

Free-standing gate pair, occupied destination, dt = 1, speed 4:

| | before | after |
|---|---|---|
| frame 1 | `blocked-exit` at y = 2.000000 | `blocked-exit` at y = 1.999900 |
| frame 1 time consumed | 0.500000 | 0.499975 |
| frame 2 | `crossings = 0`, y = **6.000000** | `blocked-exit`, y = 1.999900 |
| frame 2 time consumed | 1.000000 | 0.000000 |
| frames 3–12 | — | identical to frame 2 |

The signed height at the checkpoint is +1e-4, comfortably outside the 1e-9
on-plane tolerance. Retreat from the checkpoint works (y → 0.9999 in 0.25 s),
lateral departure works (x → 1.0), and removing the plug lets the *very next*
frame cross into the destination region — no cooldown was armed, because the
portal is refused for the state of its far side and not for having refused
before.

Grazing was checked in both metrics, since a shallow approach is where a
backwards nudge lands on the wrong side: at 0.02 incidence in E3 the checkpoint
sits at 2.0e-6 of physical height, and an S3 approach built from the aperture's
own normal lands at 9.95e-6. Both certified, both strictly on the entering side.

### Fail-before / pass-after

Sixteen mutations, each disabling one mechanism in the working copy, run against
both corpora, then restored. **All sixteen are caught.** The eight from the
original implementation still are (M1–M8 in
`docs/qa/claude-region-motion-2026-09-10.md`); M3 and M8 needed re-anchoring
after the restructure, and M3 needed a new check — see below. The eight for this
repair:

| # | mutation | region-motion | region-motion-truth |
|---|---|---|---|
| R1 | checkpoint chosen ON the plane, certification still on | 37/46 | 19/21 |
| R2 | on the plane AND no side certification (the pre-repair state) | 34/46 | 19/21 |
| R3 | rollback refunds all the travel, not just the discarded part | 41/46 | 19/21 |
| R4 | work counters undone on rollback | 44/46 | 21/21 |
| R5 | a correction that reaches an aperture is committed anyway | 44/46 | 21/21 |
| R6 | the settle gets its own fixed step allowance again | 44/46 | 21/21 |
| R7 | one contact response more than the cap allows | 43/46 | 20/21 |
| R8 | rollback keeps the camera from the abandoned aperture | 41/46 | 20/21 |

R1 is worth reading twice: choosing the checkpoint on the plane while leaving
the certification in place does **not** reproduce the old bug — the certification
rejects the on-plane candidate and falls back to the leg start. It takes R2,
removing the certification as well, to put the walker back on the plane. That is
the certification doing its job rather than decorating a value that was already
right.

Two checks in this suite exist only because the matrix found them missing:

- `an event yields BEFORE the settle, so the debt is still outstanding` — M3 was
  passing everywhere, because on a *refused* crossing `pendingLift` is rebuilt
  from the checkpoint and so cannot see whether the settle ran. It takes a
  non-rollback stop — a chart edge reached with a lift outstanding — to observe
  the ordering.
- `the step cap is exact, and an unpayable settle is reported not borrowed` — R6
  needed a budget large enough to reach the settle at all (12 or more); at
  smaller caps the loop stops before a lift is ever owed.

### Tests updated rather than worked around

Six checks pinned behaviour the amendment supersedes. None had its tolerance
weakened and none was deleted; each now asserts the repaired behaviour, and the
superseded numbers are preserved in a comment next to it.

In `region-motion.test.js`: the occupied-destination and offset-obstruction
refusals (y = 2 → 2 − skin, with the aimed-at point asserted separately); the
tie (held at the aperture → returned to the pre-leg checkpoint, zero time
consumed); the lift-into-aperture case (`pendingLift` present → **absent**,
because none of the lift is kept now); the zero-contacts case (rewritten around
`limitingContact`); and the step cap (`<= 6 + 16` → `<= 6`).

In `region-motion-truth.test.js` (Muse's, edited under item 4 of the follow-up):
`blocked exit II`, the tie, and the finding-4 reproduction. The last is now
`finding 4 repaired: a refusal stays on the entering side, frame after frame`,
runs five fresh frames, and prints
`repaired -- 5 fresh frames all held at y=1.999900, was y=2.000000 then y=6.000000`
so the evidence for the repair travels with the check that replaced it.

## Notes for Astra

1. **`maxContacts: 0` now permits detection but no response**, which is what the
   amendment asks for. The probe stops with `status: 'budget-exhausted'`,
   `detail: 'contacts'`, an empty `contactSamples`, and `limitingContact` naming
   the surface and its normal. `maxContacts: 4` now buys 4 responses where it
   previously bought 5; nothing in the tree depended on the fifth.

2. **`uncertifiable-checkpoint` is defensive and currently unreachable** through
   `crossing`, which already refuses to report an event from a point whose height
   is inside the tolerance — so the leg start always certifies. It is implemented
   and returns `unresolved` without committing the leg, but it has no positive
   test because I could not construct a scene that reaches it. Flagging rather
   than claiming coverage.

3. **A refused approach consumes real steps and keeps them.** In a scene with
   nothing to march past the approach costs zero steps, so a repeatedly-refusing
   walker spends nothing per frame; in a scene with solids it spends what the
   marching actually cost. Both are honest; the second is what the check
   `a refusal keeps the work it spent` pins.

4. Findings 1 and 2 from the original report are untouched and still open:
   `levels/fixtures/connected-lab.nil.json` does not compile, and
   `app/region-lab.js` imports `stepRegionPlayer`, `turnRegionPlayer` and
   `engine/geometry/region-renderer.js`, none of which exist. Correcting refusal
   does not make a playable or visually validated connected room, as the review
   says.

## Next

Independent re-check by Muse is queued as **MUSE-41** — repeated refusals,
restored destination clearance, time refunds and exact budget caps, test and
report only. MUSE-40 is untouched and stays independent. Astra reviews this
repair before any renderer or editor integration.
