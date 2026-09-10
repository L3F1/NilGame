# Muse task queue

Only OPEN work lives here. Closed assignments and their verdicts moved to
[docs/qa/muse-log.md](docs/qa/muse-log.md) — read that only when you need to
know why a past decision went the way it did. Shared rules: MUSE.md and
docs/engineering/WORKING_RULES.md.

## Start every session with these two commands

```sh
node tools/host-probe.js       # what THIS machine can do
node tools/test.js             # the baseline you are working from
```

`host-probe` replaces environment diagnosis. It reports platform, whether each
of its own tools actually works, sockets by family, whether Chrome starts here
and why not, whether a check-queue worker is serving, and a one-line verdict on
how you get browser checks. **Paste its output into your report and do not
investigate the environment further.** Three separate sessions have rediscovered
the same block, one of them recorded the wrong reason, and that wrong reason
then shaped a queue of work for weeks.

If the verdict says browser checks go through the queue, use
`node tools/check-queue.js <check> [flags]` and ask the user to run
`node tools/check-queue.js --serve` if no worker is up. **Do not try to start a
browser yourself.** That question is settled: the sandbox denies AF_UNIX
(Chrome's socketpair) and AF_VSOCK (WSL interop), and no flag reaches either.

## How a task is accepted, so nobody has to negotiate it

Three rules, and they exist because the batches that followed them went
straight through review while the ones that did not cost a round trip.

1. **Ship a check that fails without your change.** Then acceptance is one
   command instead of a conversation. Demonstrate the failure: break the thing
   in your own working copy, paste the failing output, restore, paste the
   passing output. A check that cannot fail is not a check, and "I verified it"
   is not evidence.
2. **Measure, never cite.** A number in a report must carry the command that
   produced it and the host it ran on. If you are repeating a number from a
   document, say so and say it is unverified. Fourteen false claims were found
   in one sweep and nearly all of them were numbers that had been true once.
3. **Report defects, do not fix them.** If a task forbids touching a file and
   the file is wrong, that is a finding and it is the deliverable. Two of the
   most valuable results so far were handed back unfixed.

## Where the line is between you and the lead

Not seniority — the shape of the problem.

- **Yours** if it can be stated as *"make this check exist, and make it fail
  without X"*: corpora, static analysis, sweeps, measurement, audits of claims
  against the tree, running things many times and tabulating.
- **The lead's** if the hard part is deciding what the answer should BE:
  contracts, formats, what a capability promises, what an error should say.

If a task looks like the second kind, stop and say so rather than guessing at
a design. That is a useful report, not a failure.

---

A NOTE ON THIS FILE, so it stops rotting. Everything above the `---` is
standing rules and outlives a batch. Everything below it belongs to the CURRENT
batch only -- the order line, the "what changed" note, and the open tasks --
and is replaced wholesale when the queue turns over. Three stale order lines
had accumulated before anyone noticed, each naming a different task as first.

Order: **MUSE-41 first, then MUSE-40.** 41 re-checks a repair that is blocking
Astra's review and the renderer work behind it; 40 is a question, and questions
keep. Both are Node-only and need no browser or worker. They are INDEPENDENT of
each other: a blocker in one does not stall the other, and 40 must not be folded
into 41 -- the bound collapse is its own investigation.

WHAT CHANGED UNDER THIS QUEUE, 2026-09-10 (second turn). Read before starting:

- **MUSE-36, 37 and 38 are accepted and moved to the log.** Verdicts and what
  the lead re-ran are in `docs/qa/muse-log.md`. Do not reopen them.
- **The region-motion coordinator landed.** `engine/world/region-motion.js`
  exposes `moveRegionProbe(world, state, dt, options)`, and `collision.js`
  `sweep`/`moveProbe` now take an event provider queried on each ACTUAL geodesic
  leg plus explicit time accounting. Your MUSE-38 bench already uses that
  provider as its measuring instrument, which is what it is for.
- **Your MUSE-38 result is the reason MUSE-40 exists.** The wall-0.35 route cost
  77x the flat control, two orders beyond the shortfall MUSE-34 predicted, and
  the steps went somewhere nobody has explained. That is a better question than
  the one that produced it.
- Baseline is 53 suites: `ray-degenerate`, `carve-predicate`, `s3-walk-cost` and
  `region-motion-truth` are yours and are in the tree.
- **Your finding 4 was accepted as a defect and has been repaired.** Astra
  amended the contract; a refused crossing now rolls back to a checkpoint
  strictly on the entering side instead of stopping on the aperture plane.
  Three of your checks pinned the old behaviour and were updated in place, with
  their old numbers preserved in comments beside them -- including the finding-4
  reproduction, which now runs five fresh frames and prints what it used to say.
  Nothing was weakened; read `docs/qa/claude-region-repair-2026-09-10.md` before
  starting MUSE-41.

## MUSE-40 - The S3 bound collapse: curvature cost, or a defect?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

Your MUSE-38 measured the wall-0.35 route at **2778 curved steps against 36
flat**, with 98.8% of steps stalling and 97% of them burned in OPEN HALLWAY
where the bound reports about 4e-4 and the flat control proves 0.1. That is a
250x under-report in open space, and it does not fit the story it is currently
filed under. MUSE-34 measured the cell bound's shortfall as a FRACTION -- 0.29
at an edge, 0.36-0.42 at a corner -- and found it identical at R = 2, 8 and
10000. A fractional shortfall that does not vary with curvature cannot produce
a 250x collapse that appears only in the curved room. One of those two results
is measuring something other than what it is labelled.

The question is which, and the answer changes what happens next. If it is the
bound doing what a bound does, the walker needs a different advance rule. If
`sphericalPrimitive`'s distance is simply wrong somewhere -- a seam, a face far
from its own centre, a `max` over planes that goes bad when the nearest face is
behind you -- then it is a field defect, the renderer marches against the same
function, and the walker is the messenger rather than the patient.

- Allowed writes: a new `s3-bound-truth.test.js`, a dated report under
  `docs/qa/`, `docs/qa/measurements.md`, this task's status and report. Do NOT
  edit anything under `engine/` or `app/`.
- **Evaluate the field directly, away from any walk.** Take the MUSE-38 room and
  sample `field.distance` on a grid through the open hallway. For each sample
  compute an INDEPENDENT true distance to the same authored solids -- great
  spheres through transported axes, membership in slab coordinates, the way
  MUSE-34's reference was built, so the function under test is never its own
  reference. Report the ratio bound/truth as a field, not as a walk statistic.
- **Find where the 4e-4 comes from.** Which primitive, which face, which term
  wins the `max` at the collapsing points, and is that term's own distance
  right? A single sample with the winning term named is worth more than a table.
- **Hold curvature fixed and vary one thing at a time.** Same room at R = 8 and
  R = 10000; then the same R with the wall moved so clearance is 0.35, 0.6 and
  1.1. MUSE-38 already shows the collapse is clearance-dependent (0.35 -> 77x,
  0.6 -> 1.18x); say whether it is ALSO curvature-dependent, which is the fact
  that separates the two explanations.
- **Say which it is, plainly.** "Conservative bound behaving conservatively" and
  "the distance function is wrong here" are different verdicts with different
  owners. If it is the second, a reproduction with the winning term named is the
  deliverable -- report it, do not fix it.
- Acceptance: the sampling reference described well enough to rebuild, the
  bound/truth ratio field, the named winning term at the collapse, the
  curvature-vs-clearance separation, and a one-line verdict.

## MUSE-41 - Does the refusal stay refused?

Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only

Your MUSE-39 found that a refused crossing left the walker standing exactly on
the aperture plane, where the one-sided test declines to look, so the next frame
carried them straight through a portal that had just said no. Astra accepted it,
amended the contract, and Claude repaired it: the final approach is now
provisional, and a refusal rolls back to a checkpoint the PORTAL ITSELF certifies
is on the entering side. Claude checked that with sixteen mutations, and all
sixteen are caught -- by the person who wrote the repair.

The repair also tightened two budget rules Astra called out: corrections now draw
on the same step allowance as travel, and a contact cap of `n` buys exactly `n`
contact responses rather than `n + 1`.

- Allowed writes: extend `region-motion-truth.test.js` (it is yours) or add a new
  `region-refusal-truth.test.js`, plus a dated report under `docs/qa/`. Do NOT
  edit anything under `engine/` or `app/`, and do not change checks you did not
  write.
- **Repeated refusals.** Many fresh frames against a blocked exit, in E3 and S3,
  at several speeds and `dt` values, upright/tilted/off-centre apertures, and at
  grazing incidence where the checkpoint sits micrometres from the plane. For
  every frame: source ownership, no crossing, and `portal.signedHeight` of the
  returned position strictly above the tolerance the crossing test uses. Go
  looking for ONE frame that lands on or past it.
- **Restored clearance.** Clear the obstruction and check the next frame crosses,
  from the state the refusal left. Then try it from a state several refusals
  deep. A repair that quietly arms something on refusal would show up here as a
  crossing that needs two frames instead of one.
- **Time refunds.** Only the DISCARDED travel may come back. First frame charges
  the approach it really made; later frames, already at the checkpoint, charge
  nothing. Audit `consumed + remaining == dt` every frame and check that a long
  run of refusals never accumulates time it did not spend -- or loses time it did.
- **Exact budget caps.** `maxSteps: n` must spend at most `n`, corrections
  included; `maxContacts: 0` must record zero responses while still reporting the
  contact it met as a diagnostic; `maxContacts: k` must buy exactly `k`. Sweep a
  range of caps against a scene that contacts, lifts, slides and settles, and
  report any cap where the spend exceeds it.
- **Work counters are not refunded.** A rolled-back approach still queried the
  field. Check that steps and contacts spent on a refused approach stay spent,
  and that a walker refusing every frame cannot use rollback to buy unbounded
  work inside one call.
- Fail-demo in an isolated copy, restore, then run `node region-motion.test.js`,
  `node region-motion-truth.test.js` and `node tools/test.js` and paste all three.
- Claude flagged one path as implemented but UNREACHABLE: the case where even the
  leg start cannot be certified on the entering side, which should return
  `unresolved` / `uncertifiable-checkpoint`. Try to construct a scene that
  reaches it. If you cannot, say what you tried -- that is a real result either
  way, and it is the kind of thing a corpus finds and an author never does.
- Acceptance: the repeated-refusal table, the restored-clearance result, the
  time audit, the budget sweep with any overrun named, and a verdict on the
  unreachable path.
