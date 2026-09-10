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

Order: MUSE-45 only. MUSE-44 accepted and archived to
[docs/qa/muse-log.md](docs/qa/muse-log.md); its `stepWalker` finding stands
open and section 2 of `docs/engineering/NEXT_CAPABILITIES.md` will walk into
it. What changed since: `resumeRegionCorrection` now exists in
`engine/world/region-motion.js` and `region-lab` has a `Finish correction`
action separate from resuming play — `docs/qa/claude-correction-resume-2026-09-10.md`.
Both were checked by the person who wrote them, which is what MUSE-45 is for.

## MUSE-45 — Is a resumed correction the correction that was owed?

Independent audit. No engine, app or tool changes; report defects, do not fix
them. Three questions, in this order.

**1. Is the continuation actually authority, or only a shape?** The operation
refuses to move anyone without a continuation this module issued, spends it on
use, and pins the compiled world, region, endpoint, camera, radius and residual.
Try to defeat that. A structural clone, a frozen copy, a continuation from a
different debt in the same scene, one from a different scene, one presented
after the state moved by 1e-16, one presented twice, one presented against a
recompile of the identical document. For each: did the walker move, and by how
much? A single case where a walker moves on authority the kernel did not issue
is the most valuable thing you could hand back.

**2. Is the resumed path the path the settle would have walked?** Claude checks
one whole resume against two one-step resumes and reports 0.00e+0 apart. Derive
your own reference instead of reusing that one: for the same scene and start,
compare where the walker ends up when the settle runs UNINTERRUPTED inside
`moveRegionProbe` (give it a budget that finishes) against where it ends up
when the settle is starved and then resumed. Those two should be the same
walker. Sweep budgets, radii, floor orientations, both E3 and S3, and several
curvature radii. Report the worst disagreement you find and the configuration
that produced it. Also check the CAMERA, not only the position: a resumed
correction that transports the frame differently is the failure that would
never show up in a coordinate.

**3. Is the clock really untouched?** The operation claims zero gameplay time
and claims the refused request's unspent time stays discarded. Verify both
independently: over a corpus, that no resume returns nonzero time in any field,
and — the harder one — that a debt-then-resume sequence never lets a walker
cover more ground per unit of dt than an uninterrupted run of the same scene
would. That is the property the zero-time rule exists to protect, and it is not
the same statement as "the fields read 0".

**One claim of Claude's to adjudicate, in your own words.** The report argues
that a resumed correction CANNOT reach a chart edge, by construction: a settle
retraces the lift, so it can only newly meet things strictly between the lifted
point and the contact it lifted off, and a chart extent is a convex geodesic
ball with the walker interior at both ends. An aperture can sit in that gap and
is checked; a chart edge, the argument says, cannot. Either construct a
counterexample — a scene where a resumed correction returns a `domain` event —
or say the argument holds and say what you tried. Do not take it on trust; the
last two Claude findings you audited each turned up something.

Deliver `correction-resume-truth.test.js` (yours, independent of
`correction-resume.test.js` — do not read it before writing your reference),
plus a report with the corpus counts and the worst numbers.

---

Report defects, do not fix them. Every number carries its command and host.
Paste `node tools/host-probe.js` output and do not investigate the environment
further.
