# MUSE-44: does anything else feed a refusal forward? (2026-09-10)

Sweep of every place that consumes a motion or walker result and carries its
state into a later frame. Read against the CURRENT `app/region-lab.js`
(which consults `motionPause`, counts refusal runs, and is covered by
browser checks for debt / unresolved / carry-on). No repairs made.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ f835d06
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
chrome    : /mnt/c/Program Files/Google/Chrome/Application/chrome.exe
  starts  : NO -- <3>WSL (26 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1
queue     : worker on LeoPC (win32), pid 38432
VERDICT: browser checks run THROUGH THE QUEUE here.
```

Method: `moveRegionProbe` / `moveProbe` / `stepWalker` / `sweep` /
`collide` / `resolveOverlap` call sites across `app/`, `levels/`,
`tools/`, arena roots (`main.js`, `physics.js`, `racing.js`, `port.js`).
Test files and docs excluded (no frame carry). Each site below was read;
the two live loops (`region-lab advance`, `ball-lab frame`) were traced
line by line; the structural debt-drop claim is reproduced, not asserted.

## Verdicts

| site | non-completion | owed correction | verdict |
|---|---|---|---|
| region-lab `advance` | halts via motionPause | halts, reset only | consults; sound |
| region-lab resume/reset/edit | new request / spawn / clears halt | resume refused | consults; sound |
| region-lab metrics + run count | shown every frame | shown with distance | loud; sound |
| region-lab chart-edge probe | asserts only, no carry | n/a (no carry) | no carry |
| ball-lab `frame` loop | noted, carries on | dropped (latent) | E3 shape; see note |
| ball-lab `reconcile` | pushed / respawned | n/a (edit path) | consults; sound |
| ball-lab checks + sweep probe | asserts only, no carry | n/a (no carry) | no carry |
| walker `stepWalker` | passes stalled/blocked up | drops the key | structural drop |
| arena `main.js` + `collide` | no status exists | no debt exists | legacy; no status |
| levels, tools, racing, port | no consumers found | n/a | nothing to carry |

## Site notes

- **region-lab `advance` (app/region-lab.js:229-262).** Adopts the kernel's
  last validated state, counts `refusalRun` (reset by complete/stopped),
  spends this frame's own dt only, and halts on any `motionPause` reason.
  A halted session issues no further requests (`motion` object identity is
  browser-asserted). Unspent time is never accumulated. Debt and status are
  both consulted, debt first via `motionPause`. Sound.
- **region-lab recovery (L65-82, L176-220, L286-295).** Resume requires
  `halted.resumable` (debt disables it) and starts a NEW request from the
  validated state with `motion = null`. Reset returns to the validated
  spawn. Scene edits and fresh play clear the halt. Sound.
- **region-lab loudness (L34-42, L131-140).** The MUSE-43 condition is
  implemented where it belongs: the refusal run is counted on the page,
  debt shows its distance, and the 24-frame chart-edge browser check
  asserts every refused frame is charged exactly its own dt. Sound.
- **ball-lab `frame` (app/ball-lab.js:395-426).** E3 walker, different
  result shape: no status, no clock — `{position, velocity, grounded,
  contacts, stalled, transits, blocked}`. Contacts/blocked/stalled become
  notes; the state is always carried into the next frame with a fresh
  fixed dt (no accumulation possible). Blocked-portal carry-on matches
  region-lab's blocked-exit treatment (retreat stays possible). Stalled
  carry-on retries with a full fresh budget each frame, the same logic
  MUSE-43 adjudicated sound for debt-free budget exhaustion.
- **walker `stepWalker` (engine/world/walker.js:64-98).** Returns no
  `pendingLift` key although its inner `moveProbe` can owe one — proven by
  the reproduction below. Latent, not live: with the default budgets
  `stepWalker` always uses, every constructed correction paid in full
  (debt appeared only with tightened caps, which `stepWalker` never
  passes). No status exists to consult; that is the E3 shape, stated, not
  forced into region-motion vocabulary.
- **ball-lab `reconcile` (L209-218).** Edit-time overlap only:
  clear/pushed (push out, stop) / trapped (respawn). Consults its status
  fully. Sound; not a motion path.
- **arena (main.js:1526-1527, 2671-2686; physics.js:250).** `stepFree`
  then `collide`: push-out along the geodesic plus velocity-kill, adopted
  unconditionally, `grounded` from the normal. No status, no debt, no
  budgets — the vocabulary does not exist at this layer. Note: the push
  loop caps at 4 iterations and adopts wherever it stops; a burial deeper
  than 4 pushes is stood upon, not reported. Legacy characteristic, not a
  refusal-forwarding defect in the MUSE-43 sense (there is no refusal to
  forward).
- **levels/presets.js, tools/*, racing.js, port.js.** No motion-result
  consumers. `tools/world-probe.js:190` is a comment. Portal transit in
  ball-lab (`carryThroughPortal`) maps the camera on `transits`, which are
  completions, not refusals.

## Reproduction: the `stepWalker` debt-drop (structural, latent)

Run: `node /tmp/repro44.mjs` (script below). A 5.75-deep burial owes
nothing under default budgets (degenerate contact), yet the interface
drops the key unconditionally:

```text
moveProbe defaults: {"stalled":true,"exhausted":"degenerate-contact","pendingLift":null,...}
stepWalker keys: position,velocity,radius,grounded,contacts,stalled,transits,blocked
stepWalker pendingLift: undefined | stalled: true
stepWalker same state drops debt: true
```

`moveProbe` CAN owe (`settle-budget.test.js` pins it on a conservative
field; MUSE-43's cap ladders owed on ordinary scenes through the
coordinator); `stepWalker` could not forward it because the key is absent
from its return shape (walker.js:94-98). Unreachable with the default
budgets `stepWalker` always uses — hence latent — but one custom-budget
call path away from live. Repro script:

```js
import { e3Space, moveProbe } from './engine/world/collision.js';
import { stepWalker } from './engine/world/walker.js';
import { compileSceneField } from './engine/world/scene-field.js';
// ... burial scene: ball radius 6 at origin, probe at centre ...
const mp = moveProbe(field, space, st, 1 / 60);
const sw = stepWalker(field, space, { ...st, grounded: false }, 1 / 60, { want: [0, 0, 0] });
console.log(Object.keys(sw).join(',')); // no pendingLift
console.log(sw.pendingLift === undefined); // true
```

## Bottom line

`region-lab` is clean: it consults status and debt, halts, counts, and
reports. Everything else either has no refusal vocabulary (arena), a
different result shape carried on soundly with fresh budgets (ball-lab),
or no consumption at all. The single wrong-looking site is the
`stepWalker` return shape dropping `pendingLift`; it is latent with
default budgets and its reproduction is above. No repairs made.
