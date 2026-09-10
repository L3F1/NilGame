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

## MUSE-32 - The metric space, checked against identities it cannot fake

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`engine/geometry/metric-space.js` is new and it is now load-bearing: the whole
collision solver runs through it, and the S3 room is being built on top of it.
It has 16 checks written by its author and 11 written by me, and both of us
were checking the thing we had just written. That is exactly the situation
MUSE-25 was about.

A metric space is unusually good to test this way, because differential
geometry supplies IDENTITIES that must hold for any correct implementation and
that a wrong one cannot accidentally satisfy. Use those rather than recomputing
the formulas a second way.

- Allowed writes: a new `metric-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- Test BOTH `kind: 'e3'` and `kind: 's3'` at several curvature radii, including
  one large enough that S3 is nearly flat -- an S3 result that does not tend to
  the E3 result as the radius grows is a bug, and that limit is a strong check
  costing you nothing.
- The identities worth pinning, each as a sentence before you test it:
  - `logAt` and `expAt` invert each other, both ways round, over a spread of
    separations from tiny to near the patch limit. Tiny separations are where
    a naive implementation loses all its precision.
  - `distance(p, q)` equals the norm of `logAt(p, q)`, and is symmetric.
  - A geodesic is LOCALLY SHORTEST: sample paths that deviate from
    `stepWithTransport` and confirm none is shorter. This is the one that
    catches a step that is subtly not a geodesic.
  - Transport is an ISOMETRY: it preserves the inner product of any two
    vectors, not merely the length of one. Length alone is preserved by
    things that are not transport.
  - Transport around a CLOSED LOOP returns a rotated vector, and on a sphere
    the angle it comes back rotated by is the enclosed area divided by R^2.
    That is holonomy, it is the sharpest available test that transport is
    genuinely the Levi-Civita one, and it cannot be satisfied by accident.
    In E3 the same loop must return the vector unchanged.
  - `frame(p)` is orthonormal at every p you try.
  - `boundaryDistance` agrees with a bisection on `withinDomain`.
- Report worst deviations WITH the query that produced them, and the
  separation or radius regime each was found in. If precision degrades near
  the patch limit or at tiny separations, that is a finding worth more than a
  pass -- say where it starts.
- Fail-demo: break one identity in your own copy of a helper, show the check
  catching it, restore, show `git diff engine/` empty.
- Acceptance: each identity stated as a sentence, tested in both geometries,
  and either confirmed with its worst deviation or reported as not holding.

## MUSE-31 - Coincident faces: characterise, and do not force a number

Status: OPEN (REVISED 2026-09-09) | Owner: Muse | Reviewer: Opus | Node-only

**REVISION, from Astra.** The first version of this task asked you to find a
threshold. That framing pushes toward producing a number whether or not one
exists, so three things are now explicit:

1. **Failing to reproduce the artifact in Node is a VALID RESULT** and a
   complete answer to this task. The symptom was seen on a GPU. If the CPU
   field is well behaved across the whole sweep, say so and stop -- that
   finding is worth more than a threshold extracted from a signal you had to
   go looking for.
2. **A legitimate change of normal across an edge is not a defect.** A box has
   edges; neighbouring rays that land on different faces SHOULD report
   different normals. Only a discontinuity that cannot be explained by the
   geometry counts.
3. **Do not derive a universal editor warning distance from one camera or one
   epsilon.** If the behaviour tracks view distance, grazing angle or
   `hitEpsilon`, then there is no document-level constant to warn on, and
   saying that plainly is the deliverable.

The `box-room` fixture first drew a SPECKLED LINE across its doorway sill.
The carving box's bottom face sat at exactly z = 0, in the same place as the
ground plane; two surfaces occupy one location and the marcher cannot say
which it is on. Sinking the cutter 0.2 below the floor fixed it. Nothing
numeric caught this -- only the picture did.

There is a TODO to have the editor WARN about this. Whether such a warning
can exist AT ALL -- whether "too close" is a property of the document or only
of a particular view -- is the actual question. Answering "it is not a
document property" closes the TODO just as well as a number would.

- Allowed writes: a new `coincident.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/` or
  `app/`.
- Reproduce it in Node FIRST, without a browser. The symptom on screen is a
  ray that cannot decide which surface it hit, so the CPU analogue is
  `rayCast` disagreeing with itself: march a fan of rays across the seam and
  look at whether `t`, the owner, or the normal flips between neighbouring
  rays that should agree. State what signal you chose to be the defect and
  why, BEFORE you sweep -- a threshold found by looking for one is not a
  measurement.
- Then sweep the separation: carving box bottom at exactly the plane, and at
  a decreasing series of offsets above and below. Report where the signal
  appears and disappears, in both directions. Coincident and NEARLY coincident
  may not behave the same way, and if so that is the finding.
- Vary the thing that should matter and check whether it does: the distance
  from the camera to the seam, the grazing angle, the size of the solids, and
  `hitEpsilon`. A threshold that is really a function of one of those is not a
  constant the editor can warn on, and saying so is a better answer than a
  number that only holds for one scene.
- Report any threshold as a RANGE with the sweep that produced it, never a
  single value, and never one extrapolated past the conditions you swept.
- NOTE THE FIELD HAS CHANGED UNDER THIS TASK. `rayCast` now resolves ray
  intervals analytically per solid group by default and reports `status`,
  `owner` and `normal`; the marcher is reachable with `method: 'march'`. Sweep
  BOTH, and report them separately -- if the analytic path is clean where the
  marcher is not, that is the most useful thing this task could find, because
  it says the artifact belongs to marching rather than to the geometry.
- Acceptance: the chosen defect signal stated as a sentence BEFORE the sweep,
  the sweep itself, and either a characterised range or a clear statement that
  no document-level threshold exists. A fail-demo only if you found a signal
  to demonstrate; if you found none, show instead that your check WOULD fire
  on a scene you construct to be genuinely bad.

## MUSE-29 - A corpus for boxes

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

MUSE-21 did this for subtraction and MUSE-26 for intersection, and both found
things. Same pattern, new kind. The interesting part this time is that a box
is the FIRST solid to arrive after modifiers existed, so it lands in code that
was written without it.

- Allowed writes: new files under `levels/fixtures/invalid/` and a new
  `levels/fixtures/box/`, a new `box-corpus.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  `engine/world/document.js`, `engine/world/scene-field.js`, `box.test.js` or
  any existing test.
- Invalid cases, one defect each: `halfExtent` missing, wrong length, zero,
  negative, non-finite; `halfExtent` on a ball, a plane, a spawn; `radius` on
  a box; a frame (`up` or `forward`) on a box; a box whose CORNER leaves the
  chart while every half-extent on its own is inside it. Assert on the
  message, and confirm each refusal leaves the document byte-identical.
- THE ONE THAT MATTERS MOST: owner indices now span three bands -- ball i,
  plane 100+i, box 200+i -- and a modifier names its target by that index.
  Build scenes with several of each kind, in several document orders, and
  assert every modifier applies to the solid it names AND to nothing else. An
  off-by-one in a band carves the wrong object, which looks like a rendering
  bug and is a bookkeeping one. Cover a box carving a ball, a ball carving a
  box, a box clipping a plane, and a box modified by two different kinds.
- Also worth pinning: that a scene of boxes with no modifier still advertises
  `distance: 'exact'`, and that adding one modifier of any kind drops it to
  `bound`. That is the capability the whole primitive exists to protect.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of rules found around `box` and how many are
  covered, plus a fail-demo on one of them.

## MUSE-30 - Is the box really exact?

Status: OPEN | Owner: Muse | Reviewer: Opus | Node-only

`box.test.js` brackets the distance from both sides -- nothing within `d` is
inside, and stepping past `d` is not outside -- which pins it to about 1e-7.
That is the lead checking their own formula with a cleverer version of the
same idea, and MUSE-25 is the reason that is not enough: an independent
reference caught a defect in code the lead had written and was confident in.

Build the independent reference.

- Allowed writes: a new `box-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- The reference is the NEAREST POINT ON THE SURFACE, found without the box
  formula: sample the six faces densely, take the best, then refine locally
  until it stops improving. State your refinement and its convergence, and
  report the resolution you actually achieved rather than assuming it.
- Compare across many boxes and many query points -- inside, outside, on a
  face, off an edge, off a corner, very close to the surface, and far away --
  and include boxes with extreme aspect ratios, where a formula that is
  secretly assuming a cube shows it.
- Do the same for the NORMAL against a numeric gradient, and for `rayHit`
  against bisection on the sign, at a much finer resolution than `box.test.js`
  uses. Report worst deviations with the query that produced them.
- If everything agrees, say so with the numbers and the resolution -- that IS
  the deliverable, and it is what lets the rest of the project rely on the
  primitive. If anything disagrees, stop and report the case: the box, the
  query, both answers, and the difference.
- Acceptance: the reference described well enough that someone could rebuild
  it, the comparison, and either a clean verdict with worst deviations or a
  reproducing case.
