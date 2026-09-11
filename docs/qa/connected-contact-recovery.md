# Connected preview contact recovery — 2026-09-11

Reproduced on the published fixture through the host-free preview model:
spawn sphere, yaw -0.5, forward at 0.016 s/frame. Frame 68 exhausted 96 steps
with no debt and 0.005392 s unused. The host latched a permanent halt.
Flat spawn, same input, frame 104 exhausted steps owing a 0.032765-unit settle.
The existing correction API completed that settle in one call.

The preview now reuses motionPause's debt-first policy. Debt-free work limits
and blocked exits leave steering available. A budget-limited result with issued
correction authority gets exactly one separately bounded, zero-time resume.
No travel time is replayed. A remaining debt or unresolved correction still
halts; the flat authoring boundary still requires reset. Reference up follows
the complete returned camera map, including a successful settle.

No solver, collision field, portal, renderer or tolerance changes.
This fixes a host integration error, not the cost of glancing contacts.

Evidence: connected-contact.test.js failed before the fix at spherical frame 68.
After: two debt-free stops, one flat correction, retreat without reset in both
regions; independent Euclidean/great-circle ball clearances stay outside.
Existing connected-global-model and motion-pause tests pass.
Queued page-check --connected-global: 14 checks passed on LeoPC real GPU,
including both contact/retreat cases and carried-camera roll checks. No boot error.
Full Node suite: 96/96 on Windows Node 24.20.0, recorded in
.agent-bridge/contact-suite-host.log. The first sandboxed run could not clean
the bridge test's temporary directory (EPERM); the unrestricted host run passed.

Next: independent frame-rate/approach corpus (Muse), then return to rendering
footprints. Do not remove genuine unresolved/debt pauses to make a corpus green.
