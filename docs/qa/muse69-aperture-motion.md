# MUSE-69 aperture movement consumer audit

## Failures first

No counterexample found in `engine/world/region-motion.js` /
`engine/world/aperture-result.js` on any probed axis. The consumer refuses
correctly for unknown-at-zero in travel, lift, and settle-resume; strict
solid/gate/domain wins; exact ties; both portal orders; destination-offset
uncertainty; and high-speed / curved S3 approaches. Spent work is retained
while only the final leg's time is refunded.

Three of my own test drafts failed during construction (all test bugs, fixed):
T5 asserted `position[1] < 1.5` but an oblique slide legitimately rounds the
ball past that (relaxed to the meaningful bound: never reached the remote
plane at y=4); T12 asserted bit-exact camera on S3, but curved rollback
re-carries the frame through a zero advance leaving ~1ulp transport noise
(position is bit-exact; frame now asserted near-exact, see observation 1);
T12 asserted producer positions have norm 8, but S3 embeds as the unit sphere
(radius scales the metric, not the embedding).

## Host

```
host      : LeoPC (linux, WSL), node v22.23.2
repo      : checkout @ 46c51be
tools     : spawn yes, timeout NO, wslpath yes, taskkill yes
sockets   : tcp yes, unix NO
chrome    : /mnt/c/Program Files/Google/Chrome/Application/chrome.exe
  starts  : NO -- <3>WSL (27 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1
queue     : no worker serving

VERDICT: browser checks are UNAVAILABLE here.
         Ask for a worker: node tools/check-queue.js --serve on a host with Chrome.
         Do not try to start a browser yourself; record the block and move on.
```

Browser checks unavailable; Node-only audit per task. No browser run required.

## Commands and results (all on the host above)

- `node aperture-motion-truth.test.js` — 14/14 pass (new, allowed file).
- `node aperture-motion-refusal.test.js` — pass (coverage context, unmodified).
- `node region-motion.test.js` — 46/46 pass.
- `node correction-resume.test.js` — 11 pass, 0 failed.
- Isolated fail-demo: copied the checkout to `/tmp/muse69-mutant`, mutated only
  `engine/world/aperture-result.js` (`unresolved` adapted to `miss`), ran the
  truth file there: fails at truth 3 with `actual 'complete', expected
  'unresolved'` — the check fails without the refusal behavior. Scratch copy
  removed; source tree unchanged (`git status` shows only the two allowed new
  files).

## What the truth file pins (independent of aperture-motion-refusal.test.js)

Per-leg relative ranges everywhere: every producer call is recorded and
asserted within `(0, dt*speed]`; paired apertures see identical per-leg
distances (truth 1); S3 producers observe on-sphere points (`|p|==1`), never
chords (truth 12). Short-covered misses refuse at zero via
`invalid-aperture-result` (truth 2). Lift-phase unknowns carry
`phase: correction` with the lifted-off contact retained and approach travel
standing (truth 4, direction-gated producer that only fires leaving the ball).
Settle-resume with a malformed packet keeps debt, issues no continuation, and
reuses stale (truth 14, independent S3 start, `invalid-aperture-result`
reason). Gate strict-win / exact-tie / gate-behind across both array orders
(truth 7), 4e-9 separation wins outside the ~1e-9 tie tolerance (truth 8),
domain strict-win exits while domain-tie refuses (truth 9). Destination-offset
uncertainty refunds the approach to y≈1−skin with `exit-offset-unresolved` and
destination IDs/reasons (truth 10). A slide followed by a late uncertain leg
keeps contacts, steps, and earlier travel, refunding only the final leg with a
coherent carried camera (truth 11). S3 speed-8 non-axis refusal moves nothing
(truth 12); a miss-covering S3 control progresses (truth 13).

## Observations (not defects; no repair attempted)

1. S3 origin refusal returns bit-exact position but the camera differs ~1ulp:
   rollback re-carries the frame through a zero advance. E3 is bit-exact.
2. Refusal rolls back the whole leg to its start even when `uncertaintyFrom > 0`
   certifies a safe prefix — conservative underuse, contract allows it.
3. Solid-beats-uncertainty is emergent (blocking surfaces shorten `advance`
   until the event is out of reach), so producers MUST report per-leg-relative
   bounds: an absolute whole-move bound exceeding the leg range degrades to
   invalid → refuse-at-zero (safe direction).
4. Tie tolerance grows with leg length/position scale, so higher speeds only
   refuse more, never transit more.

## Assumptions (independent vs shared)

Independent: per-leg-relative producers, synthetic E3/S3 geometry, injected
deterministic packets, and all numeric bounds above. Shared with the lead
review: the H3 helper always exports `uncertaintyFrom: 0` (no safe-prefix
claim), real H3 portal factory admission stays gated, and legacy hit-only
frame-end rounding is out of scope for explicit packets. This audit covers the
movement consumer only, not sight, shaders, or scene admission. (97 words)

READY FOR REVIEW — `node aperture-motion-truth.test.js` 14/14,
`node aperture-motion-refusal.test.js` pass, `node region-motion.test.js`
46/46, `node correction-resume.test.js` 11/11, isolated mutant fail-demo
confirmed, source unchanged.
