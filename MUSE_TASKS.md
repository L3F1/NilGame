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

Order: **MUSE-40 is the only open task.** It is Node-only and needs no browser
or worker. MUSE-39 sits below it as DELIVERED, waiting on Astra rather than on
you -- do not re-run it or extend it.

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

## MUSE-39 - Region motion: is the clock honest and the crossing atomic?

Status: DELIVERED 2026-09-10, awaiting Astra | Owner: Muse | Reviewer: Astra | Node-only

Delivered: `region-motion-truth.test.js` (21 checks) and
`docs/qa/region-motion-truth-2026-09-10.md`. Finding 4 CONFIRMED. Opus
re-reproduced it independently (y = 2.000000 refused on the plane, then
y = 6.000000 with `crossings = 0`) and ran the region-motion mutation matrix
against this corpus: it catches 6 of 8, missing the settle-before-event-yield
ordering and path-versus-endpoint carry, both of which `region-motion.test.js`
covers. The two corpora are COMPLEMENTARY; neither alone covers the contract,
and that is worth knowing before either is trusted on its own. Acceptance and
the finding-4 policy call are Astra's. The original assignment follows.

`engine/world/region-motion.js` now exists: `moveRegionProbe(world, state, dt,
options)` owns which region a walker is in, how much of the frame's time is
left, and whether a portal crossing is allowed to commit. It was written by
Claude against `docs/engineering/REGION_MOTION_CONTRACT.md` and checked by
`region-motion.test.js` (34 checks) plus an eight-way mutation matrix -- all of
it by the person who wrote the code. Evidence and open findings:
`docs/qa/claude-region-motion-2026-09-10.md`. Read the contract and the public
API. **Do not read the implementation for your reference** -- derive it.

- Allowed writes: a new `region-motion-truth.test.js` and a dated report under
  `docs/qa/`. Do NOT edit anything under `engine/` or `app/`, and do not change
  any existing check.
- **Write an independent analytic reference for free flight and time.** For a
  straight run at constant speed with no contact, the position after `dt` and
  the arclength travelled are closed forms in both E3 and S3; a crossing costs
  no time, so source arc + destination arc must equal `speed * dt` up to the
  exit offset. Say what your reference is and how you derived it.
- Cases worth having, at minimum: off-centre and tilted round trips; R = 0.5, 8
  and 100; two S3 regions with DIFFERENT radii and the same-dimension trap that
  goes with it; collision strictly before portal; blocked exits; a crossing that
  lands exactly on the frame end; a legitimate return crossing; tied events;
  and every budget exhausted.
- **The clock is the thing to attack.** For every result, check
  `timeConsumed + timeRemaining == dt`, and separately that `time.travel`,
  `time.rest` and the zero-time corrections add up to what actually happened.
  Rest time is not travel time. A correction is not either. Look specifically
  for a path where time is consumed twice or refunded once.
- **Check ownership and immutability on a FAILED commit.** After a refused
  crossing the input state must be untouched, the returned state must still be
  the source region, and no destination position, velocity or camera may appear
  anywhere in the result. Try to find one that leaks.
- Fail-demo: break one mechanism in an ISOLATED copy of the tree, show your
  corpus catching it, restore, show it green. Then run
  `node region-motion.test.js` and `node tools/test.js` and paste both.
- Finding 4 in Claude's report says a refused crossing leaves the walker exactly
  on the aperture plane, where the one-sided rule then declines to test it, so
  they can walk through the plane into source space. **Confirm or refute that,
  with a check.** It is a policy question for Astra either way -- report it, do
  not fix it.
- Acceptance: the reference described well enough to rebuild, the case table,
  the time-accounting audit, a verdict on finding 4, and any disagreement with
  the contract stated as a reproduction rather than a redesign.

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
