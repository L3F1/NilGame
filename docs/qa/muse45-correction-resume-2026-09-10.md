# MUSE-45: is a resumed correction the correction that was owed? (2026-09-10)

Independent audit of `resumeRegionCorrection` (landed 885834d). No engine,
app or tool changes; `correction-resume.test.js` was not read before the
reference below was built. Method note: the obvious reference —
starve-with-a-step-cap then compare against the full run — is INVALID as
stated, because capping steps truncates travel first (slide-heavy walks
diverge by 0.3-1.3 while the debt is 0.025). Every comparison below is
gated on travel-match: the starved endpoint must sit exactly one residual
from the reference, else the row fails loud instead of indicting the
resume. Clean single-contact settles are atomic (S=1, unstarvable); only
rattle/slide paths with S=43-92 starve.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 885834d
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
chrome    : /mnt/c/Program Files/Google/Chrome/Application/chrome.exe
  starts  : NO -- <3>WSL (28 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1
queue     : worker on LeoPC (win32), pid 38432
VERDICT: browser checks run THROUGH THE QUEUE here.
```

## Q1: authority is real, not a shape

Nine attacks, zero movements. Clone, frozen clone, hand-written debt-as-
authority, cross-scene world, recompiled-identical document, endpoint moved
1e-16, double present, null continuation (throws `owes no resumable
correction`): every one returns `stale-continuation` (or throws) with
`corrected=0` and the presented endpoint echoed back unchanged. The most
valuable negative: two calls from the SAME state object issue two
continuations with bit-equal endpoints, yet presenting A's against B's
suspended result dies on camera identity (`endpoint-moved`) — each call
rebuilds the frame object, so not even two kernel-issued continuations for
one walker state can cross. No walker moves on authority the kernel did
not issue for that exact endpoint frame.

## Q2: the resumed path IS the settle's path

Uninterrupted (512-step budget) vs starved-tail + resume-loop, positions
AND cameras. E3 funnel/tilt/diag at radii 0.1/0.25/0.5, S3 funnels at
R=0.5/2/8, resume budgets 24 and 5:

- travel-matched rows: `dPos=0.0e+0` (E3, all), `dPos<=8.7e-19` (S3),
  cameras `<=1.6e-16` everywhere. Bit-exact walkers.
- one marginal row (E3-tilt second cap: starved endpoint 7.4e-2 from ref
  against a 5.3e-2 debt) keeps 5.2e-2 after resume — attributed to travel
  divergence leaking through, not resume error: the gap tracks the
  pre-existing divergence, and the strict gate used in the durable test
  excludes such rows rather than asserting over them.
- chained single-step resumes conserve the residual exactly
  (`walked + left - owed = 0.0e+0`, E3 and S3) and land on the reference.

Coverage honesty: clean normal impacts settle atomically (S=1) and cannot
starve at any cap — the settle-tail reference only exists where rattles or
slides make the walk step-hungry (S=43-92). That is a property of the
solver, not a hole in the audit: the resume path is exercised wherever a
debt can exist.

## Q3: the clock is untouched, both senses

Every resume result in the corpus (all Q2 rows, chains, edge cases below)
reads exactly 0 in all five time fields (`timeConsumed`, `timeRemaining`,
`travel`, `rest`, `correction`) — worst absolute value 0. Residual
accounting holds per link (`corrected <= owed`, conservation exact), so no
link walks more than was owed. Ground per dt is identical to six decimals
(E3 2.247230, S3 1.580409, uninterrupted vs debt+resume), which is the
property the zero-time rule protects, verified as behavior rather than
re-read off the fields.

## Adjudication: the chart-edge argument HOLDS

Tried: edge-corner rattle with the debt 0.30 from the edge (E3), equator
funnel at extent exactly pi*R/2 with R=2 (closed-hemisphere boundary),
domain-exit debt endpoint resumed directly, plus every resume in the Q2/Q3
corpora (~100 calls, E3+S3). Zero `domain` details; every resume ends
`complete` (or budget `steps` mid-chain) and inside the chart. The
mechanism is what the report claims: both ends are validated interior
states, the chart is a convex geodesic ball (E3 ball, S3 open/closed
hemisphere — the equator case included), and the resume walks a
subsegment of the lift interval, with the same event provider watching
that watches moves. Attempted but unreached: a debt strictly closer than
~0.3 to an edge (rattles need room to exist), and a resume-level aperture
event (the lid scene owes only inside full-budget moves, never to a
resume; the event-provider path is shared code, read but not fired live
by a resume here).

## Verdict

No defect to report; do not change the module. The continuation is
unforgeable authority with spend-on-use, the resumed correction is the
owed correction to bit-exactness including the camera, the clock is
untouched in fields and in ground covered, and the chart-edge
impossibility survived everything constructed against it. Durable test:
`correction-resume-truth.test.js` (6/6).
