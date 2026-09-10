# What a carve costs at query time (MUSE-23)

`node tools/carve-bench.js`, WSL node v22.23.2, 2026-09-10. Documents built
in the benchmark: N additive balls (r=0.9, spacing 2.2) with K subtractive
balls (r=0.6, straddling their target's surface, targets round-robin).
Points near surfaces, rays aimed at solids plus one miss.

Method: 5000-call untimed warmup, adaptive sizing to >= 250 ms per run,
three timed runs (min/med/max). Step counts replicate rayHit's own loop
against the public `distance()` bound with a counter; the bench throws if
the replica ever disagrees with `rayHit`, so the counts describe the real
loop. Absolute rates are about this machine; the ratios are about the
design.

## Calls/sec (median, with min-max spread)

| solids | carves | distance | normal | rayHit | mean march steps |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 21.13M (20.91M-22.62M) | 9.42M (9.39M-9.45M) | 13.01M (13.00M-13.08M) | closed form |
| 1 | 1 | 12.25M (12.24M-12.36M) | 6.57M (6.29M-6.85M) | 688.4k (679.9k-700.5k) | 96.0 |
| 1 | 2 | 9.93M (9.68M-10.01M) | 5.49M (5.47M-5.50M) | 586.2k (584.3k-586.9k) | 96.0 |
| 1 | 4 | 7.03M (7.02M-7.06M) | 4.20M (4.19M-4.28M) | 407.3k (406.3k-411.2k) | 96.0 |
| 1 | 8 | 4.48M (4.46M-4.49M) | 3.11M (3.10M-3.14M) | 258.8k (257.5k-260.0k) | 96.0 |
| 4 | 0 | 6.97M (6.93M-7.00M) | 3.90M (3.88M-3.92M) | 7.09M (6.89M-7.15M) | closed form |
| 4 | 1 | 6.04M (6.03M-6.06M) | 3.58M (3.53M-3.58M) | 383.8k (383.2k-384.8k) | 42.4 |
| 4 | 2 | 5.41M (5.39M-5.42M) | 3.31M (3.30M-3.31M) | 330.0k (329.0k-330.2k) | 42.7 |
| 4 | 4 | 4.35M (4.32M-4.36M) | 2.84M (2.82M-2.84M) | 257.0k (256.9k-257.9k) | 43.0 |
| 4 | 8 | 3.06M (3.04M-3.07M) | 2.29M (2.27M-2.33M) | 184.4k (179.2k-184.9k) | 43.0 |
| 16 | 0 | 1.95M (1.93M-1.96M) | 1.41M (1.40M-1.41M) | 3.00M (3.00M-3.02M) | closed form |
| 16 | 1 | 1.85M (1.81M-1.86M) | 1.34M (1.33M-1.34M) | 127.9k (127.6k-127.9k) | 22.8 |
| 16 | 2 | 1.77M (1.76M-1.79M) | 1.28M (1.28M-1.28M) | 125.9k (125.8k-126.3k) | 23.0 |
| 16 | 4 | 1.67M (1.64M-1.69M) | 1.23M (1.22M-1.24M) | 115.5k (115.1k-115.5k) | 23.0 |
| 16 | 8 | 1.42M (1.41M-1.42M) | 1.05M (1.04M-1.05M) | 92.6k (92.0k-94.4k) | 23.3 |

## Ratios to uncarved (median rates)

| solids | carves | distance | normal | rayHit |
| --- | --- | --- | --- | --- |
| 1 | 0 | 1.00 | 1.00 | 1.00 |
| 1 | 1 | 0.58 | 0.70 | 0.05 |
| 1 | 2 | 0.47 | 0.58 | 0.05 |
| 1 | 4 | 0.33 | 0.45 | 0.03 |
| 1 | 8 | 0.21 | 0.33 | 0.02 |
| 4 | 0 | 1.00 | 1.00 | 1.00 |
| 4 | 1 | 0.87 | 0.92 | 0.05 |
| 4 | 2 | 0.78 | 0.85 | 0.05 |
| 4 | 4 | 0.62 | 0.73 | 0.04 |
| 4 | 8 | 0.44 | 0.59 | 0.03 |
| 16 | 0 | 1.00 | 1.00 | 1.00 |
| 16 | 1 | 0.95 | 0.95 | 0.04 |
| 16 | 2 | 0.91 | 0.91 | 0.04 |
| 16 | 4 | 0.86 | 0.88 | 0.04 |
| 16 | 8 | 0.73 | 0.75 | 0.03 |

## Reading (observations, not verdicts)

- `distance()` degrades roughly as (solids + carves) / solids: each
  targeted carve is evaluated once per query on top of the solids
  (16 solids + 8 carves = 1.37x cost, measured 1/0.73). Untargeted
  carves would evaluate against EVERY solid instead — not measured
  here, and the configuration to measure next for exactly that
  reason, together with separating hit rays from budget-capped
  misses in the step means.
- `normal()` follows `distance()` at a milder slope (one winner
  evaluated, not the whole list).
- `rayHit()` has a cliff, not a slope: the first carve switches
  closed form (~3-13M/s) to marching (~0.1-0.7M/s), 20-50x, and
  further carves cost little on top. Mean steps fall as solids rise
  (96 / 43 / 23) because rays terminate sooner; the means include
  the miss ray, which spends the budget.
- No conclusion here about whether carving is "too slow" — that is
  the lead's call against solver budgets this task does not have.
