# Region-owned motion: CPU implementation, and its independent review

Claude, 2026-09-10. Assignment: `docs/engineering/CLAUDE_REGION_HANDOFF.md`.
Contract: `docs/engineering/REGION_MOTION_CONTRACT.md`.

Base inspected: 7c68a62 plus Astra's uncommitted camera/carry/docs changes,
which were present before this task and are untouched by it. Committed and
pushed as 7816d7f on the user's instruction, carrying Astra's prerequisite with
it; the evidence below was gathered before that commit and re-run after it.

Host, from `node tools/host-probe.js` at the start of this session:

```
host      : LeoPC (win32), node v24.20.0
repo      : C:\Users\lflyn\Projects\NilGame @ 7c68a62
tools     : spawn yes, timeout yes, wslpath NO, taskkill yes
sockets   : tcp yes, unix n/a
chrome    : C:\Program Files\Google\Chrome\Application\chrome.exe
  starts  : yes
queue     : no worker serving
VERDICT: browser checks run DIRECTLY here. Use the tools as documented.
```

Chrome was available and **no browser check was run**: this task adds no shader,
renderer or UI path. Everything below is Node.

## Files

Implementation:

- `engine/world/collision.js` — an optional `events` provider on `sweep` and
  `moveProbe`, explicit time accounting, event yielding before settling.
- `engine/world/region-motion.js` — NEW. `moveRegionProbe(world, state, dt, options)`
  and `REGION_MOTION_DEFAULTS`.
- `engine/world/region-world.js` — `spawn()` now converts the construction basis
  into a carried camera ONCE (`state.camera`); the raw `frame` array stays for
  existing readers.

`engine/world/region-portal.js` was read and **not changed**: its `crossing`
already takes a physical radius and is one-sided, and its `transit` already
returns position, carry and exit normal. Nothing the contract asked for needed
a new policy there.

Checks: `region-motion.test.js` (NEW, 34 checks). No fixture was added — the
scenes are built inline in the suite, which keeps each case's geometry next to
the assertion that depends on it. `levels/fixtures/connected-motion.nil.json`
was therefore not created.

## What was built

**Events on real legs.** `sweep` takes `events({position, direction, distance, phase})`
and queries it on each geodesic leg it is about to travel — including the
touching-but-leaving nudge, the lift and the settle (those two with
`phase: 'correction'`). It never tests a chord. An event distance outside
`[0, proposed]` throws rather than being clamped.

Surface-versus-portal priority needed no rule: the proposed leg is already a
distance proved free of surfaces, so a surface that blocks arrival shortens the
leg until the aperture is out of reach.

**One clock.** `moveProbe` now carries `timeRemaining` rather than a distance
budget, and derives `speed * timeRemaining` as each leg's allowance. Portals,
lift, settle and the exit offset consume zero time. It returns `timeConsumed`,
`timeRemaining`, and `time: {travel, rest, correction}` so rest is separable
from travel. `pendingLift` reports settle debt the probe stopped owing.

**One owner.** `moveRegionProbe` validates the world, state, camera ownership,
`dt`, radius and every budget before anything moves; returns a frozen new state;
never mutates its input. Status is one of `complete`, `stopped`, `domain-exit`,
`blocked-exit`, `budget-exhausted`, `unresolved`. Camera ownership is tested by
object identity of the space, not by vector length.

**Transactional crossing.** Destination point, domain, tangent norms, preserved
speed, clearance (`>= radius + skin/2`) and a swept exit offset are all proved
before ownership moves; any failure returns `blocked-exit` with source ownership
intact and the frame's remaining time unconsumed. A field advertising
`exteriorDistance: 'exact'` yields `destination-clearance-insufficient`; a
conservative bound yields `destination-clearance-unproven`. Both refuse.

Budgets are shared across the whole call: `maxSteps` (96), `maxContacts` (4),
`maxCrossings` (8). A crossing does not grant a fresh allowance — the exit
offset draws on the remaining step budget.

## Evidence

`node region-motion.test.js`: **34/34 checks passed, exit 0.**
`node tools/test.js`: **49/49 suites passed, exit 0** (48 before, plus the new
suite; 53/53 once Muse's four corpora landed). `git diff --check`: clean.

Independent references, not second calls into the solver:

- **The slide clock.** A probe launched at (3, 4, 0) into a wall whose normal is
  −x ends the frame at `y = 4 * dt`, and the wall's position cancels out of the
  arithmetic entirely. Checked at wall distances 0.6, 1.4 and 2.2.
- **The curved carry.** The solver's geodesic legs are recorded through a
  wrapping space, then transported with the per-leg endpoint formula
  `v ↦ v − (v·b / (1 + a·b))(a + b)`. Agreement to 2e-10, and the same check
  requires the answer to differ from shortest endpoint transport by more than
  1e-3, which it does by 4.2e-2.
- **The geodesic crossing.** The reported aperture point satisfies `p·n = 0` to
  1e-14 and sits at arclength 0.9 to 1e-12, while the chord fraction across the
  same move reports 0.871 — the distance a chord test would advance by.
- **The round trip.** Out and back through a portal (upright and 45°-tilted
  apertures) returns every camera vector, roll included, to 1e-12.

### Fail-before

Each mechanism was disabled in the working copy one at a time, the suite run,
and the file restored. All eight are caught; the full log with per-check
messages is reproducible by re-applying the mutations below.

| # | mutation | result |
|---|---|---|
| M1 | no event query on the travel leg | 13/34, exit 1 |
| M2 | the slide spends leftover DISTANCE, not remaining time | 32/34 — `2.2500 != 2` and `3.3834 != 2.8` |
| M3 | the settle runs before the event is yielded | 33/34 |
| M4 | first candidate by array order instead of an unresolved tie | 32/34 |
| M5 | destination clearance is not proved | 33/34 |
| M6 | the exit offset is not swept for obstruction | 33/34 |
| M7 | an event past the requested range is rounded back into it | 33/34 |
| M8 | the camera is transported between endpoints, not along the path | 33/34 — `-0.1406 != -0.0988` |

M7 and M8 were **not** caught by the first version of the suite; the checks that
catch them (`an event reported outside the proposed leg is refused` and
`a curved contact carries the camera along the legs walked`) were added because
the mutation matrix found the gap, not before it.

### Acceptance cases against the contract

Covered: free E3→S3→E3 with speed, radius, roll and clock; two S3 regions at
R = 1 and R = 3; off-centre and 45°-tilted apertures; player radii 0.05, 0.25,
0.5 and one too wide for the aperture; collision before portal (with an
open-scene control that does cross); a contact deflecting the walker into a
DIFFERENT portal; tangential speed loss against the clock; exact frame-end
crossing (including `3 × 2/3`, which lands a rounding step past the range);
zero dt, including on the aperture plane; initially on-plane; legitimate return
with no cooldown; too-small aperture; blocked destination; exit-offset
obstruction; domain exit with no normal, no projection and no grounded flag;
tied apertures unresolved in both authoring orders; step, contact and crossing
exhaustion; `dt = 1e6`; input immutability and invalid-input rejection; contact
samples tangent at their own points and tagged with their region.

Not established, and not claimed: rendered portal parity, GPU performance, a
playable connected room, the curved gravity walker, editor integration, or any
browser validation.

## Findings for Astra — reported, not fixed

1. **`levels/fixtures/connected-lab.nil.json` does not compile.** Both regions
   declare `extent: 2`; the S3 region has `curvatureRadius: 1`, and
   `createMetricSpace` refuses `maxDistance > πR/2 ≈ 1.5708`
   (`S3 runtime patch cannot exceed an open hemisphere`). `document.js` validates
   the same scene through `charts.js`, which does not apply that limit, so the
   disagreement is between the two chart implementations rather than in the
   fixture alone. This is why the suite builds its scenes inline.

2. **`app/region-lab.js` imports modules that were never written.** It imports
   `stepRegionPlayer` and `turnRegionPlayer` from `engine/world/region-motion.js`
   and `createRegionRenderer` from `engine/geometry/region-renderer.js`. The
   second still does not exist. I implemented `moveRegionProbe` as the contract
   specifies and did **not** add the other two: a `wish`/`gravity`/`jump` walker
   is the gravity policy this task was told to stay out of. The lab therefore
   still does not load; that belongs to the renderer/editor task.

3. **A domain event can never precede a valid aperture crossing in an authored
   scene.** Both charts are geodesically convex and `document.js` requires every
   aperture to lie wholly inside its chart, so a geodesic that reaches a point in
   the aperture cannot have left the chart first. The ordering code is exercised
   with a staged portal instead (two checks). If that is meant to be reachable,
   the chart or the containment rule has to change, not the ordering.

4. **A refused crossing leaves the walker ON the aperture plane, where the
   one-sided rule then declines to test it.** The contract asks for "the last
   source-safe point just before the aperture"; travel to the aperture is proved
   and committed, so nothing is tentative and the roll-back clause is vacuous —
   I retain that exact point rather than inventing a backwards correction.
   The consequence: on the next frame `h = 0`, `crossing` returns null, and the
   walker can travel through the aperture plane into whatever source space lies
   behind it. In a well-authored scene the wall the aperture is set in stops
   them, since portals do not carve walls. In a free-standing aperture it is a
   leak. This is a policy decision (back off by the safety margin and refund the
   time, or require apertures to be set in solids), not something to improvise.

5. **The lift and settle step budgets are counted after the fact.** `moveProbe`
   runs its lift with `maxSteps: 8` and its settle with `maxSteps: 16` and adds
   the steps afterwards, so a single call can overshoot the global step budget by
   up to 24. Pre-existing shape; I bounded the exit-offset sweep I added, and
   left these alone rather than changing the solver's correction policy.

6. **`maxContacts` allows `maxContacts + 1` loop iterations** (`bounce <= maxContacts`),
   which is pre-existing and unchanged. `maxContacts: 0` still records one
   contact before reporting exhaustion; the suite pins the current behaviour.

## Addendum, same day: MUSE-39 came back

Muse delivered `region-motion-truth.test.js` (21 checks) and
`docs/qa/region-motion-truth-2026-09-10.md`, deriving its reference from the
contract and the embedding math rather than from this implementation. Re-run
here at 7816d7f: 21/21, and `node tools/test.js` 53/53, exit 0. Muse touched no
`engine/` or `app/` file (`git status -- engine app` is empty).

**Finding 4 is confirmed, and I reproduced it independently** rather than
reading Muse's corpus for it. Free-standing gate pair, occupied destination:
frame 1 ends `blocked-exit` / `destination-clearance-insufficient` at
y = 2.000000 with 0.5 s handed back; frame 2 from there reports `crossings = 0`,
region still `room`, and y = 6.000000 — four units straight through the aperture
plane, the one-sided rule having declined the on-plane test. Muse's numbers and
mine agree exactly. **This is the one thing that needs a decision before the
renderer or the editor touches region motion**, and it is a policy call: back
off by the safety margin and refund the time, require apertures to be set in
solids, or arm the plane from the side the walker left on.

**The two corpora are complementary, and neither alone covers the contract.**
I ran the eight-way mutation matrix from this report against Muse's corpus:

| mutation | `region-motion.test.js` | `region-motion-truth.test.js` |
|---|---|---|
| M1 no event query on the travel leg | caught (13/34) | caught (8/21) |
| M2 slide spends leftover distance | caught | caught |
| M3 settle runs before the event is yielded | caught | **missed** |
| M4 array order instead of an unresolved tie | caught | caught |
| M5 destination clearance not proved | caught | caught |
| M6 exit offset not swept | caught | caught |
| M7 out-of-range event rounded into range | caught | caught |
| M8 endpoint transport instead of path carry | caught | **missed** |

Neither gap is a fault in Muse's work — the assignment asked for a clock and
atomicity reference, not for correction ordering or carry provenance. It is
worth recording because "an independent corpus agrees" reads like "either would
have caught anything", and here that is not true of either one.

## Next task

Astra: accept or reject this implementation, and decide finding 4. MUSE-39 is
delivered and awaiting your acceptance; MUSE-36, 37 and 38 are accepted and
logged. Renderer, editor and curved gravity remain unstarted, and the region
lab still does not load (finding 2).
