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

Order: MUSE-46 only. MUSE-45 accepted with one adjudication reversed, and
archived to [docs/qa/muse-log.md](docs/qa/muse-log.md). Its audit of the
continuation's authority, the resumed path and the clock all stand. Its
adjudication of the chart-edge claim does not: the claim is FALSE, and Claude
falsified it after reading the verdict. A settle only retraces the lift when
nothing slid in between; put the floor below the chart centre and the walker
slides to where the point beneath it is outside the chart. It is now
`correction-resume.test.js`, "A RESUMED CORRECTION CAN REACH THE CHART EDGE".

## MUSE-46 — Which other "cannot happen" claims are wrong?

Two agents believed the same wrong argument at the same time last round, and
what made it survive was its FORM: it was reasoned rather than measured, so it
read as proof. The code was right throughout; only the claim was false. That is
the failure mode this task is aimed at.

Sweep the repository for claims of impossibility or unreachability and test
each one. They live in comments, contracts and QA reports, and they sound like:
"cannot", "never", "impossible", "unreachable", "by construction", "no case
where", "this branch is dead", "only ever", "always". Search for the words, but
judge the claims, not the grep — a sentence that says "the probe never lands
exactly on a surface" is a claim; a sentence that says "never mutates the
caller's state" is a different kind and may be an invariant worth confirming
rather than breaking.

For each claim you decide is worth testing, deliver one row:

- where it is (file and line), and what exactly it asserts
- whether the tree BACKS it: is there a check that would fail if it stopped
  being true, or is the argument load-bearing and unchecked?
- your attempt to break it, described concretely enough to repeat: which
  scenes, which parameters, how many, and what the extremes were
- verdict: HOLDS (and what you tried), FALSE (with the reproduction), or
  UNTESTED (and why it resisted)

Prioritise claims that something DEPENDS on. A claim that a branch is dead is
worth more than a claim that a number is small, because the dead branch is the
one nobody maintains. Start with `engine/world/` — `collision.js`,
`region-motion.js`, `region-portal.js`, `camera-frame.js` — then the contracts
in `docs/engineering/`, then the QA reports.

Do not repair anything, including a claim you prove false: correcting the
sentence is the author's job and the reproduction is yours. If a claim turns
out to be true AND unchecked, say so and say what a check for it would cost —
an unchecked true claim is a finding too, because it is one refactor away from
being a false one.

Deliver `impossibility-audit.test.js` holding the reproductions for anything you
prove false, and a report with the table. If you find nothing false, the report
is still the deliverable: a list of which impossibility claims are actually
backed by a check and which rest on an argument is worth having on its own.

---

Report defects, do not fix them. Every number carries its command and host.
Paste `node tools/host-probe.js` output and do not investigate the environment
further.
