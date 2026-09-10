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

Order: **MUSE-32 first** -- it is the newest code and the most depended upon,
and the S3 room is being built on it right now. Then 31, which has a decision
waiting on it, then 29 and 30. All four are Node-only; none needs a browser or
a worker.

Context you need: `kind: 'box'` landed in `319ca88`. It is an
axis-aligned box with three half-extents, and unlike every other way of
building a box it is EXACT -- exact distance, exact normal, exact slab ray hit
-- so a scene made of boxes still renders down the closed-form path. Six
clipped planes describe the same solid and can only promise a bound, and one
bound anywhere makes the whole scene marched. `box.test.js` has the argument
in full.

WHAT CHANGED UNDER THIS QUEUE, 2026-09-09. Read this before starting: two of
these tasks were written against a field that has since moved.

- `capabilities` no longer has one `distance` word doing several jobs. It now
  reports `exteriorDistance`, `interiorDistance`, `interiorSign`,
  `intersection`, `normal` and `normalUniqueness` separately. The reason is a
  real defect: an overlapping union advertised an EXACT signed distance it did
  not have (two unit balls one apart report -0.5 at the midpoint where the
  truth is 0.866). `interiorSign` is exact through every operation.
- `rayCast` resolves ray intervals ANALYTICALLY per solid group by default and
  returns `status`, `owner` and `normal`. The marcher is still there under
  `method: 'march'`. A modifier no longer forces the whole scene to march.
- Scene documents are at version 2. A v2 entity may carry an orthonormal
  `frame` of `forward` and `up`; v1 documents load unchanged with identity
  orientation. E3 boxes may be oriented. S3 uses a `geodesic-cell`.
- `engine/world/collision.js` consumes `createMetricSpace`. The metric takes
  the point it is evaluated at -- `norm(p, v)`, `dot(p, u, v)`,
  `project(p, u, n)`, `transport(p, q, v)` -- and a sweep returns a `carry`
  that transports a vector along the path actually taken.

If one of your tasks contradicts the above, the task is out of date and saying
so is the right answer, not working around it.

Order: **MUSE-33 first** -- it is a live authoring defect with a rule that has
only been derived, not measured. Then 34, then 35. All three are Node-only;
none needs a browser or a worker.

WHAT CHANGED UNDER THIS QUEUE, 2026-09-09. Read before starting:

- **The curved side is real now.** `engine/geometry/metric-space.js` supports
  `e3` and `s3`; `engine/world/collision.js` runs entirely through it, and
  `engine/world/region-world.js` compiles a scene into per-region fields
  including a spherical one. `s3-room.test.js` walks a probe through a doorway
  on a sphere with the SAME solver E3 uses.
- A metric takes the point it is evaluated at: `norm(p, v)`, `dot(p, u, v)`,
  `project(p, u, n)`, `transport(p, q, v)`. A sweep returns `carry`, which
  transports a vector along the path actually taken.
- `field.coincidentFaces()` reports entity pairs sharing a surface exactly.
- Portals are refused outside E3 on purpose: the aperture test assumes a
  straight segment. That is not a bug to fix, it is a design (item 4) that has
  not happened yet.

## MUSE-33 - The phantom surface of a carve: find the real rule

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

Walking the new S3 room turned up a live defect, and it is not
curvature-specific. Subtraction is `max(d, -m)`. Where the carving solid
extends PAST the solid it cuts, that `-m` term is the distance to the CARVER's
own boundary -- a surface standing in open air that belongs to nothing. The
value stays a valid lower bound and nothing is drawn there, so the renderer is
innocent. But a walker reads a CLEARANCE from it, and when that clearance falls
below the player radius the player is stopped dead by nothing at all.

Observed: the S3 probe halted at y = 2.05, past the wall's far face, with the
field reporting 0.2505 against a player radius of 0.25.

I derived a rule and confirmed it in one configuration:

    a cutter must overhang its target by MORE THAN TWICE the player radius

reasoning that a probe is stopped one radius short of the carver's face and
escapes only if the target's own distance already exceeds a radius there. At
radius 0.25 an overhang of 0.5 blocks and 0.7 walks through.

**One configuration is not a rule.** That derivation assumes an axis-aligned
box cutter meeting a flat face head-on. Find out what is actually true.

- Allowed writes: a new `phantom-carve.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Vary what the derivation assumed and see which parts of it survive: cutter
  and target kinds (ball, box, plane, and geodesic-cell in S3), approach angle
  (head-on versus oblique versus grazing), player radius, the SIZE of the
  overhang relative to the target's own thickness, and an oriented cutter
  whose faces are not parallel to the target's.
- State the measured quantity before you sweep. "Blocked" needs a definition:
  a sweep that reports `hit` where the true nearest material is further than
  the probe radius is the obvious one, but say what you chose and why, and how
  you compute the TRUE nearest material independently of the field.
- The interesting answers, in order of usefulness: the rule is 2r for every
  configuration; the rule is k*r for some other k you measure; the rule depends
  on something other than the radius, in which case say what; or there are
  configurations with no safe overhang at all, which would be the most
  important finding of the four.
- A ball cutter has no flat face and may behave completely differently. Say so
  if it does rather than forcing it into the same rule.
- Also worth knowing and cheap: does the phantom ever make the walker SINK
  rather than stop? It should not -- the bound never overestimates -- but the
  claim is worth one check.
- Fail-demo: an authored scene that a check based on your rule accepts and that
  the walker then fails to cross, or a demonstration that you could not
  construct one.
- Acceptance: the rule as a sentence with the sweep behind it, the
  configurations where it does NOT hold, and an explicit statement of what an
  editor could check from the document alone.

## MUSE-34 - The S3 room, checked the way MUSE-30 checked the box

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`s3-room.test.js` has eight checks, written by the person who verified the
field, and its strongest is the flat limit at R = 10000. That is a good check
and it is one lead checking another lead's code with a third idea. MUSE-30 is
the pattern for what comes next: an INDEPENDENT reference, finer than the
thing it tests.

- Allowed writes: a new `s3-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- The reference for a `geodesic-cell` is the nearest point on its surface
  found WITHOUT the plane construction: sample the cell's boundary, refine, and
  measure great-circle distance. State your refinement and the resolution you
  actually reached.
- The cell distance is a BOUND, not exact, so the comparison is one-sided:
  the field may under-report and must never over-report. Measure how MUCH it
  under-reports and where -- near a face, near an edge, near a corner, deep
  inside -- because that shortfall is what the walker pays for and nobody has
  measured it in a curved space.
- Sweep the curvature radius from nearly flat to tight enough that the room
  fills a large fraction of the sphere. Report where, if anywhere, the
  behaviour departs from the flat case by more than the geometry demands.
- Include a cell whose half-extents approach the patch limit, which is where a
  face's pole construction is most likely to lose precision.
- Acceptance: the reference described well enough to rebuild, the one-sided
  comparison with worst under-report and where, and the curvature sweep.

## MUSE-35 - What does the marched path cost now?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

MUSE-23 measured a 20-50x cliff on the first carve, and that number is now
stale in two ways at once: `rayCast` resolves ray intervals analytically per
solid group by default, so a modifier no longer forces the whole scene to
march; and the figure was CPU `rayHit` THROUGHPUT, which the lead then repeated
as if it were frame time. It is not, and no GPU path may be promoted on CPU
throughput alone.

Re-measure the CPU half honestly. The GPU half needs a browser and is not
yours.

- Allowed writes: a new or updated bench under `tools/`, a dated report under
  `docs/qa/`, `docs/qa/measurements.md`, `docs/qa/overnight-results.md`, this
  task's status and report. Do NOT edit anything under `engine/` or `app/`.
- Compare `method: 'analytic'` against `method: 'march'` on the same scenes and
  the same rays, and report them separately. Scenes worth including: a room
  with no modifiers, a room with one carve, a room with many, a scene where the
  modifiers are concentrated on one solid while others are untouched (which is
  the case the per-group change was made for), and grazing rays.
- Report hit and miss rays SEPARATELY. A miss costs a marcher its whole budget
  and costs the analytic path almost nothing, so mixing them produces a number
  that describes neither.
- Count `status: 'indeterminate'` results as their own category. A path that is
  fast because it gives up is not fast.
- Every number carries the command that produced it and the host it ran on.
  Warm up, take several runs, report min/median/max rather than one figure.
- Say plainly what the measurement does NOT establish -- specifically that it
  says nothing about frame time -- so the next person to quote it has the
  caveat attached to the number rather than in a paragraph they might skip.
- Acceptance: the table, the method, the separation of hits/misses/give-ups,
  and one sentence on what changed since MUSE-23 and why.
