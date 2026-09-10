# Raycast cost, re-measured (MUSE-35) — 2026-09-10

Command: `node tools/raycast-bench.js` (Node v22.23.2, linux x64,
AMD Ryzen 7 9800X3D 8-Core, 16 threads). Engine defaults throughout:
maxSteps 2048, hitEpsilon 1e-6, maxDistance extent*8. 3000-ray warmup per
cell, five timed runs, min/median/max microseconds per ray. Medians below
reproduced across three invocations within ~5% (march step counts exact).

THIS SAYS NOTHING ABOUT FRAME TIME. CPU ray throughput is not a GPU
number. Do not promote it into one.

## Table (µs per ray, median of five runs; hit/miss/indet are OBSERVED)

| scene | bucket | method | n | hit | miss | indet | stepsMed | usMed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plain-3 | hit | analytic | 6 | 6 | 0 | 0 | - | 1.55 |
| plain-3 | hit | march | 6 | 6 | 0 | 0 | 13 | 1.42 |
| plain-3 | miss | analytic | 6 | 0 | 6 | 0 | - | 1.12 |
| plain-3 | miss | march | 6 | 0 | 6 | 0 | 7 | 0.92 |
| plain-3 | graze | analytic | 6 | 3 | 3 | 0 | - | 1.10 |
| plain-3 | graze | march | 6 | 3 | 3 | 0 | 49 | 4.53 |
| carve-1 | hit | analytic | 6 | 6 | 0 | 0 | - | 1.82 |
| carve-1 | hit | march | 6 | 6 | 0 | 0 | 13 | 1.54 |
| carve-1 | miss | analytic | 6 | 0 | 6 | 0 | - | 1.45 |
| carve-1 | miss | march | 6 | 0 | 6 | 0 | 7 | 1.12 |
| carve-1 | graze | analytic | 6 | 3 | 3 | 0 | - | 1.47 |
| carve-1 | graze | march | 6 | 3 | 3 | 0 | 49 | 5.60 |
| carve-8 | hit | analytic | 8 | 8 | 0 | 0 | - | 3.68 |
| carve-8 | hit | march | 8 | 8 | 0 | 0 | 13 | 3.33 |
| carve-8 | miss | analytic | 8 | 0 | 6 | 2 | - | 3.20 |
| carve-8 | miss | march | 8 | 0 | 8 | 0 | 7 | 2.71 |
| carve-8 | graze | analytic | 8 | 4 | 4 | 0 | - | 2.96 |
| carve-8 | graze | march | 8 | 4 | 4 | 0 | 49 | 12.97 |
| concentrated | hit | analytic | 8 | 8 | 0 | 0 | - | 2.81 |
| concentrated | hit | march | 8 | 8 | 0 | 0 | 13 | 2.80 |
| concentrated | miss | analytic | 8 | 0 | 8 | 0 | - | 2.22 |
| concentrated | miss | march | 8 | 0 | 8 | 0 | 7 | 2.19 |
| concentrated | graze | analytic | 8 | 4 | 4 | 0 | - | 2.02 |
| concentrated | graze | march | 8 | 4 | 4 | 0 | 49 | 10.73 |
| coincident | hit | analytic | 3 | 3 | 0 | 0 | - | 1.87 |
| coincident | hit | march | 3 | 3 | 0 | 0 | 2 | 2.06 |
| coincident | miss | analytic | 2 | 0 | 2 | 0 | - | 1.00 |
| coincident | miss | march | 2 | 0 | 2 | 0 | 6 | 2.00 |
| coincident | graze | analytic | 2 | 1 | 1 | 0 | - | 1.54 |
| coincident | graze | march | 2 | 1 | 1 | 0 | 216 | 34.09 |

(Full min/max in the bench output; medians above. Run the command.)

## What the table says

- The 20-50x cliff is gone. First carve on hits: analytic 1.55 -> 1.82
  (~1.2x), march 1.42 -> 1.54 (~1.1x). Eight carves: ~2.4x analytic,
  ~2.3x march. Nothing here resembles MUSE-23.
- Concentrated (6 carves on one of four balls) is cheaper than spread
  (8 over four): analytic hit 2.81 vs 3.68. The per-group change shows
  up where it was aimed.
- March costs extra only where it walks: grazing rays, 3-5x analytic
  (49 steps), because each skim step advances ~epsilon. Misses are
  cheap for both (march exits in 6-11 steps; analytic barely starts).
- Worst ratio measured: 22x, one ray riding the coincident face plane
  (analytic miss 1.5µs, march miss 34µs in 216 steps). Narrow, deep,
  and the only thing in the table above 5x.
- Give-ups: analytic declined twice (carve-8 away-rays past carved
  balls: status indeterminate, march calls them miss in 6 steps).
  **REVIEW FOUND THIS TO BE A DEFECT, now fixed** -- see the note below.
  Re-run after the fix, that cell reads 8 miss / 0 indeterminate on both
  methods; every other number in the table is unchanged.
  March never exhausts at the default 2048 budget -- zero
  indeterminates in 100+ marched rays, so the category stands empty
  rather than folded into "miss".
- The two methods agree on hit/miss everywhere except the two
  analytic-indeterminate rays above. No contradictions to explain.

## Since MUSE-23, in one sentence

MUSE-23 measured rayHit throughput when any modifier forced the whole
scene through the marcher; rayCast now resolves analytically per solid
group by default, so a carve costs ~10-20% on hits and marching is
opt-in under method: 'march' -- the cliff survives only as a grazing-ray
premium, worst 22x on one plane-riding ray.


## Lead note, 2026-09-10: the two analytic give-ups were a bug

Muse reported the give-ups honestly and left them in the table, which is
what surfaced them. Chased down on review, they were not a limit of the
analytic method at all.

Both rays start clear of everything, aimed AWAY from the whole scene, and
happen to lie exactly tangent to a cutter sphere BEHIND their origin (the
distance from the ray line to `c5` is 0.5 against a radius of 0.5, at
`t` around -6). `primitiveRayInterval` reported that near-tangency, and
`csgRayCast` recorded it through

    const note = (t) => { uncertainty = Math.min(uncertainty, Math.max(0, t)); };

The `Math.max(0, t)` moved an ambiguity six units behind the ray to the
ray's own origin, where `uncertainty <= best` always holds -- so the cast
returned `indeterminate` from a standing start with an empty sky ahead.

It cannot matter what happens behind the origin: the uncertain span carries
no measure, so adding or removing a point at `t < 0` leaves every forward
interval exactly where it was. `note` now discards a `t` behind the origin
by more than the local tolerance, and keeps the clamp for one that straddles
it, where occupancy at `t = 0` genuinely is in doubt. Pinned by a contract
test that fails without the change (`query-contract.test.js`, "an ambiguity
behind the ray does not forfeit the answer ahead of it").

Worth knowing how it stayed hidden: exact tangency is vanishingly rare in
random geometry and ordinary in AUTHORED geometry, where things sit on
grids and a ray shot backwards along an axis grazes a solid at exactly its
radius. Rays aimed away from the scene are also exactly the shadow-ray
pattern. A bench built to compare two methods on the same rays found it
because the two methods disagreed, which no single-method measurement
would have shown.
