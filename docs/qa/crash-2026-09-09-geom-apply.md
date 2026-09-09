# Open crash: `apply()` given an undefined operand — 2026-09-09

**Status: NOT REPRODUCED, NOT FIXED.** The diagnostics that would identify it
are in place, and the coverage gap that hid it is closed. Read this before
re-investigating, so the ruled-out ground is not walked twice.

## The report

Playing the deployed build (GitHub Pages) in **arena fight**, after a few
seconds of moving around, the screen froze and the boot panel showed:

    THE PAGE DID NOT START
    Uncaught TypeError: Cannot read properties of undefined (reading '0')
    https://l3f1.github.io/NilGame/geom.js:80

## What that line is, and why the report was not actionable

`geom.js:80` is the first row of `apply`:

    export const apply = (M, v) => [
      M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12] * v[3],   // line 80

Reading `'0'` is `M[0]` **or** `v[0]`, so the message does not even say which
operand was undefined. `apply` is a leaf with roughly forty call sites across
`main.js`, `physics.js`, `hyp.js`, `level.js` and `modes.js`, and it is reached
indirectly through `logTo` (`apply(inv(M), q)`, hyp.js:158) and `toFrame`
(hyp.js:62), so an undefined argument to either of those lands on this same
line. **The line number identifies the leaf and says nothing about the caller,
which is the only thing that matters.** That is what made this unfixable from
the report, and it is what the diagnostic change below repairs.

Confirmed the deployed `geom.js` is **byte-identical** to the local file, so
line 80 is the same line, and the crash exists in current `main`.

Confirmed the message came from the **window `error` listener** in
`index.html` (`e.filename + ':' + e.lineno`), so the error was **uncaught** —
it came from the frame loop or an input handler, not from the menu's
`queueMenuChange` try/catch.

## Reproduction attempts, all negative

Roughly **40,000 frames** of real headless Chrome on the real GPU, driving the
actual module scope:

- arena fight, walking, 900–6000 frames per run, many seeds;
- the full kit fired at random (B, G, V, T, E, Q, F, H, portals 1/2/3, Z, C, X,
  K, R) plus the grapple held and released;
- preset selection by **card click** and by **digit key from a focused
  button / select / summary** — the path MUSE-04 newly enabled;
- world switching mid-run between `fight`, `hoops`, `grapple`, `light`;
- portal pairs placed and transited;
- a temporary guard inside `apply` itself that threw a labelled error naming
  which operand was undefined. It never fired. (Reverted;
  `geom.js` is unmodified.)

## Audited and ruled out by reading

Every `apply` call site reachable at runtime was checked for an argument that
can be undefined:

| Site | Verdict |
| --- | --- |
| `carryBeacon`, `carryPortals`, `settleCarried` | guarded by `if (beacon)` / `if (portals[i])` |
| `carryBlock`, `carryCut`, `carryDecoy`, `carryBoomerang` | iterate `Map.values()`; every field is set at construction |
| `carryTrail` | `trail` is pre-filled with 32 entries and `pop`/`unshift` keep the length |
| `dropDecoy` | `n` is clamped by `Math.min(SELF_HIST, …)` |
| `straddleImage`, `markCut`'s alt copies | guarded by `g ? … : q` |
| `reduceToDomain`, `foldPoint`, `foldElement` | always return a matrix; `IDENTITY` when nothing crossed |
| `fireGrapple` → `grappleAttach` | returns early unless `r.hit`; `cast` always returns a point |
| `anchorSwap`, `placeCut`, `launchAimed`, `boomRebase` | all fields assigned unconditionally |
| `alignUp` → `carryFrameVec(Ri, …)` | `alignUp` always returns three elements |
| `rotationBetween` | handles the parallel and antiparallel cases |
| `portalCrossing` | `portalsLive()` requires both portals |
| `spawnFoe`, `stepFoe`, `bump`, `nearestLift`, `orbitDist` | points come from `point(M)` of live placements |
| `engine/geometry/charts.js` | not in the runtime module graph (scene tooling and tests only) |

The remaining unaudited surface is the **network** path (`markCut(remote.cut.at,
remote.cut.N)` at main.js:2889 takes its normal straight from a packet and is
**not** guarded against a missing `N`). That is a real latent hole, but the
report was a `bot` opponent, so it is not this crash.

## What changed as a result

1. **`index.html` now reports the stack.** The panel prints
   `e.error.stack` — the throwing line *and its callers* — plus the column, and
   adds an `unhandledrejection` handler. It also shows only the FIRST error and
   counts the rest, because a dead frame loop throws every frame and the tenth
   copy used to overwrite the one that mattered.
2. **The headline is now honest.** `main.js` sets `window.__nilRan` on its
   first frame, so a crash during play says **THE GAME CRASHED WHILE RUNNING**
   instead of "THE PAGE DID NOT START". The old wording sent this
   investigation off to hunt a boot failure that never happened.
3. **`tools/play-check.js` closes the coverage gap.** See below.

Verified by injecting a crash of the same shape mid-play: the panel named
`apply`, `geom.js:80:4`, and both calling functions, and counted the
suppressed repeats.

## Why nothing caught it

`page-check --worlds` proves every world **starts**: it applies each preset and
runs a handful of frames. Nothing **played**. A bug that needs a face crossing,
a carried object and an ability to line up over thousands of frames was
invisible to the whole suite.

`node tools/play-check.js` now does that:

    node tools/play-check.js                                  arena fight, 3000 frames
    node tools/play-check.js --preset=hoops --frames=6000 --seed=7
    node tools/play-check.js --switch                         change worlds mid-run

Seeded input, so a failure replays exactly. It fails on any page error, a
non-finite placement, a NaN HUD — and on **zero face crossings**, because a run
that never folded never touched the code this exists to reach.

## When it happens again

The panel will now name the caller. Send the whole panel, not a screenshot of
the first line. The stack's top line is `apply`; **the second and third lines
are the answer.**
