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

Order: MUSE-53. MUSE-52 accepted and archived.

## MUSE-53 - Independent full-segment S3 cell exclusion audit
Status: OPEN | Owner: Muse | Reviewer: Astra | Node-only

Read docs/engineering/S3_EXCLUSION_CONTRACT.md and the new helper
engine/geometry/s3-cell-exclusion.js. Allowed writes:
s3-cell-exclusion-truth.test.js, docs/qa/muse53-cell-exclusion.md,
this task status/report only. Do not edit the helper, classifier or other tests.
Claude concurrently owns classifier integration; test the helper directly so
neither assignment depends on unreviewed work from the other.

Verify exclusion witnesses on compiled translated/rotated cells at multiple R,
including decimal frames and poses on authored face planes. Independently
sample/refine the named witness face along the full physical segment; every
excluded result must remain strictly outside it. Verify claimed lower values.
Separate exact special cases from converged sampled evidence. Do not duplicate
phase/atan2 extrema logic as the reference or normalize poles in the harness.

Include rays outside at the origin but entering later, rays beginning inside,
zero range, both endpoint touches, nearly coplanar cases, the pi*R limit, exact
budgets and input drift. A lack of a single persistent face witness is UNKNOWN,
not a bug or occupancy claim. Construct a case with an ambiguous face and a
different valid full-span witness; also construct a related longer ray where
that witness fails. State whether it actually resolves Claude's reported pose;
do not assume this sufficient screen fixes every cutter-plane refusal.

Include isolated targeted fail-demo, focused/full Node runs, command/host data.
Counterexamples are the deliverable; do not repair production. Stop at READY FOR
REVIEW. No renderer, UI, schema, workflow automation or environment diagnosis.
