# Seeded play sweep for the unreproduced geom.js crash — 2026-09-09 (MUSE-14, run by the lead)

The report was: on GitHub Pages, arena fight, after a few seconds of moving,
the screen froze with `Uncaught TypeError: Cannot read properties of undefined
(reading '0')` at `geom.js:80`. It has never been reproduced. Roughly 40,000
headless frames and a full call-site audit did not trigger it, so
`tools/play-check.js` and stack-printing diagnostics were shipped instead of a
fix.

This is the volume run. Machine: Windows 11, RTX 5070 Ti, Node v24.20.0, real
GPU with a cold shader cache on every invocation.

## Every run

| preset | seeds | frames/seed | total frames | crossings | result |
| --- | --- | --- | --- | --- | --- |
| fight | 1–3 | 3000 | 9,000 | 10 | ok |
| fight | 1–10 | 6000 | 60,000 | 57 | ok |
| fight `--switch` | 1–6 | 6000 | 36,000 | 7 | ok |
| hoops | 1–3 | 4000 | 12,000 | 25 | ok |
| grapple | 1–3 | 4000 | 12,000 | 13 | ok |
| sphere `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |
| nil `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |
| sol `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |
| sl2r `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |
| torus `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |
| street `--no-folds` | 1–3 | 4000 | 12,000 | 0 (none exist) | ok |

Every run exited 0. Not one produced a page error, a `geom.js` error, or a
non-finite HUD value.

## Verdict

**201,000 frames of play across 11 presets and 38 seeds, including 112 crossings
of a fundamental-domain face and 36,000 frames of mid-run world switching,
produced no `geom.js` error and no crash.**

That is roughly five times the volume behind the earlier "not reproduced", and
it now covers eleven presets rather than one. It does not clear `geom.js:80`;
it raises the cost of the hypothesis that this is a common path. The remaining
candidates are narrower than they were: something the probe does not do (a real
mouse, a window resize, a tab regaining focus, a device-lost recovery), or
something specific to the Pages build rather than the local one.

## The one defect this found, in the tool rather than the game

`play-check` failed **four presets on a rule that does not apply to them.** It
treats "no face crossings in any seed" as a failure, on the grounds that a run
which never folded proves little. That is right for a quotient world and wrong
everywhere else: the spherical, product and Lie-group worlds have no
fundamental domain at all, so there is nothing to cross, and the tool reported
FAIL on runs where the game was fine.

`main.js` states the mechanism: for a world with no quotient "the fundamental
domain, the face scan, the exact exit solve, the fold loop, the portals and all
39 level primitives are unreachable".

Fixed by making the expectation the caller's to state: `--no-folds` says this
world has no fundamental domain, and **without it the demand still stands**, so
the H3 case the rule exists to protect is unchanged. Verified both ways —
`--preset=nil --seeds=1 --frames=800` still FAILs without the flag. The
alternative, a table of which presets have folds, would have rotted silently
the first time a world was added.

Six presets became sweepable that were not before, which is why the table above
covers eleven rather than five.

## Limits

- `light`, `dropper`, `lap` and `race` were not swept; time, not a block.
- The probe drives synthetic input. It never resizes the window, never loses
  and regains focus, never suffers a GPU device loss, and does not use a real
  pointer. Those are exactly the paths a several-second freeze after ordinary
  movement might live on, and this sweep says nothing about them.
- Local build, not the Pages build. The report came from Pages.
- No crash reproduced, so no seed to hand over.
