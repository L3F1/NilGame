# Controls and menu review — MUSE-01 (rev 2, after Astra review)

Method: static code/doc comparison by Muse, plus runtime K/fog checks
executed by the reviewer (Astra) through `tools/preview.js` in `MODE=dom`
with a review-only injected probe (Windows Node v24.20.0, headless Chrome,
SwiftShader; final output `FRAMES_DONE`, `error: (none)`). Static claims cite
the file and line read; reviewer-executed results are labeled as such.
Muse's probe `/tmp/muse01-probe.py` 27/27 is Muse-reported, not
reviewer-reproduced. No core code touched.

Files read: `MUSE.md`, `docs/engineering/WORKING_RULES.md`, `README.md`,
`levels/presets.js`, `app/menu.js`, `main.js` (options block ~560–608,
presets ~1199–1237, key handling ~1299–1399, flight ~1956–1996, course
~2029–2119, fog ~2950–2957, climb notes ~1878–1884, ~3195–3196),
`engine/geometry/nil-renderer.js`, `engine/geometry/registry.js`,
`docs/playground.md` (controls table), `docs/rendering-contract.md`.

## What the menu shows today (verified in code)

- 13 preset cards in `PRESET_KEYS` order, badged `NN / curv`
  (`app/menu.js:36`, `levels/presets.js:98`). Relevant cards:
  `06 / H^2 x R` The dropper · `11 / Nil` Nil spiral climb ·
  `12 / Sol` Sol stretch chamber · `13 / SL2R` SL2R twist chamber.
- Locked settings render greyed with `Fixed: <reason>`
  (`app/menu.js:97-100`, reasons from `forcedWhy` in `main.js`).
- Footer advertises `1–8 choose a world` (`app/menu.js:25`).
- Keyboard: `O` opens, `O`/`Esc` closes (`main.js:1302-1306`); `Tab` is
  trapped in the dialog and `Enter`/`Space` work natively on cards and
  selects (`app/menu.js:51-61`). `R` respawns and restarts an active course
  (`main.js:1332,1949-1954`); `K` turns the course on if off, then starts
  the run (`main.js:1360-1374`). Arrows: with focus on a select/button/
  summary the guard returns early so the control behaves natively
  (`main.js:1307-1308`); with focus elsewhere the legacy `optSel` branch
  (`main.js:610,1313-1322`, unknown to `app/menu.js`) retunes an internal
  option index, not whichever DOM option is focused.

## Per-world expectations

### Nil spiral climb (preset: `curv Nil`, `course climb`, `fog off`)
- Locks (`main.js:1059-1070`): Gravity none ("down is not a gradient in
  Nil"), Camera up free ("the stabiliser is only SO(2)"), Course climb
  ("the climb is what Nil is for"), Light instant, Domain edges hide,
  foe/boomerang/build/portals off ("hyperbolic only").
- Free flight maps `Space`/`Shift` to view-up/down alongside WASD
  (`main.js:1956-1974`); the climb is flown, not walked.
- `Fog off` = fog-density factor 0 (`main.js:2952`). Range guards are
  separate: beacon marching is limited to 70 (`nil-renderer.js:20`),
  analytic column hits carry a 4096 guard (`nil-renderer.js:29`), and the
  70.0 `uMaxT` upload (`main.js:2955-2957`) feeds the legacy marcher, not
  the new renderer's column range. The climb itself rises 60 units
  (`main.js:1884,3196`), not 70. The technical account lives in
  `docs/rendering-contract.md`; no player-facing menu/controls text says
  any of this (finding F2).

### The dropper (preset: `curv H^2 x R`, `course dropper`, `fog thin`)
- Locks (`main.js:1083-1094`): Gravity floor plane ("the floor is z = 0"),
  Camera up free ("the frame never tilts"), Course dropper ("the mode
  this geometry is for"), Light instant, kit off.
- `WASD` steers horizontal drift only; the fall itself is not steerable
  (`h2rWant`, `main.js:1978-1996`). Fog thin = 0.55 × base 0.030 over a
  44-unit shaft (`h2r.js:238`, `H2R_TOP_Z`; the renderer's ray range is a
  separate 60, `main.js:2955-2957`) — matches the "see down the shaft"
  comment (`main.js:2925-2935`). [Erratum corrected in MUSE-03.]

### Sol stretch chamber / SL2R twist chamber (presets: `course off`, `quality high`)
- Locks (`main.js:1047-1058`): Gravity none / Camera up free
  ("flight laboratory", "canonical coordinate frame"), Course off
  ("navigation laboratory"), Light instant ("no history rendering"),
  kit off, Domain edges hide ("no quotient").
- Both presets omit `fog` (`levels/presets.js:87-96`), and presets only
  set what they name — anything unmentioned is left as the player had it
  (`main.js:1201-1206,1217-1227`). Reviewer-executed transition checks:
  explicit normal stays normal, Nil → lab preserves off, dropper → lab
  preserves thin (effective values and Fog select agree). There is no
  unconditional normal default (finding F5 closed).

## Findings

- F1 — Supported. Three distinct behaviors: the footer advertises 1–8
  (`app/menu.js:25`); the handler accepts any digit up to
  `PRESET_KEYS.length` (`main.js:1325-1328`), i.e. a 1–9 path; the
  focused-control guard swallows Digit9 on selects/buttons/summaries
  (`main.js:1307-1308`). Presets 10–13 need card activation
  (click/Tab+Enter). Advertising 1–9 would need a guard/handler fix, so
  this is not a copy-only correction — that fix is lead-owned.
  `docs/playground.md:90-94` still says "seven experiences" / "1–7
  shortcuts" and needs the same pass.
- F2 — Supported but narrowed (was stale). The gap is player-facing help
  only: the settings panel's help line covers fixed settings
  (`app/menu.js:20-21`) and the Fog row says nothing. Correct technical
  account: off = zero density, ranges unchanged (beacon 70, analytic
  columns 4096, legacy `uMaxT` 70, climb 60). Suggest one hint on the Fog
  row or in controls docs, e.g. "Off: no distance fade (range limits
  still apply)". The Nil section must also list Space/Shift flight, not
  just WASD/mouse/R/K.
- F3 — Supported. `docs/playground.md:39-41` still says Nil, Sol and SL2R
  are missing/blocked on distance functions, while all three ship as
  presets with dedicated shaders (`registry.js:28-33`,
  `presets.js:82-96`). Rewrite the paragraph toward the labs'
  bounded-chamber status, don't just delete it.
- F4 — Confirmed runtime defect (reviewer-executed, not a question).
  In both labs, offsetting the player then pressing `K` resets position
  to spawn (`[-1.2,-1.2,0]`) and yaw to `0`, writes raw course `hoops`
  while the lock holds effective course at `off`, and leaves `run.phase`
  RUNNING with six hoops. Code path: the raw write plus unconditional
  `beginRun()` (`main.js:1367-1374`) through the `geodesicCourse(0, 6)`
  fallback (`main.js:2031-2036,2089-2113`). No playable lab course is
  enabled, yet a hidden H3 course state runs. Needs lead-owned runtime
  follow-up, not a status note.
- F5 — Closed. Preservation semantics (`main.js:1200-1240`) plus the four
  reviewer-executed transition checks above refute the normal-default
  hypothesis. A fixed fog setting for the labs would be a separate
  optional design proposal, not a verified omission.

## Acceptance notes
- Static sections are Muse's code reading; runtime K/fog results are the
  reviewer's executable probe. Nothing here is a manual Brave playtest.
- No claim is made that any geometry has a full gameplay kit or that
  cross-geometry portals exist. Kit remains H3-only in code
  (`main.js:1337-1338`, per-world locks); `README.md:40-41` already
  states menu world-switching resets rather than portals.
- UI/copy-only change: no GPU/math suites run, per working rules.
