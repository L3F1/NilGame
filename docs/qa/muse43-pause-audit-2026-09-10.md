# MUSE-43: is the pause table the one the contract asks for? (2026-09-10)

Independent audit of the host pause policy in `app/motion-pause.js`.
Method: the table below was derived from
`docs/engineering/REGION_MOTION_CONTRACT.md` ALONE, before opening the
module. The corpus sweep follows, then the comparison.

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
         node tools/check-queue.js page-check --ball-lab

NOTE: timeout(1) is DENIED here. Do not wrap probes in it -- that is exactly the mistake that recorded WSL interop as blocked when it had never been tested.
```

## My table, from the contract alone

"END the session" = the host stops its movement loop and waits for user
action (pause UI). "Request ends" = this `moveRegionProbe` call stops but
the host loop continues next frame. Retry = re-issuing movement; reset =
abandoning position for a validated spawn. Debt (`pendingLift` owed) is
checked FIRST, before status — the contract orders it so ("Hosts must
inspect status and pendingLift, not just the clock").

| outcome | ends session? | retry? | contract line |
|---|---|---|---|
| complete, no debt | No. Nothing owed; loop continues. | N/A | clock fully spent, no debt |
| stopped, no debt | No. Rest consumed the clock normally. | N/A | "consume the rest as rest (complete/stopped)" |
| domain-exit, no debt | Request ends; host MAY pause/report/request a chart transition (permitted, not mandated). No automatic re-entry. | No same-vector retry (would re-exit); new steering is a new request. | "The host may pause/report/request a chart transition; automatic re-entry is not implemented" |
| blocked-exit, no debt | No. "Repeated fresh frames must stop again" plus "retreat and lateral departure remain possible" means the player keeps control and every frame re-stops at the aperture. No pause UI. | Not offered — fresh frames already re-attempt; "no persistent cooldown". | refusal + checkpoint + unconsumed time; Finding 4 |
| budget-exhausted, no debt | YES (pause). Otherwise the loop would burn frames re-spending capped budgets. | Explicit retry permitted, including after budget increase. | "stays at the last validated state with remaining time reported"; acceptance "retry after budget increase" |
| unresolved (any detail) | YES (pause). "Ends this movement request. Do not retry its unconsumed time in a tight loop." Show competing IDs, retain edit controls for ties. | Explicit retry ONLY as a NEW request: new steering, a scene edit, or explicit retry with old time discarded, never accumulated. | host recovery policy; "Unresolved queries retain their unconsumed time; the host must not silently replay it" |
| pendingLift owed, ANY status incl. complete and incl. timeRemaining=0 | YES (pause) + offer explicit RESET to a validated spawn. Never feed `out.state` back as if the move completed; never silently drop debt. No resume until a correction-resume API exists. | Reset only, not resume. | "An exhausted zero-time correction can coexist with timeRemaining=0. Hosts must inspect status and pendingLift, not just the clock. Until a correction-resume API is implemented, pause play and offer an explicit reset to a validated spawn; do not silently drop debt or feed only out.state back as if the move completed." |

Answers to the two aimed questions, from the contract alone:

1. `blocked-exit` is not a pause (retreat/lateral departure stay possible;
   fresh frames re-stop). Whether it "can ever arrive carrying an unpaid
   correction": yes in principle — "On refusal restore checkpoint position,
   velocity, full camera, pending correction state and their transport
   prefix" keeps the debt in the returned state. If it does, the debt row
   dominates: pause + reset offer, because debt is checked first.
2. Yes, `pendingLift` with `status === 'complete'` must be assumed possible:
   "an exhausted zero-time correction can coexist with timeRemaining=0" and
   the host is told to inspect debt "not just the clock". A host reading
   only the status would fly on with unpaid debt — exactly the failure the
   sentence exists to prevent.

## Corpus sweep (kernel only; `motionPause` not yet opened)

`node /tmp/sweep43.mjs` + debt hunts (`hunt43*.mjs`): 10 fixtures (empty,
wall ball, plug shut/open E3+S3, twin competing gates, chart edge with and
without floor, floor+plugged gate, lid gate, plane wall+floor), starts
including inside solids and on the aperture plane, `maxSteps`/`maxContacts`/
`maxCrossings` from 0 upward, dt from 0 to 1e6. Counts are probes, not a
statistical sample:

```text
  6  blocked-exit|destination-clearance-insufficient|none|rem
  1  blocked-exit|destination-clearance-insufficient|owed|rem   (floor+plug descent)
  2  budget-exhausted|contacts|none|rem
  2  budget-exhausted|crossings|none|rem
 36+ budget-exhausted|steps|none|rem
  5  budget-exhausted|steps|none|zero
  6  budget-exhausted|steps|owed|rem                             (caps 6-14 outrun the settle)
 44+ complete|-|none|zero
  4+ domain-exit|-|none|rem
  1  domain-exit|-|owed|rem                                     (floor descent to the edge)
 12+ stopped|-|none|zero
  1  unresolved|competing-events|none|rem
  1  unresolved|correction-boundary|none|rem                    (lid gate)
  1  unresolved|degenerate-contact|none|rem                     (start inside solid)
14 distinct combinations. No throws (no invalid inputs hit).
```

Debt appears exactly when a correction is mid-flight at budget death or an
event stops the walk before the settle: caps below the settle demand owe,
one step more pays in full (`planecap ms=14 owed, ms=20 settled`).

## Comparison (`motionPause` over the same corpus)

16 pinned cases plus 4 synthetic policy probes
(`node motion-pause-truth.test.js`, 5/5):

- Debt pauses under blocked-exit, domain-exit and budget-exhausted alike:
  all `PAUSE(debt, resumable=false)`. **Q1 answered yes**: a blocked-exit
  CAN carry an unpaid correction (floor lift outstanding at the plugged
  gate, `rem=0.100`), and the policy pauses on the debt, not the refusal.
- Unresolved pauses and stays resumable: competing-events names
  `portal to-a to a | portal to-b to b`; correction-boundary and
  degenerate-contact pause identically. Unspent time is discarded by
  construction of the text.
- complete / stopped / domain-exit / blocked-exit / budget-exhausted
  without debt all return null (carry on).
- Synthetic **Q2** rows (`complete|owed|zero`, `stopped|owed|zero`,
  `budget|owed|zero`, `domain|owed|zero`): all `PAUSE(debt,
  resumable=false)`. The kernel never produced them in ~40 targeted hunts,
  but the debt-first ordering handles them by construction — which is
  exactly what the contract's "inspect status and pendingLift, not just
  the clock" sentence demands.

Disagreements between my pre-registered table and the shipped policy: 4,
all one row — **debt-free budget exhaustion**. My table said PAUSE; the
shipped policy carries on ("the next frame asking again with a fresh
budget is a new request, not a replayed one"). Adjudication: the contract
mandates a validated state with honest time there, not a pause, and a
settled state re-queried with fresh budgets cannot corrupt — persistent
under-budgeting surfaces as debt, which does pause. My row over-read;
the shipped carry-on stands, ON CONDITION that the host reports loudly
and frames each retry as a new request with fresh budgets and no
accumulated time. That condition lives in the host loop (MUSE-44
territory), not in `motionPause`. No case exists where the shipped policy
pauses and my table says carry on.

## Unreached combinations (findings, not gaps)

My table covers these; the corpus never reached them: `complete|owed`,
`stopped|owed`, and ANY status pairing debt with a zero clock (~40 hunts:
corrections consume zero gameplay time so the clock cannot die
mid-correction, and `moveProbe` pairs banked debt with stalled/exhausted —
see `region-motion.js:446-454`). Also unreached: the
`uncertifiable-checkpoint` detail, blocked-exit reasons other than
`destination-clearance-insufficient`, and `crossings`-budget exhaustion
with debt. Coverage actually reached: all 6 statuses; debt under
blocked-exit, domain-exit and budget-exhausted; zero clock under complete,
stopped and debt-free budget-exhausted.

## Verdict

The shipped pause table IS the one the contract asks for, with one
pre-registered row of mine corrected above. Debt-first regardless of
status (Q2's trap), refusal without pause (Q1's retreat right), ties shown
with both IDs and resumable only as a new request with old time discarded.
No defect to report; do not change the module.

