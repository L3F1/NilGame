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

Order: **MUSE-36 first** -- it checks a change the lead made to load-bearing
code on the lead's own judgement, which is exactly the kind of change that
should not be checked only by the person who made it. Then 37, then 38. All
three are Node-only; none needs a browser or a worker.

WHAT CHANGED UNDER THIS QUEUE, 2026-09-10. Read before starting:

- **An analytic cast no longer refuses over an ambiguity behind it.**
  `engine/geometry/e3-ray-intervals.js`: `csgRayCast` used to clamp an
  uncertain ray parameter to zero, so a near-tangency six units BEHIND the
  origin reported as uncertainty at the origin and the whole cast returned
  `indeterminate`. It now discards a `t` behind the origin by more than the
  local tolerance and keeps the clamp for one that straddles it. Your MUSE-35
  bench found this by reporting a disagreement instead of reconciling it.
- **The phantom-carve rule generalised.** Your MUSE-33 sweep produced three
  behaviours and they are one mechanism: the walker is released only where the
  distance to the CUTTER's boundary already exceeds the player radius. The
  overhang rule is that condition when the MOUTH is nearest; "no safe overhang"
  is when a SIDE face is nearer, which no overhang moves. Written up in
  `docs/rendering-contract.md`.
- `s3-truth.test.js`, `phantom-carve.test.js` and `tools/raycast-bench.js` are
  yours and are now in the tree; 45 suites is the baseline.

## MUSE-36 - Degenerate rays: is the analytic path still telling the truth?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

The lead changed how `csgRayCast` treats an uncertain ray parameter (above),
reasoning that an ambiguity behind the origin carries no measure and so cannot
move any forward interval. That reasoning is probably right, and it is exactly
one person's reasoning about a module the renderer and the walker both sit on.
Go after it.

- Allowed writes: a new `ray-degenerate.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Build an adversarial corpus of near-degenerate rays and run each one three
  ways: `method: 'analytic'`, `method: 'march'`, and an INDEPENDENT reference
  you write (bisect the field along the ray, or sample and refine -- state
  which, and the resolution you reach). Two paths through the same module do
  not make a reference.
- Cases worth having, at minimum: exact tangency ahead of, behind, and
  straddling the origin; tangency to a CUTTER versus to an additive solid; a
  ray starting exactly on a surface, just inside it, just outside it; a ray
  whose `maxDistance` lands exactly on the hit; a ray across coincident faces;
  and grazes displaced by one ulp either side of tangency.
- **Sort disagreements by what they cost.** A false MISS or a false HIT is a
  correctness failure. A false `indeterminate` is only waste. Report them in
  separate categories and say, for each, which answer the reference says is
  right. Do not average them into a rate.
- Probe the new guard directly. How far behind the origin must an ambiguity be
  before the guard discards it, and is that boundary in the right place? The
  most valuable possible result is a case where discarding a behind-the-ray
  ambiguity produces a WRONG forward answer. Go looking for one specifically,
  and if you cannot construct one, say what you tried.
- Fail-demo: restore the old `Math.max(0, t)` in your working copy, show the
  corpus catching it, restore, show it green.
- Acceptance: the corpus, the reference described well enough to rebuild, the
  disagreement table split by cost, and a verdict on the guard's boundary.

## MUSE-37 - The carve predicate, past the box cutter

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

The rule now reads: *a walk passes iff, everywhere the target is within r, the
cutter's boundary is farther than r from the path.* The lead checked it as a
predicate against the solver over 372 configurations and it agreed on every
one -- but all 372 used a BOX cutter, a straight path and E3. The predicate is
about to be handed to the editor, which will refuse people's rooms with it, so
its failures need to be known before that rather than after.

- Allowed writes: a new `carve-predicate.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Implement the predicate test-locally -- the distance from the path to the
  cutter's boundary, over the stretch where the target is within r -- and
  compare its verdict to what `sweep` actually does, across: ball cutters,
  plane targets, geodesic-cell cutters in S3 with a geodesic path, oriented
  cutters, and a target carved by SEVERAL cutters at once.
- Several cutters is the case most likely to break it, and worth thinking
  about before sweeping: with two cutters the field is a nest of `max`, and
  "the cutter's boundary" is no longer one surface. Say what the predicate has
  to become, then measure whether that version holds.
- **Direction matters more than rate.** A predicate that REJECTS a walk which
  would have worked costs an author a room they could have had. One that
  ACCEPTS a walk that then fails puts a player in a wall. Count and report
  those two separately, never as one accuracy figure.
- Where it fails, characterise the failure rather than tabulating it: which
  face was actually binding, and what the predicate thought was.
- Acceptance: the predicate as you implemented it, the comparison split by
  direction of error, the multi-cutter form with its evidence, and a plain
  statement of which primitive combinations it is not yet safe to check.

## MUSE-38 - What does the S3 bound cost a walk?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

MUSE-34 measured the cell bound's shortfall as a fraction of distance -- 0.29
at an edge, 0.36-0.42 at a corner -- and said the shortfall "is what the walker
pays for". That was the right thing to say and it is still not a measurement of
what the walker pays. A conservative bound costs STEPS: the solver advances by
the distance it is promised, so a bound that under-reports by 40% near a seam
advances 40% less on that step.

- Allowed writes: a new `s3-walk-cost.test.js` or a bench under `tools/`, a
  dated report under `docs/qa/`, `docs/qa/measurements.md`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- The comparison that isolates the answer is the flat limit, and it is free:
  the SAME document at curvature radius 10000 is Euclidean to 1.35e-8. Walk
  identical routes in both, and the geometry is held fixed while curvature and
  the spherical construction are the only things that vary.
- Measure per route: steps to cross, arclength travelled against the geodesic
  distance, the distribution of step sizes, and the stall fraction (steps
  advancing less than some fraction of the radius -- state which fraction and
  why).
- Routes worth having: straight across open floor, along a wall at a few
  clearances, into a corner, through the doorway, and one that grazes an edge
  the whole way. The seam-heavy routes are the point; the open one is the
  control.
- Report the cost as a RATIO to the flat case per route rather than as absolute
  step counts, so it stays meaningful when the room changes.
- If a route costs far more than MUSE-34's shortfall predicts, that is the
  finding: say so and characterise where the steps went, rather than reporting
  the ratio alone.
- Acceptance: the routes, the per-route table against the flat control, the
  stall definition, and one sentence on whether the bound's cost falls where
  MUSE-34 said it would.
