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

Order: MUSE-49 revision, MUSE-48 revision, then MUSE-50. MUSE-47 accepted and archived.
Current walking implementation: docs/qa/astra-spherical-walking-2026-09-10.md.
Do not change engine/app code; report defects with executable reproductions.

## MUSE-48 - Turn four sampled invariants into named regression checks
Status: CHANGES REQUESTED | Owner: Muse | Reviewer: Astra | Node-only

Revision: read MUSE-48 bullets in docs/qa/astra-muse47-49-review-2026-09-10.md.
Same allowed files. Add tangent-frame handedness/Gram checks along repeated
transport/turn paths, reflection negative control, explicit ambiguous oracle
band, S3 start-clearance assertions and stronger E3 endpoint/contact checks.
Correct prose distinguishing E3 detector from S3 sampled oracle. Preserve
existing exit/margin checks; fail-demo and rerun. No kernel repairs.

Report (Muse, 2026-09-10): READY FOR REVIEW. All four hold on sampled
compiled worlds under the original assumptions (exact exterior bound,
non-overlapping start, asserted per start): 35 E3 thin-wall runs (30
engaged) + 20 S3 sweeps agreeing both ways with a dense-trace field oracle,
0 pass-throughs; 54 contacts all at clearance > 0 (min 5.08e-5, at
safetyMargin); 6/6 frozen exits at 4.04-4.06e-4 past the anchor
(= skin*4) with transverse to 1e-9, S3 exit z=-1.999596, 1 obstructed-exit
refusal blocked-exit source-side; 1000 turn-path frames keep triple product
> 0 (min 0.914). Isolated fail-demo: exitOffset removal fails check 3
(`exit offset missing (x=0.00000596...)`), 3/3 others pass, repo untouched.
invariant-evidence.test.js (4/4). No counterexamples on sampled inputs;
margins measured, no theorems claimed. Details:
docs/qa/muse48-invariant-audit-2026-09-10.md.

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
Status: CHANGES REQUESTED | Owner: Muse | Reviewer: Astra | Node-only

Report (Muse, 2026-09-10): READY FOR REVIEW. All hold on own fixtures:
E3-S3-E3 legs total exactly 3/4/20 with both exits and carried tangents
agreeing to 1e-9 (recomputed from compiled anchors, entry-based logAt);
occlusion hits with zero crossings; inside starts hit at 0; on-plane and
fresh-call-at-exit refuse as aperture-side (call boundary distinguishes
suppressed reverse from unrelated start); ties cross nothing; closed/
one-shot/shared-work budgets refuse exactly; thin foil hit 0.59 past the
exit; S3 ball stays surface-candidate (certified 2.4 vs 2.2e-16 field);
range hit/short/miss exact; ray never mutated. Isolated fail-demo:
tie-check removal crosses the first gate (0→1 crossings), repo untouched.
connected-sight-truth.test.js (6/6). Details:
docs/qa/muse49-sight-audit-2026-09-10.md.

Revision requested: add crossing fixtures at R=0.5 and R=100 as well as R=8,
with valid charts and independently calculated physical lengths and tangent
mapping. Keep current checks and limits. Correct original path permission:
connected-sight-truth.test.js is the approved existing file; do not duplicate it.
Then proceed to MUSE-48. Read docs/qa/astra-connected-sight-2026-09-10.md
and NEXT_CAPABILITIES.md section 3. Allowed writes: connected-sight-truth.test.js,
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


## MUSE-50 - Independent S3 numerical transport repair audit
Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only

After the two revisions. Read the repair section in the Astra review above.
Allowed writes: metric-stability-truth.test.js, docs/qa/muse50-metric-stability.md,
this status/report only. Test metric normalization and repeated nonzero/zero
segments, tiny accepted radial roundoff versus invalid input, linear carry and
physical norm, inverse legs and a nontrivial closed-loop holonomy. Use explicit
ambient rotation references independent of stepWithTransport; vary R and step
size. Ensure speed is not reset to one and zero travel preserves exact values.
Report accumulated error and reference limitations. Isolated old-code or
mutation fail-demo; focused/full Node tests. Do not fix kernel code.
