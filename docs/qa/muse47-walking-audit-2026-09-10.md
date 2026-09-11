# MUSE-47: independent spherical walking audit (2026-09-10)

Independent references on actual compiled worlds: intrinsic height/up
against an independently lifted normal, analytic free fall with substep
refinement, metric speed, long rest, jump ballistics. No engine/app
changes. Durable test: `spherical-walking-truth.test.js` (10/10).
Two defects with executable reproductions, no repairs.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 556cd5f
```

## References (all hold)

- `height/up exact to 1e-9 across 4 configurations`: R=0.5/8/100 flat
  floors plus a tilted offset floor, off-center probes with nonzero
  along-floor coordinates.
- Free fall: errors 1.1e-2 at h=1/120 vs 2.8e-3 at h=1/480, ratio 4.00 —
  first-order convergence toward `h0 - g t^2/2`, and falling (directional
  pin: an isolated gravity-sign copy in /tmp rose 1.5000 → 1.9163 and was
  removed; repo untouched).
- Tangential walk: speed 2 for 1 s covers 2.0000 metrically, ends
  grounded. Rest: 600/600 frames grounded, height range 0, drift 0.
- Jump: separates from support (0.25 → 0.31 first frame), apex 1.1221 vs
  analytic 1.1389, lands re-grounded after 51 frames; mid-air jump keeps
  falling. Host edge-triggering verified by read: region-lab queues jump
  on non-repeat Space and consumes it per advance.
- Nonfloor obstacle: 60 frames into the rock, advance stops at the face
  (1.250), support stays floor-based; vertical aim ±1.5 rad finite.
- Invalid starts: center-in-solid, singular pole (reachable at an offset
  floor's in-domain pole), and hand-built off-chart point all resolve
  visibly with zero time consumed. Carved and ball floors refused at
  construction.
- Clock/budgets: consumed + remaining = dt; maxSubsteps=0 exhausts with
  zero consumption; work bounded (75/23040); input state byte-identical
  after step.
- Real debt: tilt slide at maxSteps 8 owes 6.6e-3 with continuation, no
  auto-resume; explicit resume walks 6.6e-3 with a zero clock; walking
  after resumes grounded with no debt left.

## Defect 1 (§pin-crash): pinning against a ball throws

Walking into the rock from clear ground rides up it (~0.018) while
`|p|-1` grows 4.4e-16 → 2.9e-14 → 2.5e-13 → 7e-13; at frame 113 a
tangency check throws `S3 vector must be tangent at its point`
mid-session. A status was owed, not an exception. Pinned in the suite
(120-frame pin asserts the throw; flips on fix). Repro: floor + ball at
[0,2,0.25] r=0.5, R=8, start [0,0,0.25], wish [0,1] speed 2 at 1/60 —
throws at frame 113. Starting pinned (y=0.5/1.0) never throws; the climb
after approach is the trigger.

## Defect 2 (§ceiling): a ceiling is accepted as the floor

A down-facing plane passes construction as floorId, and support grounds
the walker beneath it: 120/120 frames grounded at height 0.250 under a
plane at z=2 facing down. NEXT_CAPABILITIES §2 requires unsupported
floors — carved, balls, ceilings — to be refused visibly. Pinned in the
suite (120/120 grounded; flips on fix). Repro: floor entity at [0,0,2]
up [0,0,-1], stand at [0,0,1.75].

## Limits

Sampled routes only: clean normal impacts, one funnel rattle, one tilt
slide, one obstacle approach. No claim generalizes to all support
configurations. Outside-domain is reachable only via hand-built points
(decode cannot produce one); the singular pole only via offset floors.
Jump edge-triggering at the host level verified by read, not by a
browser run (Node-only per task).
