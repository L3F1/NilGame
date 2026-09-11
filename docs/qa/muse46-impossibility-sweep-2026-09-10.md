# MUSE-46: impossibility-claim sweep (2026-09-10)

Sweep for "cannot" language that something depends on — dead branches,
construction guarantees, never-invariants — across `engine/world`,
`docs/engineering`, `docs/qa`, `app`. Each row was tested by breaking it,
not by re-reading the reasoning (MUSE-45's reversal is the standing
warning: an audit that repeats the author's mechanism confirms the
mechanism, not the behaviour). One falsification found, in explicitly
unclaimed territory. No repairs made.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 556cd5f
```

## Table

| claim | verdict | check that guards it |
|---|---|---|
| S3 resume cannot reach domain | FALSE (repro in suite) | new: impossibility-audit |
| sweep cannot tunnel, any speed | HOLDS (0/22 + balls) | indirect; fuzz missing |
| probe never lands on a surface | HOLDS (min gap = skin/2) | unbacked as stated |
| crossing never lands on aperture | HOLDS (exit = -4.00e-4) | indirect via arc sums |
| camera handedness cannot flip | HOLDS (0/2000 turns) | construction only |
| degenerate never completes | HOLDS (unresolved/stopped/throw) | backed |
| rewind stays on the leg | HOLDS (gap 0.00e+0) | backed (MUSE-41 pins) |
| domain beats portal at the edge | HOLDS (per ordering code) | backed |
| continuation cannot be reused | HOLDS (spent on use) | backed (MUSE-45) |
| bound never overestimates | assumption on inputs | per-scene (MUSE-40) |

## The falsification: S3 resume reaches the chart edge

The E3 mechanism transposes whole: wall edge-side of the walker (plane
x=5.9, extent 6, R=8), diagonal impact banks a 5.52e-2 lift, the walker
slides tangentially with the debt intact to r=5.9678, and the settle
target lands outside. The resume reports
`unresolved/correction-boundary` on `{kind:'domain',
phase:'correction', portalId:null}` at 0.0339 along the residual —
moving nothing, keeping the debt, issuing no continuation.
`impossibility-audit.test.js` (1/1) pins the full signature.

Two S3-specific tripwires, both behavioural: (1) a penetrating start
kills the tangential slide (lateral motion 0.0000; touching starts slide
0.048+), so the recipe needs a touching start with an exactly-tangent
velocity — hand-built tangents via radial subtraction fail validation
(the subtraction mixes tangent spaces) and frame basis vectors must be
used directly; (2) near-edge tangential motion exits fast (a contact-free
slide from r=5.99 domain-exits after 0.064), so the debt endpoint has to
arrive slid, not start slid.

## Holds, with their backing stated precisely

- **No tunneling** (`collision.js:20-21`): thin box wall (half 0.02) at
  speeds 1..1e6 plus thin-ball sweep fuzz — 0 pass-throughs in 22 runs,
  min contact gap exactly skin/2. Indirectly backed (analytic-contact
  position asserts would break on pass-through); no direct no-tunnel
  fuzz exists. Cheapest check: the thin-wall × speed sweep asserting
  side-preservation with empty contacts.
- **Never lands on a surface** (`collision.js:262`): contact corpus min
  |clearance| = 5.00e-5 = skin/2, zero exact-zero landings. Unbacked as
  stated. Cheapest check: min-clearance assert over a contact corpus.
- **Never lands on the aperture** (`collision.js:287`): exit height at
  the commit is exactly -4.00e-4 (the `skin*4` offset) across approaches,
  never 0. Indirectly backed (exit-offset aggregates in
  region-motion-truth arc sums). Cheapest check: per-commit exit-height
  assert.
- **Handedness** (`camera-frame.js:56`): 2000 random turn triples, zero
  flips. Backed at construction only (camera-frame.test.js asserts
  right = forward × up for built frames, not across turn/mapFrame
  paths). Cheapest check: the fuzz itself.
- **Degenerate never completes** (NEXT_CAPABILITIES.md:34): ball-center
  with velocity → unresolved; still → stopped (not complete); through-
  center → stopped; resume-across → unresolved; NaN field → throws
  `Geodesic travel must be finite`. Backed (degenerate rows in
  motion-pause-truth and correction-resume suites).
- **Rewind on the leg** (`region-motion.js:260`): refused checkpoints
  satisfy the approach-segment triangle equality to 0.00e+0 across 4
  refusals. Backed (MUSE-41 absolute pins).
- **Domain before portal** (claude-region-motion:168): ordering code
  read; region-motion.test.js beyond-edge case backs it. Not re-attacked
  (covered ground).
- **Continuation single-use** (NEXT_CAPABILITIES.md:41): backed (MUSE-45
  double-present + splice rows).
- **Uncertifiable-checkpoint unreached** (claude-region-repair:158/189):
  previously hunted (MUSE-41 era), still unreached; not re-hunted —
  duplicating that hunt adds nothing.
- **Bound never overestimates** (`collision.js:7`): load-bearing
  assumption on field inputs, not a kernel theorem; per-scene evidence
  is MUSE-40's face-limited proof. Noted, not attacked.

## Adjacent note (not an impossibility claim, not repaired)

A zero-velocity start at a ball center reports `stopped` with the endpoint
still at the center (clearance -1.25, adopted silently, no contact, no
debt). The T6 claim holds — stopped is not complete — but a host standing
still inside a solid is never examined. Verbatim behaviour, recorded for
the lead's triage.

## Bottom line

1 falsification (S3 chart edge, reproduced in the suite), 9 holds with
backing graded backing/indirect/unbacked, 1 adjacent note. Four holds
want their stated check (tunnel fuzz, min-clearance, exit-height,
turn-fuzz); all four are cheap. No repairs made.
