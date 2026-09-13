# Serialized enclosure renderer candidate (2026-09-12)

Base c089e29. The candidate now runs through separate producer and consumer
programs in the actual renderer. It is selected only by the constructor option
{enclosureRefinement:true}; the normal editor/default renderer is unchanged.
This is a candidate for further acceptance, not UI admission.

## What changed

The producer exports a fourth RGBA32F attachment with point/direction radii
and a certified angular upper bound. It recomputes enclosureCurveExterior over
the exported symmetric boxes, bounds (maxDistance+8E)/R outward, and refuses
unsupported data. Tag25393 plus sample index distinguishes this payload from
the earlier tag21393 payload. The consumer retains selected-gate, first-crossing,
world/draw/sample and expiry rules, replacing exact nominal equality only with
the conservative membership test. Its spherical at() evaluates one shared
sincos pair. It does not normalize the accepted state again.

The variant builder uses checked single-occurrence substitutions against the
existing shader strings; a changed insertion contract throws rather than
silently emitting an incomplete specialization. It does not copy the renderer
or add interval arithmetic to its primary shader. Inherited comments describing
exact identity in the base string describe the default variant; the membership
specialization is the exception described here.

Four attachments cost64 bytes per physical texel. The64 MiB cap admits
480x360 four-sample AA and refuses640x480. A failed/refused producer disables
consumption and retains the opted renderer's ordinary shared-pair path.
Legacy fallback equivalence is checked separately against the default renderer.
Sampler/attachment limits are checked, radii are cleared before every draw,
and all four attachments are disposed by the existing lifecycle.

## Evidence and limits

The probe compares default off, candidate off and candidate on packets at65x49
and160x120. Every changed settled pixel and default/candidate-off mismatch is
recorded and vetoes further acceptance. Every newly resolved pixel must agree
with the CPU query in region, owner and distance (the existing0.001 comparison
threshold). CPU agreement supplements, rather than replaces, the enclosure
and curve-error checks. A640x480 AA refusal must preserve the color buffer
exactly, followed by successful regeneration at small size.

The initial hardware run recovered1 and30 pixels at the two sizes, with zero
settled changes or default/off changes. Saved before/after images were inspected:
fringes shrink; unresolved colors remain visible. This is one pose and two
resolutions, not a global renderer guarantee. The final evidence below records
the rerun with CPU checks and the software result.

Timing samples cover BOTH producer and consumer at160x120 with default polished
materials/AO. They are GPU milliseconds when the query extension supplies them;
draw/finish call durations are recorded separately and are not GPU latency.
coldBuildMs measures the candidate main-program constructor only, excluding
lazy producer compilation/first draw. Do not compare these figures directly
with older320x240 figures or describe them as FPS.

The recording GL tests now have298 checks, including fourth-buffer allocation,
sampler4, AA480/640 memory boundary, regeneration and individual missing
attachment/sampler capabilities. The default shader strings remain unchanged.
The older connected browser checks still run alongside this experiment.

## Next and stop condition

Before exposing the candidate, test producer/consumer ownership mutations
(wrong sample/gate/tag, state outside the serialized radius, expired payload),
AA against an independent supersampled candidate, and additional movement/edit
poses. Preserve strict settled-pixel guards. Measure real image improvement
and total cost at the intended interactive resolution. If that acceptance
fails, leave the candidate unexposed and move to hit-side root intervals;
do not broaden the allowance or restore ideal-only certification to recover
an old pixel count. No new geometry is on this critical path.

## Final GPU result

Both backends passed. Each recovered1 pixel at65x49 and30 at160x120; all31
new answers agreed with the CPU, with zero settled changes or default/off
changes. Memory refusal and recovery passed. On this run, the old exact-identity
path recovered16 hardware pixels and34 software pixels at160x120; the stronger
candidate is not asserted to dominate every old result.

Hardware160x120 GPU times were approximately0.08ms off /0.13ms on; software
approximately26ms /48ms (12 samples each). These are low-resolution samples,
not interactive-resolution acceptance. Hardware main-program construction took
17.8s; software construction15ms excludes its deferred first-draw compilation.
Do not infer equal startup costs from these two constructor values.

[Machine-readable evidence](enclosure-integration-evidence.json) contains all
samples and renderer strings. Inspected hardware images:
[before](images/enclosure-candidate-off.png), [after](images/enclosure-candidate-on.png).

Final Node regression:139/139 suites passed, including298 spherical-miss-pass
checks. Syntax and diff whitespace checks passed. No agents remain assigned.
