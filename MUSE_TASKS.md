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

Order: **nothing is open.** MUSE-40 is accepted and logged; MUSE-41 is delivered
and waiting on Astra, not on you. Do not re-run or extend it. The next batch
follows Astra's review of the region-motion repair.

WHAT CHANGED UNDER THIS QUEUE, 2026-09-10 (third turn). Read before starting:

- **MUSE-40 is accepted and moved to the log**, and its verdict is worth reading
  even though the task is closed: the S3 distance bound is EXACT, and the 77x is
  a walk whose true clearance is negative. See `docs/qa/muse-log.md`.
- **Your MUSE-38 correction is the reason to trust the rest of it.** You went
  back and said which two numbers in your own report were wrong and why. That is
  the second time this queue has produced a correction rather than a defence,
  and it is the habit worth keeping.
- **The ball lab's camera was fixed** (`app/ball-lab.js`): it yawed about the
  frame's own up while clamping against world z, so ordinary mouse circles piled
  up 6.5 degrees of roll each. Nothing under `engine/` changed.
- Baseline is 55 suites.

## MUSE-41 - Does the refusal stay refused?

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Astra | Node-only

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
