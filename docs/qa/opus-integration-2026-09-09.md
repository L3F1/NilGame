# Integration review and push — 2026-09-09 (Opus)

Reviewed and integrated on Windows 11, PowerShell, node v24.20.0 (Windows) and
node v22.23.2 (WSL Ubuntu), branch `main`, starting from HEAD `b9b42e7` plus the
uncommitted Astra/Muse/lead working tree. Taking over as lead reviewer from
GPT Astra (usage limit). Nothing in the working tree was reverted.

## Verdicts

- **MUSE-06 accepted with a lead fix.** The POSIX process-group design is right
  and now has the real evidence it was asked for: WSL, `node
  browser-process.test.js` → **29 passed, 0 failed, 0 skipped, exit 0**, with the
  grandchild reaped by the group signal and an out-of-group sentinel surviving.
  A Windows regression blocked integration and was fixed here; see below.
- **MUSE-07 accepted as delivered.** 18 self-contained document cases with
  separate general/ball-host verdicts, literal rejection substrings, source
  non-mutation, snapshot immutability and full-precision round trip. Mutation-
  tested rather than trusted (below). Its checklist separates executed Node
  steps from cited lead browser/Godot evidence accurately.
- MUSE-01 through MUSE-05 were already accepted by Astra and were not reopened.

## The defect found at integration

`browser-process.test.js` gated its real-worker block on a runtime support
probe, but not on the platform. On Windows the probe spawned a `detached: true`
worker and then called `killOwnedChild(..., platform: 'posix',
posixProcessGroup: true)`. Measured directly on this host: `process.kill(-pid,
...)` throws **ESRCH on Windows** even for a live child. `killOwnedChild` reads
ESRCH as `already-exited` — correct on POSIX, wrong here — so the probe's assert
failed, and `reapStray(worker, true)` then attempted the same negative-PID kill
and swallowed its ESRCH.

Measured consequences, all on this host:

- the live detached worker held the suite's stdout pipe open, so `node
  browser-process.test.js` **never exited** (killed at 180 s);
- `node tools/test.js` reported `spawnSync ... ETIMEDOUT` and **19/20 suites**,
  breaking the existing green contract;
- **every run leaked an orphaned `browser-worker.js` node process**. Two were
  found still resident from two suite runs (PIDs 40616, 36796, parents gone) and
  were cleaned up by hand along with the hung suite and its child.

Fix, confined to MUSE-06's own allowed file `browser-process.test.js`:

1. a `POSIX_HOST` gate so the four real-worker tests skip with an explicit
   reason **before spawning anything** on win32;
2. `reapStray` falls back to a direct `child.kill('SIGKILL')` when the group
   address fails, so a stray can never be orphaned on any platform.

`tools/browser-process.js`, `tools/browser-profile.js`, `tools/page-check.js`
and the worker fixture were **not** touched. `killOwnedChild`'s ESRCH reading
was deliberately left alone: it is correct on POSIX, and the bug was calling the
POSIX path on Windows, not the reading itself.

After the fix: Windows **25 passed, 0 failed, 4 honest skips, exit 0 in 0.34 s**;
WSL still **29/29, 0 skips**; `node tools/test.js` back to **20/20**; no orphaned
worker processes remain. The regression guard is assigned as MUSE-08.

## Mutation testing of the MUSE-07 cases

A test set that cannot fail is worse than none, so the cases were checked
against deliberate defects in `engine/world/ball-scene.js`:

| Mutation | Result |
| --- | --- |
| Dropped the one-ball / entity-count host restriction | `doc-case no-ball` failed, exit 1 |
| `uniform()` returns its internal array instead of a copy | `uniform results are copies` failed, exit 1 |

`engine/world/ball-scene.js` was restored from a byte copy taken before the
mutations and re-verified green. No engine file is changed by MUSE-07.

## Verification run before pushing

Windows, node v24.20.0, sequential GPU checks:

| Check | Result | Exit |
| --- | --- | --- |
| `node tools/test.js` | 20/20 suites | 0 |
| `node ball-scene.test.js` | 18 cases, field, rays, round trip | 0 |
| `node browser-process.test.js` (Windows) | 25 passed, 4 skipped, 0.34 s | 0 |
| `node browser-process.test.js` (WSL) | 29 passed, 0 skipped | 0 |
| `node tools/scene-check.js` | 2 regions, 6 entities, 1 portal def | 0 |
| `node tools/scene-check.js levels/fixtures/ball-lab.nil.json` | 1 region, 2 entities | 0 |
| `node tools/shader-check.js` | all 10 programs compile and link | 0 |
| `node tools/sdf-check.js` | all 21 cases, worst 1.052e-4 within tolerance | 0 |
| `node tools/page-check.js --worlds --timeout=180` | real GPU, COLD, **346 checks**, 28.5 s, no page error, boot hidden, live HUD | 0 |
| `node tools/page-check.js --ball-lab --timeout=120` | real GPU, COLD, 9 checks | 0 |

All new and changed JS parses (`node --check`), all three fixture JSON files
parse, and every changed or new file is LF.

## Environment finding: headless Chrome works again

`docs/qa/overnight-results.md` records a long user-executed diagnosis ending in
"headless as a whole is non-functional on this host", with page loads, DOM dumps
and screenshots all dying silently. **That is no longer true.** A real-GPU cold
`page-check --worlds` ran here to a clean 346-check report in 28.5 s, and
`--ball-lab` likewise. Astra's unique-cold-profile fix plus the user's Chrome
update between then and now account for it. Treat those earlier
"VERIFICATION BLOCKED (browser)" notes as history, not as today's state. WSL's
socketpair block is unchanged and separate: browser checks still run only from
Windows.

Because headless is healthy, MUSE-04's strengthened focused-shortcut probe is
exercised on every `--worlds` run; Astra's recorded fail-before (reverted guard,
`FAIL shortcut: Digit9 from button selects street`) and pass-after (346/346) were
not re-run, as nothing about that guard changed.

## Deferred deliberately

POSIX warm-profile publication in `tools/page-check.js` stays **off**. The
group-exit evidence MUSE-06 was asked for now exists, but warm reuse also needs
one real Chrome run on POSIX to prove the profile is safe to republish, and the
WSL socketpair block still prevents that. Not a defect in the change.

## Left for the developer to verify by playing

Automated checks cover startup, world transitions, menu input, the distance
fields and the ball editor's callbacks. They do not cover feel. Worth a session:
the six-gate Nil spiral climb end to end; Sol and SL2R flight, where the pose is
a packed position and the labs are bounded; the H2xR dropper and S2xR lap
courses; K restarting a Sol/SL2R lab without creating a hidden H3 course (Astra's
F4 fix); digits 1-9 in the open world menu, with presets 10-13 still reachable by
card or Tab+Enter; and the E3 ball lab in both hosts, including a Godot-saved
file loading in the browser and back.
