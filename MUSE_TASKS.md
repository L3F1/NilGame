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

Order: MUSE-47, then MUSE-49, then MUSE-48. MUSE-46 accepted and archived by Astra.
Current walking implementation: docs/qa/astra-spherical-walking-2026-09-10.md.
Do not change engine/app code; report defects with executable reproductions.

## MUSE-47 - Independent spherical support and walking audit
Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only initially

Read NEXT_CAPABILITIES.md section 2 and the walking report/API. Allowed writes:
spherical-walking-truth.test.js, dated QA report, this task's status/report.
Independent references: intrinsic height on offset/tilted great-sphere floors,
one-dimensional free fall, tangential metric speed and timestep refinement.
Cover multiple R/player radii, long stationary support, jump/departure, corners,
near-vertical camera aim, nonfloor obstacles, unsupported floor modifications,
initial invalid/unproven clearance and domain outcomes. Verify no mutation of
caller state, honest aggregate clock and finite substep budgets.
Exercise a real owed correction, explicit resumption and subsequent walking.
Do not infer safety from a green state flag: inspect geometry and request/debt.
The host should jump on a new press, not every frame Space is held; use browser
queue only if adding a real-handler check is necessary and coordinate with Claude.
Fail-demo in an isolated copy, focused/full Node suites, reference limitations.
No generalization from a sampled route to all support configurations.

## MUSE-48 - Turn four sampled invariants into named regression checks
Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only

Use MUSE-46's four missing checks, with their original input assumptions:
thin-wall/ball swept safety, surface margin, post-portal side separation, and
camera handedness. Allowed writes: invariant-evidence.test.js, dated QA report,
this task's status/report. Keep deterministic seeds and non-vacuous counts.
State which claims are conditional on a valid exterior distance bound and a
non-overlapping start. Include curved cases where meaningful; distinguish
measured margin from a theorem. Do not rewrite historical reports to claim
universal proof. A counterexample is a deliverable, not permission to fix scope.
Run a targeted fail-demo, restored checks and tools/test.js.

## MUSE-49 - Independent connected sight audit
Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only

After MUSE-47, before MUSE-48. Read docs/qa/astra-connected-sight-2026-09-10.md
and NEXT_CAPABILITIES.md section 3. Allowed writes: region-sight-truth.test.js,
docs/qa/muse49-sight-audit-2026-09-10.md, this task's status/report only.
Test actual compiled worlds, not mocked crossing functions. Vary portal offset,
orientation, S3 radius and aperture approach; check mapped tangents against
independent frame/metric identities and remaining physical range. Cover thin
objects, source occlusion, on-plane/near-plane ambiguity, competing gates,
range endpoints, shared work and crossing exhaustion. Inspect segment/crossing
records, not merely the final status. S3 surface-candidate is intentionally
unresolved; do not label a small bound a proven hit. Negative/inside starts
must not become a confident empty result. Treat conservative refusals separately
from wrong positive claims. Include a failing isolated mutation, focused/full
Node runs and reference limitations. Report defects, do not repair kernel code.
