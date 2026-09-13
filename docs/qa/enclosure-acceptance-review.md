# Enclosure acceptance: payload rejection and AA (2026-09-12)

Base52b907f. Default editor/rendering unchanged. This closes two bounded
acceptance items for the optional enclosure renderer, not final UI admission.

## Work split

Claude implemented optional reference constructor options in the EXISTING AA
checker and a wrapper selecting enclosureRefinement for both independent
contexts. The default checker is unchanged. Lead reviewed the patch, prefixed
candidate screenshots, wired it into the browser check and ran GPU acceptance.
The bridge used a fresh isolated checkout, no automatic review/follow-up:
8 turns,4469 output tokens. Its estimate is not subscription usage.

Lead added diagnostic certificateFault IDs1..6 to the experimental renderer:
old/wrong tag, wrong sample tag, wrong gate, negative point radius, shifted
point centre, shifted direction centre. These deliberately corrupt test data;
production callers must leave the default0. Other values and use on the ordinary
renderer throw before drawing. Each producer draw resets the uniform, so a
normal draw cannot retain the preceding fault.

At65x49 every fault must produce zero accepted/omitted certificates and a
status/distance packet identical to ordinary tracing. Valid consumption must
recover afterwards. The H3 expiry check observes rays with cumulative omissions
but no active certificate at the matching H3 output pixel. Status and certificate
metadata are separate debug draws; this is a sampled lifecycle witness, not a
joint per-ray proof. An explicit invalidation/disabled draw is also checked.

## AA scope

The independent2x reference has a different GL context and resolution but
SHARES the candidate shader implementation: it tests AA/sample correspondence,
not independent mathematical correctness. Existing color, unresolved-sample,
debug-packet, resource-refusal and recovery assertions were retained verbatim.
No threshold was loosened. All four sample lanes must contribute. Numerical
refusals remain purple; domain decoration pixels are counted separately.

Hardware passed all six faults with identical fallback and45 expiry witnesses.
AA recovered10 pixels at65x49 and34 at160x120; maximum compared color error was
below one byte. Hardware320x240 AA GPU medians were0.489ms off /0.772ms on
(12 samples each, full renderer draw). These are sampled GPU times, not FPS.
The final machine-readable evidence will include the software run and Node suite.

## Remaining scope

Keep the candidate unexposed until additional moving-camera/edit poses, boundary
resolutions and startup behavior have been reviewed. The shader-build cost and
software-frame cost are still material; optional refinement must retain a clear
fallback. Do not change the mathematical allowance to recover more pixels.

Claude's original report records Node-only checks in its isolated checkout.
This lead review supersedes its READY FOR REVIEW status once final validation is
recorded below. No Claude/Muse task remains running and no follow-up was launched.

## Final GPU verdict

Hardware and SwiftShader passed all six rejection/fallback cases and45 expiry
witnesses. AA recovered10/34 pixels at65x49 /160x120 on each backend. Maximum
color discrepancy was0.826 hardware /0.879 software bytes, below the unchanged
2-byte threshold. Existing normal AA checks also passed. Candidate screenshot
was inspected: remaining numerical refusals remain visibly purple.

Software performance is INCOMPLETE: only4 of12 baseline AA GPU queries drained
before the deadline. The refined timing case was correctly skipped, preventing
misattribution; do not quote the partial baseline as a representative timing.
[Full evidence](enclosure-acceptance-evidence.json) retains that status.

Claude implementation accepted after lead review and host GPU checks; report
node-suite verdict below before integration. Only the assigned files came from
Claude; screenshot prefixes and main wiring are lead changes. No automatic
review or follow-up consumes additional Claude tokens.

Final Node suite:139/139 passed, including304 spherical-miss-pass checks.
Syntax checks and git diff --check passed. This batch is accepted for the
experimental renderer; default/UI exposure remains pending the scope above.
