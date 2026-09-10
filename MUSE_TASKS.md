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

Order: **MUSE-25 first** (it checks work that just shipped), then MUSE-23 and
MUSE-24, which are Node-only and independent of each other. MUSE-22 needs the
check-queue worker restarted and is the user's to unblock, not yours -- ask
once, and move on to the others rather than waiting.

Order: **MUSE-26 first**, then 27 and 28, which are independent of it and of
each other. All three are Node-only; none needs a browser or a worker.

## MUSE-26 - A corpus for intersection

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`op: 'intersect'` landed in `aaa8015` with seven tests, all written by the
person who wrote the feature. MUSE-21 did this for subtraction and the pattern
worked; do it again for clipping. The interesting part is that intersection is
the SAME code path as subtraction with the sign flipped, so the cases that
matter are the ones where the two differ.

- Allowed writes: new files under `levels/fixtures/invalid/` and
  `levels/fixtures/carve/` (or a new `levels/fixtures/clip/`), a new
  `intersect-corpus.test.js`, `docs/qa/overnight-results.md`, this task's
  status and report. Do NOT edit `engine/world/document.js`,
  `engine/world/scene-field.js`, `boolean.test.js` or `boolean-corpus.test.js`.
- Invalid cases, one defect each: a global intersect (no target), an intersect
  on a spawn / anchor / objective, an intersect targeting itself, targeting a
  missing id, targeting a subtract, targeting another intersect. Assert on the
  MESSAGE, and for the global case assert it explains WHY rather than just
  refusing -- that message is doing real work.
- Valid cases worth pinning: a clip that removes its target entirely, a clip
  that removes nothing (target wholly inside it -- assert the field is
  bitwise what it would be with no clip at all), two clips on one target,
  a clip and a carve on the SAME target in both document orders (the result
  must not depend on the order, since both are a max), and a clip whose
  boundary exactly touches its target.
- THE ONE THAT MATTERS MOST: for a face produced by a clip and the
  corresponding face produced by a carve, assert the normals agree. The sign
  that distinguishes the two operations also decides which way a surface
  faces, and getting it backwards is a one-character bug that looks like a
  collision problem.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of rules found around `intersect` and how many are
  covered, plus a fail-demo on one of them.

## MUSE-27 - The modifier algebra, tested rather than asserted

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`engine/world/scene-field.js` justifies its design in a comment:

    A modifier with no target applies to every solid, and that is EQUIVALENT
    to applying it to the union afterwards, because max distributes over min:
        max(min(a, b), k) = min(max(a, k), max(b, k))

That identity is the reason scoped modifiers are called a strict
generalisation rather than a different operation. It has never been tested. A
comment asserting an algebraic law is exactly the kind of claim that is true
when written and false after a refactor.

- Allowed writes: a new `modifier-algebra.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/`.
- Test the identity AS THE FIELD COMPUTES IT, not as arithmetic: build a scene
  with a global modifier, build the same scene with that modifier duplicated
  and explicitly targeted at each solid, and assert the two fields agree at
  many deterministic sample points -- distance AND normal.
- Then the properties that follow, each of which could break independently:
  order-independence (two modifiers on one target, both document orders),
  idempotence (the same modifier twice is the same as once), and that a
  modifier targeting a solid has NO effect on any other solid's surface.
- Sample points must include places near the seams, not just open space. A
  property that holds everywhere except where two surfaces meet is a property
  that does not hold, and the seams are where `max` is not exact.
- Where an identity does NOT hold exactly, say so with the worst deviation and
  where it happens, rather than loosening a tolerance until it passes. A
  measured near-miss is a finding; a passing test with a mystery tolerance is
  not.
- Fail-demo: break the identity in your own copy (make the global modifier
  apply to only the first solid, say), show the check catching it, restore,
  show `git diff engine/` empty.
- Acceptance: each property stated as a sentence, tested, and either confirmed
  with its worst deviation or reported as not holding.

## MUSE-28 - Walking on a bound

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

The collision solver was built against an EXACT distance field. Carving and
clipping made the distance a lower bound, and the walker has not been exercised
on one in any systematic way -- `boolean.test.js` walks through one doorway.
Conservative advancement should be safe on a bound by construction, since a
lower bound only makes steps shorter. "Should be" is the part this task
replaces.

- Allowed writes: a new `walk-bound.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- Generate scenes deterministically -- no RNG, or a seeded generator whose seed
  is printed on failure. Vary: number of solids, number and kind of modifiers,
  whether modifiers are targeted or global, and include configurations that
  produce thin walls, narrow gaps and concave corners.
- For each scene, walk a probe from several starts along several headings for
  several hundred steps, and assert on every step: it never sinks below
  `-1e-3` clearance, it never reports `stalled` for more than N consecutive
  steps (state your N and why), and its position stays finite.
- Report separately how often the solver STALLS on a bound versus on an exact
  field, at matched scene complexity. A bound makes steps shorter, so more
  stalling is expected -- the question is how much, and nobody knows.
- If you find a scene where the probe sinks, that is the deliverable: the seed,
  the scene as JSON, the step it happened on, and the clearance. Stop and
  report rather than characterising further.
- Acceptance: the number of scenes and total steps walked, the stall comparison
  with its method, and either a clean verdict sentence or a reproducing case.
