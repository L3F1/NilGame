# Stale-claim sweep — 2026-09-09 (MUSE-12)

Host: WSL, node v22.23.2, `main` at `9356527`. Every `.md` under `docs/`
plus `AGENTS.md`, `MUSE.md`, `TODO.md`, `README.md` is listed at the end
with read depth. Only checkable factual claims about what the code does
(counts, capabilities, rakes, paths, names, numbers) were verified, each
against the current tree with the command shown. No swept document was
edited; the lead decides corrections. "WSL node" below means rant-only
commands (no browser); browser counts come from code the browser executes.

## FALSE (wrong now)

**F1. `docs/architecture.md:14` — "New document connections are authoring
data only."** Kernel swept-crossing transit with blocked exits, see-through
rendering through the same map, and one-transaction Add-portal authoring
are implemented and tested.
Evidence: `node tools/test.js` → 24/24 incl. `portal.test.js: 24 passed`;
`TODO.md` portal rows checked; `app/ball-lab.js` transit + `aimAlong`,
`BALL_FIRST_PERSON_GLSL` portal uniforms (`engine/geometry/ball-shader.js:70-74`).

**F2. `docs/architecture.md:17` — "with player collision and curved
primitives still pending."** Player collision is done (`engine/world/
collision.js` + `walker.js` + probe; `collision.test.js: 21 passed` in the
suite). Only curved primitives are still pending.

**F3. `docs/architecture.md:122` — "Compile all six programs with
`tools/shader-check.js`."** Eleven: 8 spaces + lines + 2 ball programs.
Evidence: `node -e` importing `shader.js` + `registry.js` →
`spaces: 8 h3,s3,h2r,s2r,e3t,nil,sol,sl2r`, `programs: 11`;
`tools/shader-check.js:54-63` builds 8+1+2 entries.

**F4. "all 10 programs compile and link" — `docs/qa/opus-integration-
2026-09-09.md` (verification table) and `docs/qa/astra-review-2026-09-09.md:65`.**
Same count as F3: the array has 11 entries. The green result is not
disputed; the number is off by one in both reviews.

**F5. `--ball-lab: 9 checks` —
`docs/qa/astra-review-2026-09-09.md:68`,
`docs/qa/opus-integration-2026-09-09.md` (verification table),
`docs/qa/ball-editor-checklist.md:22` (cited lead evidence),
`docs/qa/check-runbook.md` (MUSE-10 table) and `docs/qa/overnight-
results.md` (MUSE-10 entry).** `app/ball-lab.js:410-411` builds one linear
`check(name, ok)` flow that throws on first failure; `grep -c` finds **57**
`check(` sites, all inside that flow, and `tools/page-check.js:194`
prints `report.checks.length`. A green run today reports ~57, not 9.
The 9 matches an older stage of the same dated log (`docs/ball-lab.md`
went 9 → 17 → 23 → 35 → 45 → 57). Reconcile with one browser run; until
then every "9 checks" citation (including the two from this batch) should
read as superseded. This task's no-edit rule leaves `check-runbook.md`
untouched — this entry is its correction pointer.

**F6. `docs/playground.md:339` — "It compiles both shader programs in
headless Chrome."** Eleven (F3). Same evidence.

**F7. `docs/playground.md:360` — "replays the marching loop over twelve
thousand rays."** Current output shows 29,913–32,110 rays per setting,
0 exhausted. Evidence: `node tools/march-check.js` log
(`0 / 32110 exhausted`, `0 / 29913 exhausted` lines).

**F8. `docs/scene-format.md:73` — "There is no traversal, visibility or
velocity implementation yet."** Traversal and visibility exist (F1
evidence). Only the velocity policy is still just the `preserve-speed`
convention. Suggested scope: "no velocity implementation yet".

**F9. `docs/host-capability-map.md:22`, row 1 — "exact ray hit in a
parameterised metric | done, eight geometries".** Exact hits exist for the
E3 ball and Nil columns only; H3/S3 exact balls are explicitly future
work. Evidence: `TODO.md` ("Then add H3/S3 metric balls behind explicit
distance, ray-hit and normal capabilities"); `docs/math-audit.md:33-35`
(Nil columns exact). Suggested wording: distance+normal in eight,
exact hits E3-ball + Nil-columns.

**F10. `README.md:83` — "See AGENTS.md for the reasons and GPU
requirements."** `AGENTS.md` is an 18-line router: no reasons, no GPU
requirements. Both live in `docs/engineering/WORKING_RULES.md`
(required-checks table).

**F11. `docs/architecture.md:125` — "Marcher and networking changes have
dedicated checks in AGENTS.md."** Same root cause as F10: no checks table
in `AGENTS.md`; the table is `WORKING_RULES.md:59-78`.

**F12. `docs/qa/controls-review.md:26,79-85` (footer `1–8`; "Advertising
1–9 would need a guard/handler fix") and `:101-109` (F4 "Needs lead-owned
runtime follow-up").** Superseded by the MUSE-04 fix and F4 closure:
guard is now `/^Digit[1-9]$/` (`main.js:1309`), footer reads `1–9`
(`app/menu.js`), F4 closed (`TODO.md`, `docs/qa/astra-review-2026-09-09.md`
F4 checks). Accepted point-in-time report; needs a dated note, not a
rewrite.

**F13. `docs/ball-lab.md:343-347` — "Not done: a portal cannot be AUTHORED
in the lab yet."** Contradicted inside the same file by the authoring
section (`:180-208`) and the later dated entry (`:349`, `portal.test.js`
24 cases, browser check 45 → 57): Add portal / radius-moves-both-ends /
delete-removes-all are implemented (`app/ball-lab.js` `addPortal`,
`editEntities`). Current truth is the later entry.

**F14. `docs/rendering-contract.md:44-46` — "Next engine step: give
authored primitives explicit distance/intersection/normal capabilities,
then consume the same scene data in Godot."** Done: `engine/world/
collision.js` consumes distance-bound + normal, ball capabilities are
exact/exact/exact-except-center, scene-field unions balls+planes, Godot
consumes ball documents (`ball_document.gd`, 10 native checks per
`docs/ball-lab.md:242`). The "next step" happened.

## STALE-BUT-HARMLESS (true at its date; counts grown or baseline frozen)

- **S1. `docs/math-audit.md:16`** — "18 passing suites" (audit dated
  2026-09-08). Now 24/24. Eight audit groups still 8/8.
- **S2. `docs/rendering-contract.md:48-51`** — validation snapshot dated
  2026-09-08 (18 suites, nine programs, 316 checks, 0.3 s / 6.2 s links).
  Explicitly dated; superseded by current runs, not wrong.
- **S3. `docs/qa/ball-editor-checklist.md:9`** — "18 document cases".
  22 after MUSE-09 (`levels/fixtures/ball-document-cases.json`).
- **S4. `docs/qa/astra-review-2026-09-09.md:55`** — lifecycle/profile
  suite "19/19". Now 35 passed (+4 MUSE-08 guards).
- **S5. Same file `:65`** — `tools/test.js` "20/20". Now 24/24.
- **S6. `docs/qa/editor-readiness.md:22-33,60-61`** — frozen MUSE-05
  baseline by its own header (`:3-5` "describe the reviewed baseline,
  not today's whole working tree"): CPU field / shader feed / editable
  uniforms "MISSING", "portal traversal unimplemented". The header
  disclaims currency; `scene-check` wording it cites has since moved to
  "traversal is covered by portal.test.js".
- **S7. `docs/qa/controls-review.md` line refs** (`main.js:1307-1308`
  etc.) — drifted ~1 line after the MUSE-04 fix (guard now `:1309`).
- **S8. `docs/archive/geometry-worlds.md` "six worlds" framing** —
  archive by title/intro (moved out of CLAUDE.md 2026-09-07); rationale
  intact, but the tree now has eight geometries + labs.
- **S9. `docs/archive/gameplay-kit.md:635`** — `sdf-check` "fourth
  case" history. Archive; the tool now runs 21 cases.
- **S10. `docs/architecture.md:124`** — "`sdf-check.js` covers H3, both
  flat worlds and the S2 x R race track." Now also E3 ball, Nil
  cylinder/scene/flow, sol/sl2r chambers + flows, product height,
  flat checker, H2R dropper. Evidence: case-name grep over
  `tools/sdf-check.js:99-251`.
- **S11. `docs/architecture.md:46`** — "general region content and
  collision remain." Collision, multi-entity selection, planes and
  portals are done; multi-region content is not. Partially overtaken.

## UNVERIFIABLE (not checked — reason given)

- **U1. `docs/playground.md:403`** — Coulon et al. "renderer for all
  eight Thurston geometries". External paper claim; needs the web, and
  the tree cannot confirm it.
- **U2. `docs/engineering/AGENT_SETUP.md:15-17`** — Codex "32 KiB"
  discovery limit + instruction-loading guide. External product facts.
- **U3. Gameplay-feel prose** (`docs/playground.md:34-37` 3-torus
  gravity; kit ability notes) — describes play feel, no cheap oracle;
  not disputed, just not checkable from here.

## Per-file read log

Full read: `docs/architecture.md`, `docs/ball-lab.md`,
`docs/decisions/001-runtime-strategy.md`,
`docs/engineering/AGENT_SETUP.md`,
`docs/engineering/NEXT_SESSION.md`,
`docs/engineering/WORKING_RULES.md`, `docs/lie-labs.md`,
`docs/math-audit.md`, `docs/playground.md`,
`docs/qa/astra-batch-review.md`, `docs/qa/astra-review-2026-09-09.md`,
`docs/qa/ball-editor-checklist.md`, `docs/qa/check-runbook.md`,
`docs/qa/controls-review.md`, `docs/qa/crash-2026-09-09-geom-apply.md`,
`docs/qa/editor-readiness.md`, `docs/qa/muse01-review-history.md`,
`docs/qa/opus-integration-2026-09-09.md`,
`docs/qa/overnight-results.md`, `docs/qa/render-fixture-guide.md`,
`docs/rendering-contract.md`, `docs/scene-format.md`,
`docs/what-this-is.md`, `AGENTS.md`, `MUSE.md`, `TODO.md`, `README.md`.
Targeted (headers + claim greps + spot verification): `docs/archive/
gameplay-backlog.md` (disclaimer + MARKS=10 verified), `docs/archive/
gameplay-kit.md` (kit symbols present; suites passing), `docs/archive/
geometry-worlds.md` (intro + structure), `docs/host-capability-map.md`
(needs table, §§3–5, claim grep). Headings only:
`docs/engineering/legacy-agent-reference.md` — line sweep skipped by
design: byte-preserved archive whose status claims `WORKING_RULES.md`
already declares superseded; sweeping it would manufacture findings.

## Verified-true spot list (checked, no finding)

Nil 60-unit rise + 6 gates (`nil.js` NIL_H/NIL_GATES); dropper 44-unit
shaft + 60 ray range (`h2r.js:238`); dodecahedron inradius ~0.9964
(`hyp.js` DOD_R); 1.50/1.5286 cells (`e3t.js:26,92`); 13 presets across
all eight geometries (`levels/presets.js`); S3/H3 extent bounds
(`charts.js:27-28`); golden-fixture 13 Godot views
(`tools/godot-export.js` 13 `view(` entries); lie-lab 3 boxes / 0.04
march step / 0.01 substep / 3072 samples (`lie-labs.js:6`,
`lie-shader.js` `min(.04,…)`, `lie-labs.js:71`, `sdf-check.js:83`
16×16×12); preview 300x200 default (`tools/preview.js:32-33`); render
fixture names/version/VW-VH pin; crash-doc line 80 / panel flags /
`remote.cut.N` still unguarded (`main.js:2893`, hole open as documented);
`apply` ~37 call sites ≈ "roughly forty"; README repo-map paths all
exist; `what-this-is.md` 0.7/8.4 figures consistent with
`host-capability-map.md:102,149` and `001:148-153`; kernel file list
incl. `engine/world/portal.js`.
