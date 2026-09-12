# Distance drift at (6,43) — read-only review (Claude, base bd25fe3)

## Observed facts (from docs/qa/live-miss-pass-review.md and code)
- Three hardware failures show the same two values: 2.594223976135254 -> 2.594233274459839. The pixel packet (hit, region, owner) did not change. SwiftShader never failed.
- The failures came in runs after the pass GLSL changed: first in the filter trial, then in the eligibility trial. The main fragment shader did not change. Later reruns passed.
- `before` is read at 160x120 before `frameCost` resizes to 320x240. `after` is read later, with refinement on. Each `read` makes separate debug 1 and 2 draws, and each draw regenerates certificates.
- In the code at bd25fe3, `repeatedOff` and the primary rays run only inside the failure branch (`app/connected-global-preview.js:440-444`). The off/off baseline check described in the doc is not in this commit. No failing run has recorded those diagnostics.
- In the shader, `stable`, `newP` and `newU` are computed before the certificate block, and `uMissPass` does not feed them (`connected-shader.js:372-386`). Certificates reset at every crossing and at each sample (`:386`, `:437`). `certifiedMiss` only removes primitives in the certified S3 region (`:224`, `:240`).

## Hypotheses
1. **Compile or context state, not refinement logic.** Going by what the shader says, refinement should not be able to move a hit before the transfer, and the fact that it fails with the same two values fits two code paths better than random noise. *For:* the failures followed pass-shader source changes, which means a cold compile. SwiftShader is clean. *Against:* the two off/off runs passed, but they never reached the drifting state either. The mechanism (ANGLE shader variants or cache, FXC/driver codegen) is guesswork about the driver.
2. **Whether a certificate is accepted depends on the compile.** The main program accepts a certificate only if its transferred point and direction bit-match the pass program's (`:395`). The two programs are compiled separately. If (6,43) crosses into S3 first, an accepted certificate changes which primitives are omitted. *For:* only on-draws have drifted, and the failures lined up with pass-GLSL edits. *Against:* skipping a proven miss should not change the root of the hit, and a hit reported in E3 means the certificate was already reset. Nobody has confirmed that this pixel transfers at all.
3. **GL state leaking out of `generate`.** *Against:* the `finally` block restores the framebuffer, draw buffers, viewport and unit 0 (`spherical-miss-pass.js:135-141`). Uniforms belong to each program. A wrong binding would cause large errors, not a 9e-6 change. *Remaining risk (driver guess):* units 1-3 stay attached to the unbound pass framebuffer, which ANGLE/D3D11 has to handle. Least likely.

## One experiment
Log this for pixel (6,43) on every run, not only on failure, over several cold real-GPU runs with a fresh profile. Include one run straight after a no-op edit to the pass GLSL.
Right after `after`, alternate off/on/off/on/off/on/off/on at 160x120 and record:
- the debug 2 distance
- the debug 8 bytes (accepted, `certificateUsed`)
- the pass's own certificate tag at that pixel

How to read it:
- **H2:** the drift appears exactly when accepted=1 and used>0.
- **H1:** the drift appears with accepted=0, or the off values also differ from `before`.
- **H3:** only the first on-draw after generation differs.

## Checks
- No code edits, browser runs, tests or `host-probe`: the task said read-only with no browser runs, so I skipped the probe.
- The only file written is this report.

READY FOR REVIEW

## Lead review (2026-09-12, main 52bf179)

Accepted as a scoped investigation report, not a diagnosis or an executable
experiment specification. Candidate patch contains only this report. Source
spot-check: connected-shader.js resets certificateRegion at EVERY crossing;
certificateUsed accumulates until the next sample. Therefore debug 8 red means
certificate still active at trace termination, NOT ever accepted. A zero red
channel cannot rule out earlier acceptance. The shader comment is misleading.

The proposed H1/H2/H3 classification is not conclusive: correlated acceptance
and drift does not identify a cause, and a first-on-only change does not prove
GL leakage. Separate debug draws also cannot prove what occurred in the exact
distance-producing invocation. Preserve these as hypotheses.

Next bounded experiment: first capture the unchanged shader's existing distance,
status/owner, primary rays, debug-8 final-active flag and cumulative omission
count for alternating off/on reads, before throwing the current strict failure.
Record shader/world/pose identity and resize order. Report these as separate
invocations, not one atomic ray record. Do not add an ever-accepted shader flag
until this baseline is captured: changing the shader changes the experiment.
Cap the first batch at two cold hardware runs; if neither reproduces, stop and
retain the open issue rather than run a broad compiler-variant sweep.

52bf179 already adds the off/off resize guard missing from Claude's bd25fe3
checkout. No runtime edits or new browser/full-suite runs in this review.
Host probe confirms browser work must use the queue.

## Bounded capture result (2026-09-12)

Implemented capture in the existing live-pass browser check, without editing
either shader. Debug evidence can now explicitly draw with refinement off;
optional per-pixel candidate readback records the tag and mask. Existing
settled-pixel comparisons are unchanged. The renderer API comment now describes
its legacy accepted count as final-active, not ever-accepted.

Two cold queue runs on LeoPC / RTX 5070 Ti / ANGLE D3D11 passed. Both retained
34 recovered fringes. All sixteen alternating samples at (6,43), 160x120,
range64, had distance2.594223976135254 and the same primary ray; every debug
read had finalActive=0 and omissions=0. On-draw candidate texels were all zero.
This does not establish what happened during the historical failures.

Durable evidence: [distance-drift-capture.json](distance-drift-capture.json),
including exact source/world hashes, pose, hardware and draw sequence. Local
logs: .agent-bridge/drift-capture-real1.log and drift-capture-real2.log.
Readback fields come from separate invocations. Off-draw candidate textures
can be stale and are deliberately not reported as current certificates.

No further cold runs or shader variants: the agreed stop condition was reached.
The issue remains OPEN. Retain capture for the next naturally occurring failure;
do not spend another session repeating identical cold runs. Next bounded task:
assess sustained-motion cost of the opt-in pass at playable resolution, keeping
strict settled-answer parity and default-off admission. AA remains unsupported.

Validation: node tools/test.js passed136/136 suites on LeoPC (log
.agent-bridge/drift-capture-suite.log); git diff --check passed. No visual
repair claimed and no tests relaxed.
