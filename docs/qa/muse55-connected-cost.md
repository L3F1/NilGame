# MUSE-55: connected CPU query cost

Tool: `tools/connected-sight-bench.js` — repeats the existing `sampleSight`
grid from `tools/connected-sight-probe.js` for all three `POSES`, one Node
thread, no renderer/shader/GPU. Defaults: grid 96x72 (6912 rays), fov 70,
range 32, work 2048, 2 warmups + 9 measured repeats. First sample kept as
first-for-pose and excluded from statistics. Reviewer correction: only the first
pose is the first sample in-process; later poses share warmed code. These are
not shader/OS cold starts. Counts/work compared across all
9 repeats; the tool exits 1 on any mismatch. `--repeats` capped at 25,
`--warmups` at 5, grid at 65536 px; non-positive integers rejected (exit 2).
JSON to `--out`.

## Host

- CPU: AMD Ryzen 7 9800X3D 8-Core Processor x16
- OS: linux 6.18.33.2-microsoft-standard-WSL2 x64 (LeoPC, WSL)
- Node: v22.23.2; scene: `levels/fixtures/connected-sight.nil.json`
  (id `connected-sight`); HEAD `320d92e`
- host-probe verdict: browser checks UNAVAILABLE here (no AF_UNIX; no queue
  worker). Node-only task; no browser run required.

## Observed (9 measured repeats, ms; NOT GPU frame times)

| pose | wall min/med/p90/max | query-only min/med/p90/max | cold wall/query |
|---|---|---|---|
| entry-spawn | 47.12/51.51/57.34/59.74 | 40.74/44.98/49.34/53.50 | 163.52/147.51 |
| doorway | 161.91/176.59/228.14/239.61 | 152.27/165.99/210.31/221.82 | 179.51/168.69 |
| far-spawn | 35.22/42.18/47.78/59.78 | 28.76/34.82/38.98/50.39 | 59.40/48.26 |

Wall minus query (~6–10 ms per 6912-ray sample) is pixel loop/colour
bookkeeping and measurement overhead, not just query work. The cause of the
timing spread was not isolated; counts/work were identical despite that spread.

## Work, counts, budget

| pose | work min/med/p90/max | total | at-budget | status | unresolved |
|---|---|---|---|---|---|
| entry-spawn | 3/3/32/58 | 53325 | 0 | hit 4141 | domain-exit 2771 |
| doorway | 45/45/50/52 | 320584 | 0 | hit 5662 | domain-exit 1250 |
| far-spawn | 3/3/4/4 | 24153 | 0 | hit 3495 | domain-exit 3417 |

`domain-exit` is the only unresolved reason on all poses; zero rays hit the
work budget. Deterministic across repeats: yes (exit 0).

## Checks

- `node --check tools/connected-sight-bench.js` — clean.
- `node tools/connected-sight-bench.js --out /tmp/muse55-bench.json` — exit 0,
  output above; JSON keys: what/host/revision/scene/defaults/deterministic/
  mismatches/poses.
- Guards: `--repeats 0` → error, exit 2; `--repeats 26` → over cap, exit 2;
  `--bogus 1` → unknown option, exit 2.

No kernel, fixture, test or queue files touched. No dependencies added.

READY FOR REVIEW
