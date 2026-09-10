# Finishing a correction, as its own operation

Claude, 2026-09-10. Assignment: section 1 of
`docs/engineering/NEXT_CAPABILITIES.md`. Sections 2-4 not started.

Base c4d0aa2 plus Muse's uncommitted MUSE-44 sweep and Astra's uncommitted
decision document, both **preserved untouched**. Host LeoPC (win32), Node
v24.20.0. `node tools/host-probe.js`: browser checks run directly here; queue
worker pid 38432 accepts `--region-lab`, and every browser number below went
through it on a real RTX 5070 Ti / ANGLE D3D11.

## What the operation is

`resumeRegionCorrection(world, suspended, options)` in `region-motion.js`. One
`sweep` in the correction phase, from the endpoint the debt was left at, along
the direction the settle was already going, for the distance it still owed. Not
`moveRegionProbe` again with the refused frame's leftover time, and the residual
is never read as a velocity.

**Zero gameplay time.** `timeConsumed`, `timeRemaining` and every field of
`time` are 0. The unspent clock of the request that owed the debt was discarded
when it was reported and is not handed to this.

**A continuation, not a `pendingLift`.** A debt DESCRIBES something; it is not
authority to move a player. Anyone can write an object with those fields, and a
resume that accepted one would let a caller push a walker a chosen distance in
a chosen direction through a door marked "numerical repair". So the kernel
issues a frozen continuation alongside every debt it can finish — compiled
world by identity, region, exact endpoint, camera by identity, player radius,
and the residual as a distance plus a unit tangent at that endpoint — and
`resumeRegionCorrection` moves nobody without one it made itself.

That is a `WeakSet` and deliberately not a registry: it answers "did I issue
this?" and nothing else. No key, no lookup, no lifetime to manage, and a
continuation nobody holds is collected without being cleaned up. **A
continuation is spent by use**, which is also what makes it impossible to apply
one twice to two successive states.

**Endings.** A completed residual clears the debt. A real swept contact stops
it there and also clears it — that is a landing, and it is exactly what the
uninterrupted settle inside `moveProbe` does from the same point. A stalled
query keeps what is left of the residual, pointing where it now points, at the
new endpoint, with fresh authority. A degenerate contact or a non-finite
transport is `unresolved`, never completed. An aperture or chart edge is the
existing correction-phase refusal: nothing kept, debt unchanged, no new
authority, and the recovery is the host's. A recompile, a moved endpoint, a
changed radius or a spent continuation is `stale-continuation`, which changes
nothing at all.

## The host action

`Finish correction` is a separate button from `Resume as a new request`, and
`motionPause` now answers two questions instead of one:

- `resumable` — may **normal play** start again? Never while anything is owed.
- `finishable` — can the **debt itself** be discharged? Only with a continuation.

Pressing Finish replaces the suspended result with the returned one atomically.
A partial correction comes back still owed at its new endpoint, so pressing
again continues rather than restarting. Clearing the debt does **not** restart
play: clearing a debt and choosing to fly again are two decisions, and the
second is the author's. A scene edit clears the pause with the scene, because
an old floor's correction must never be applied to a new one.

## Evidence

| check | result |
|---|---|
| `node tools/test.js` | **62/62 suites**, exit 0 (61 before, plus `correction-resume`) |
| `node correction-resume.test.js` | 10/10 |
| `node motion-pause.test.js` | 9/9 |
| `node motion-pause-truth.test.js` (Muse's) | 5/5, unchanged by the new field |
| `node region-motion.test.js` | 46/46, unchanged |
| `node tools/check-queue.js page-check --region-lab` | **83 checks** (65 before) |
| `node tools/check-queue.js page-check --ball-lab` | 101 checks — the flat editor is untouched |
| `git diff --check` | clean |

**Every debt in every check is one the kernel really produced.** A walker
resting on the S3 floor drives at the far wall, is lifted clear so it can
slide, and an 8-step budget runs out before the settle: `1.33e-2` owed with
`1.28e-2` of free space under it. Nothing fabricates a `pendingLift`, because a
fabricated one is precisely what this operation has to refuse.

**Repeated partial resumes equal the whole**, which is the load-bearing claim:
one call that finishes the job against two one-step calls that grind through
the same residual end **0.00e+0 apart** — not within tolerance, the same point
— with forward, up and right agreeing to 1e-12, and the partial distances
summing to the whole.

**The aperture ending is real.** A hatch set flush in the floor between where
the walker rests and where the lift puts it: the resumed settle comes back down
through it and is refused, `4.49e-2` still owed, `corrected` exactly 0, camera
not even rebuilt.

### Mutation matrix, kernel

| mutation | fails |
|---|---|
| authenticity not checked | 2 |
| continuation not spent by use | 1 |
| world identity not checked | 1 |
| endpoint not checked | 1 |
| residual re-derived rather than carried | 1 |
| residual direction not transported | 1 |
| an aperture is crossed instead of refused | 1 |
| the refused frame's time is handed to the correction | 1 |

### Mutation matrix, host (through the queue, each applied and reverted)

| mutation | stopped by |
|---|---|
| the corrected state is not adopted | the walker moved by the residual, along it rather than by a velocity |
| clearing the debt restarts play by itself | play does not restart by itself, but is now offerable |
| resume offered while a correction is owed | and normal play is not offered while anything is owed |
| an edit leaves the debt pointing at the old floor | an edit recompiles the scene and clears the pause with it |
| the finish budget is ignored | repeated partial corrections converge on a cleared debt |
| the suspended result is not replaced | ONE press discharges the debt |
| Finish offered for a debt with no authority | an unfinishable debt hides Finish correction and leaves only a reset |

## What I got wrong, twice, and both were checks

**The first fixture was degenerate and the suite passed anyway.** I buried the
walker under the floor to produce a debt. It produces one — but the residual
then points into a surface the walker is already 0.35 deep in, so the resume
lands on contact after travelling **zero**, and every property worth checking
(carrying a residual, splitting the work, transporting the camera) was vacuous.
Ten checks, all green, proving almost nothing. The give-away was `corrected`
reading 0.00e+0 in a check that asserted the correction had moved someone. The
suite now uses a walker lifted clear with free space under it; the buried case
is kept as its own check, where the zero-distance completion is the point.

**"Never grows" is not "shrinks by what was walked".** The partial-resume loop
asserted the residual never increased. A mutation that made the residual never
change at all passed all ten checks — because the sweep meets the floor anyway,
so the whole and the pieces still agreed while the bookkeeping was broken. The
loop now asserts the residual equals `before - corrected` exactly, and that at
least one partial call really travelled, so the assertion is not vacuous.

**And a hunt that never ran.** Searching for a scene where the resumed
correction meets an aperture, I got zero hits across sixty configurations. The
scene id collided with an entity id, every compile threw, and the throw went
into a `catch { continue }`. The search reported "not reachable" without having
looked once. Fixed, and the ending was reachable on the first try afterwards.

## Findings — reported, not fixed

1. **A resumed correction cannot reach the chart edge, by construction.** A
   settle retraces the lift: back down the same normal, no further than the
   lift went. So the only things it can newly meet lie strictly between the
   lifted point and the contact it lifted off — and the walker was at both of
   those points, inside the domain at both, and a chart extent is a geodesic
   ball, which is convex. An aperture CAN sit in that gap; a chart edge cannot.
   `collision.js` keeps one `back.event` branch for both and is right to — an
   unreachable branch that refuses is the correct shape — but I have not
   written a check claiming to exercise the domain half, because it would be
   claiming something untrue. If you disagree with the convexity argument, that
   is the thing to push on.

2. **MUSE-44's `stepWalker` finding is still open and section 2 will meet it.**
   `stepWalker` drops `pendingLift` from its return shape although its inner
   `moveProbe` can owe one — latent today because the default budgets always
   pay, live the moment a walking slice runs on tighter ones. Out of this
   section's scope; in section 2's path.

3. **`corrected` and `continuation` are new fields on the motion result.** Any
   consumer that enumerates the result shape sees two more. Muse's
   `motion-pause-truth.test.js` was unaffected and reruns 5/5 here.

4. **Not measured:** an instrumented count of kernel calls per host action. I
   asserted the substance instead — one press discharges the debt at the
   default budget, a halted session issues no movement request at all, and the
   operation reports zero gameplay time — but there is no counter on
   `moveRegionProbe` and I did not add one.

5. Still open from before, untouched: renderer capacity caps,
   `objective`/`spawn` not drawn (section 4 now decides this),
   `connected-lab.nil.json` not compiling, nested-cutter conservatism.

## Next

Astra reviews this. Sections 2 (curved support) and 3 (connected rendering) are
not started, as instructed. MUSE-45 is queued: an independent audit of the
continuation's authority and of the resumed path itself.
