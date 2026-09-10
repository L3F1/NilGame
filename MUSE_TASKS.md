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

## MUSE-21 - A corpus for booleans

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`op: add | subtract` and `target` landed in `e348791` with 14 tests. Those
tests were written by the person who wrote the feature, which is the weakest
kind of coverage there is. MUSE-13 built exactly this for the base schema and
found the shape of the validator; do the same here.

- Allowed writes: new files under `levels/fixtures/invalid/` and
  `levels/fixtures/carve/`, a new `boolean-corpus.test.js`, registration in
  `tools/test.js` if it needs it, `docs/qa/overnight-results.md`, this task's
  status and report. Do NOT edit `engine/world/document.js`,
  `engine/world/scene-field.js` or `boolean.test.js`.
- Invalid cases, one defect each, built by mutating a VALID document: `op` on
  a spawn / objective / anchor, `op` misspelled, `target` on an `add`, `target`
  naming itself, `target` naming a non-existent id, `target` naming a
  non-solid (a spawn), `target` naming another SUBTRACT rather than an added
  solid. Assert on the message, not just that it threw.
- Valid cases worth pinning because they are easy to break: a carve that
  removes a solid entirely (is the field empty space, or does something worse
  happen?), two carves targeting the same solid, one carve targeting a solid
  that a second carve has already removed, a carve entirely outside the solid
  it targets (no effect), and a carve exactly tangent to its target.
- For every valid case also assert the CAPABILITY the field advertises, since
  that is the part a solver trusts.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of how many validator rules you found around `op`
  and `target`, how many you covered, and the rest listed with reasons. Plus
  the fail-demo required above, on one rule of your choosing.

## MUSE-22 - The two checks the GPU dropout blocked

Status: OPEN | Owner: Muse | Reviewer: Opus | Needs a queue worker

MUSE-20 measured seven of nine check families. `play-check` and `link-time`
failed on the worker host with `no webgl2` from about 19:03, after real-GPU
checks had passed at 18:52. The lead re-ran `link-time` directly on Windows
afterwards and it was fine — 8.5 s hyperbolic, real GPU — so this is a
transient on the worker, not a defect in either tool.

- Allowed writes: `docs/qa/overnight-results.md`, `docs/qa/check-runbook.md`
  (timing cells only, for rows you ran), this task's status and report.
- Ask the user to restart the check-queue worker before you start, and say in
  your report whether they did. A worker that has been up for a long time is
  the suspect.
- Through the queue: `play-check` (default) and `link-time`. Record command,
  exit code, wall time and the numbers each reports.
- If `no webgl2` recurs, STOP after two attempts and record: the exact error,
  how long the worker had been up, and what the immediately preceding
  successful check was. That timing is the finding.
- Acceptance: both rows measured, or a precise account of the recurrence.

## MUSE-23 - What does a carve cost at query time?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

With no carve, `rayHit` solves each primitive in closed form. With one, it
sphere-traces, because the nearest analytic surface may have been cut away.
That is a real cost and nobody has measured it. The collision solver calls
these in a loop, so the number decides whether carving is something an author
can use freely or something to use sparingly.

- Allowed writes: `docs/qa/carve-cost-2026-09.md` (new), `tools/carve-bench.js`
  (new), `docs/qa/overnight-results.md`, this task's status and report. Do NOT
  edit anything under `engine/`.
- Measure, on documents you build in the benchmark rather than fixtures:
  `distance()`, `normal()` and `rayHit()` calls per second, for scenes with
  0, 1, 2, 4 and 8 carves, at 1, 4 and 16 additive solids.
- Report the RATIO to the uncarved case, not just absolute rates — the
  absolute numbers are about this machine and the ratio is about the design.
- Also report the mean number of marching steps `rayHit` takes, since that is
  the mechanism and it is the thing that would change if the bound got tighter.
- Warm up before timing, run each configuration at least three times, and
  report min/median/max. A single sample of a JIT'd loop measures the JIT.
- Do NOT conclude whether carving is "too slow". Report numbers and say which
  configuration you would want measured next.
- Acceptance: one table, the ratios, the step counts, and the method stated
  including how you warmed up.

## MUSE-24 - One place where the numbers live

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

MUSE-12 found fourteen false claims and nearly all of them were numbers that
had been true once: check counts, suite counts, program counts, ray counts.
The cause is structural — every document quotes its own figures, so every
document rots independently. Fix the structure, not the fourteen instances.

- Allowed writes: `docs/qa/measurements.md` (new),
  `docs/qa/overnight-results.md`, this task's status and report. **Do not edit
  the documents that carry the stale numbers** — the migration is the lead's,
  because deciding which claims are scope statements rather than measurements
  is a judgement call.
- Sweep every `.md` for a factual NUMBER about the code: counts of tests,
  checks, suites, programs, rays, cases, fixtures, geometries, timings.
- Build one table: the quantity, its current true value, the exact command that
  produces it, the host that matters (or "any"), and every file:line that
  currently quotes it.
- Where a quantity can be produced by a command, say so. Where it cannot —
  because nothing prints it — mark it and say what would have to exist. That
  list is the more useful half of this task: a number no command produces is a
  number that WILL rot.
- Do not include numbers that are constants of the mathematics rather than
  measurements of the code (eight Thurston geometries, four bounces, a 4x4
  matrix). State the rule you used to draw that line.
- Acceptance: the table, with a command against every row that has one, and an
  explicit list of the rows that have none.
