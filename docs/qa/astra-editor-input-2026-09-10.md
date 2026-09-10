# Doorway and mouse-input repair; clearance QA review

Base bb7c868; shared tree already contained Muse's untracked clearance test/report
and queue edits. Those changes were preserved. Host LeoPC / Windows / Node v24.20.0.

## Doorway

Reproduced oriented-room at x=0: after four seconds of forward walking, y stopped
at 1.449949999999999. box-room's center route reached y=4. The oriented cutter's
half-depth .8 minus wall half-depth .3 is .5, exactly twice player radius .25;
the conservative composite bound cannot open clearance at the mouth. Changed
only that cutter's half-depth to 1.1. This preserves the visible rectangular hole
and gives its collision bound room beyond the wall. No distance guarantee relaxed.

editor-input-route.test.js walks BOTH fixtures forward and back, using the real
walker/field. Oriented-room failed before, all four input/route checks pass after.
This is a fixture repair, not a general solution to conservative CSG clearance.
If the user meant another doorway, its location still needs a separate reproduction.

## Input

Both editor mouse handlers applied every event immediately. The flat editor even
turned without pointer lock. Neither had the arena's lock-settle/spike/burst policy.
New app/mouse-look.js shares that policy between editors: 250ms settle, discard
events above 250px/axis, accumulate once/frame, cap .6rad/axis/frame, clear on
lock/play/focus transitions. Preserve each editor's sensitivity and camera policy.
Tests cover dropped spikes, lock/unlock, ordinary high-rate totals and no deferred
burst overflow. This fixes a confirmed protection gap; physical high-DPI mouse
hardware was not available for direct reproduction. No claim every snap is solved.

## MUSE-42 verdict

Accept as independent QA evidence. The new suite passes in the full Node run;
reviewed the active-face/foot containment certificate and reference limitations.
Sampler convergence is evidence, not a proved lower bound, and no production
capability is upgraded. A production certificate must still enforce the supported
patch and whole-scene scope as CURVED_CLEARANCE_CONTRACT.md requires. The test-local
helper is not a ready-made production clearance API. Nested cutters remain open.

## Validation and remaining integration work

node tools/test.js: 59/59, exit 0. editor-input-route.test.js: 4/4.
Queue page-check --ball-lab: 90 checks, real GPU, no boot/page error; inspected
page-check-shot-oriented.png. Queue page-check --region-lab: 36 checks, real RTX
5070 Ti / ANGLE D3D11, no boot/page error; inspected s3-authored-room image.
The reported .68ms/frame is the existing probe's 30-frame measurement at 604x505,
not an input-latency measurement or a new GPU timestamp guarantee.

The worker with obsolete flags (PID 2672) was identity-checked and stopped under
user authorization; its replacement runs the updated allowlist. The first restart
met the old heartbeat; starting again after expiry succeeded. No broad process kill.

Follow-up for Claude: region-lab.advance currently feeds result.state into the next
frame even when pendingLift/unresolved requires a pause. Implement the documented
pause/reset policy before claiming full viewport acceptance. Keep this separate
from gravity/portal rendering. Add an in-page regression for debt/exhaustion pause.
Also add synthetic pointer-lock/spike lifecycle coverage through actual host
handlers; Node covers the shared filter, not a physical mouse/OS event stream.

Changes uncommitted; no push. Fresh user testing should identify any remaining
snap with fixture, gravity state and whether it follows lock acquisition/portal use.
