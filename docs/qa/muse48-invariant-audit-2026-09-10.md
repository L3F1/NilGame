# MUSE-48: four sampled invariants as named regression checks (2026-09-10)

MUSE-46's four missing checks on actual compiled worlds, with their
original input assumptions: a VALID EXTERIOR distance bound (exact
planes/balls, never a conservative composite) and a NON-OVERLAPPING start
(every start asserts clearance > 0 first). No engine/app changes. Durable
test: `invariant-evidence.test.js` (4/4). No counterexamples found on the
sampled inputs; one targeted fail-demo proves the exit-side check fires.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ d3160ba
```

## Checks (all hold; every number measured, none quoted from code)

- `swept-path-stays-outside`: E3 thin box wall (half 0.02) at speeds
  1..1e6, 35 seeded runs, 30 engaged, 0 opposite-side arrivals with empty
  contacts. S3 small ball (r=0.05) raw sweeps at speeds 1..1e5 with seeded
  grazes, 20/20 verdicts agreeing with an independent dense-trace oracle
  of the signed surface-distance field (20000 samples over one great-circle
  period; S3 geodesics repeat, so one period is the whole story at any
  speed). The oracle checks both directions: it would
  convict a tunnel the sweep missed AND a hit the sweep invented.
- `contact-margin-above-zero`: 54 seeded contacts across floor/wall/ball/
  corner scenes (E3) plus S3 floor drops, every contact at strictly
  positive clearance, measured min `5.08e-5` — clusters at safetyMargin =
  skin/2, as expected; the assert pins > 0, not the value.
- `committed-crossing-leaves-source`: the exit MOMENT is frozen
  (dt = time-to-gate + 1e-6), so post-exit travel (< 1e-5) cannot hide the
  offset. 6/6 E3 exits land at x in `[4.04e-4,4.06e-4]` past the gb anchor
  (exitOffset = 4 * skin = 4e-4, plus ≤ 6e-6 of post travel), transverse
  preserved to 1e-9; S3 exit at author z = `-1.999596` (go anchor −2 plus
  the same offset). One obstructed-exit refusal holds status
  `blocked-exit` in region a with the checkpoint strictly source-side.
- `camera-frames-stay-right-handed`: 1000 seeded basis-built frames through
  the turn path (the unpinned path; construction was already covered),
  E3+S3, triple product min `9.14e-1`, all > 0.

## Fail-demo (isolated, repo untouched)

`/tmp/m48fail`: engine + root modules + the unmodified test, with
`exitOffset = 4 * skin` → `0` in the copy only. Result: 3 pass, check 3
fails loud — `seed 0: exit offset missing (x=0.00000596...)`, i.e. the exit
sits on the aperture plus only post-travel. Copy removed afterwards; `git
status` shows no engine modification.

## Reference limitations (what this is not)

- Sampled evidence, not proof: 35 + 20 + 64 + 7 + 1000 configurations
  across four checks. Universal claims ("never tunnels", "always
  destination-side") are NOT established — a narrower seed, a composite
  field whose exterior bound is conservative rather than exact, or an
  overlapping start (explicitly excluded by requireClear) can behave
  differently.
- The S3 oracle resolves dips to ~1e-3 in field value; a graze inside that
  band is neither convicted nor acquitted.
- The exit-side numbers depend on the freeze trick (dt = time-to-gate +
  1e-6); with a full dt the post-exit travel dominates the offset and the
  same signedHeight reads source-side-looking — verified by measurement,
  not by reading the sign convention (an early version of this check
  asserted the wrong sign and the seeds corrected it).
- An early tunnel detector (author-x crossing + no hit) false-alarmed on a
  clean S3 miss; it was replaced by the field oracle after a probe showed
  the field is signed surface distance (center −0.05, surface 0.25 at
  author 0.3). The detector, not the kernel, was wrong.

## Revision (Astra review)

Checks 2 (margin) and 3 (exit) are preserved unchanged. Checks 1 and 4
were revised bullet by bullet; measured on the same host:

```text
E3 35 runs (30 engaged) min committed clearance=5.00e-5 statuses={"complete":5,"stopped":30}
S3 35 sweeps: 16 oracle-hits, 15 clean misses, 4 inconclusive (band), min envelope gap=5.00e-5
1200 turn/transport rounds E3+S3, min local det=1.00e+0, worst Gram dev=6.66e-16, S3 4D sign constant, 40 reflection controls negative
```

- Handedness is now the determinant in local tangent coordinates
  (intrinsic dots against space.frame), not the xyz-projection triple
  whose magnitude carried chart foreshortening. Construction pins det
  +1 exactly (measured 1 E3, 1 S3 with det4 ≈ 1); 30-round repeated
  turn+transport paths on one frame (carryAlong over real
  stepWithTransport legs) keep local det at 1.00e+0 minimum, Gram
  deviation ≤ 6.66e-16, S3 tangency and 4D-orientation sign constant.
  Forty reflected copies (one axis negated) all read negative — the
  control proves the determinant is sign-sensitive, not tautological.
- The oracle band is explicit two-tier: coarse min within BAND1 = 2e-3
  of the envelope refines with a 20000-sample local trace; inside BAND2
  = 2e-4 the ray is counted inconclusive with no verdict asserted.
  Engineered grazes (bisected: 0.2595 resolves HIT, 0.2603 MISS,
  0.259891 with true min 0.25 − 4e-7 stays inside) exercise all three
  outcomes: 16/15/4 across 35 sweeps. Every S3 start asserts clearance,
  and every sweep hit is checked against the player radius (min envelope
  gap 5.00e-5): an outside center with a penetrating body would fail.
- The E3 side is now labeled what it is — an endpoint sign detector
  over committed states, not a swept proof — with clearance asserted on
  every contact sample and every final state (min 5.00e-5), which is the
  only place a contact-followed-by-penetration could show.

Fail-demos (isolated /tmp copies, repo untouched, removed after): (1)
exitOffset → 0 fails check 3 with `seed 0: exit offset missing
(x=0.000005962582122374982)`, other three pass; (2) mirrored cross
product (`-cross[i]` in createCameraFrame) fails check 4 at construction
with `construction det is +1`, other three pass. invariant-evidence
4/4 on the unmutated tree.
