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

Order: MUSE-43 first, then MUSE-44. Both are independent audits of the host
pause policy landed in `app/motion-pause.js`; neither may change engine, app or
tool code. What changed: Claude implemented the contract's pause/reset policy in
the S3 editor and added pointer-lock lifecycle coverage to both editors
(`docs/qa/claude-pause-input-2026-09-10.md`). The parity between that policy and
the contract was checked by the person who wrote the policy, which is exactly
the arrangement these two tasks exist to break.

## MUSE-43 — Is the pause table the one the contract asks for?

**Do not read `app/motion-pause.js` until you have written your own table.**
That is the whole method: derive, from `docs/engineering/REGION_MOTION_CONTRACT.md`
alone, which `moveRegionProbe` outcomes must END a host's movement session and
which must not, and which of the ending ones a host may offer an explicit retry
for. Write that table down in your report, with the contract line each row
rests on, BEFORE you open the module.

Then build a corpus and compare. Sweep real results out of the kernel — several
fixtures, several start states including ones inside solids and on chart edges,
`maxSteps` / `maxContacts` / `maxCrossings` from 0 upward, dt from 0 to
something large — and tabulate `status × detail × (pendingLift ? owed : none) ×
timeRemaining`, with a count for each combination reached. Then run
`motionPause` over the same corpus and report every disagreement with your
table, plus every combination your table covers that the corpus never reached.

Deliver: `motion-pause-truth.test.js` (yours, independent of
`motion-pause.test.js`), a report, and — most valuable — any row where your
reading of the contract and the shipped policy differ. If they agree everywhere,
say so and say how much of the space you actually reached; an unreached
combination is a finding, not a gap to paper over.

Two specific things worth aiming at. First: is `blocked-exit` really not a
pause? Claude decided it is not, on the grounds that a refused crossing retains
a certified source state. Check whether the contract supports that, and whether
a `blocked-exit` can ever arrive carrying an unpaid correction. Second: can a
result carry `pendingLift` with `status === 'complete'`? If it can, a host
reading only the status would fly straight on, and the whole policy rests on
the debt being checked first.

## MUSE-44 — Does anything else in the tree feed a refusal forward?

A sweep, not a fix. `app/region-lab.js` now consults `motionPause`. Find every
other place in the repository that consumes a motion or walker result and
carries its state into a subsequent frame — `app/ball-lab.js`, anything under
`app/`, `levels/`, `tools/` and the arena code — and report, per site, what it
does with a status that is not a completion and with any correction the solver
left owed. Some of these are the E3 walker with a different result shape; say
so rather than forcing them into the region-motion vocabulary.

Deliver a table of call sites and a verdict per site: consults the status /
ignores it / has no status to consult. Do not repair any of them. If a site
looks wrong, the reproduction is the deliverable.

---

Both tasks: report defects, do not fix them. Every number carries its command
and host. Paste `node tools/host-probe.js` output and do not investigate the
environment further.
