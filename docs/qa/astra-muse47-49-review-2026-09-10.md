# Astra review: walking stability and Muse 47-49, 2026-09-10

Base d3160ba plus the delivered untracked Muse suites. Host LeoPC Windows,
Node v24.20.0. MUSE-47's original report names 556cd5f; treat that as its
reported provenance, not as the source revision rerun here.

## Real defect repaired

Reproduced the S3 pinned-walking throw in the original MUSE-47 executable:
metric-space.validateTangent -> collision.sweep -> moveProbe -> walker.step.
A short slide retains tiny radial error; dividing by its tiny length magnifies
that error. Repeated uncorrected geodesic representatives also drift off S3.

metric-space.normalize now validates first, removes radial roundoff, then
normalizes the tangent. stepWithTransport retracts numerical point/direction
representatives on each nonzero leg; carries all vectors through the same
linear map with radial cleanup. No independent velocity normalization, no
camera reconstruction, no tolerance widening. Zero travel remains exact identity.
This enforces floating-point manifold constraints; it is not an unswept physical
push or permission to accept invalid input. Existing checks still reject large
radial components, unsupported geometry and nonunit directions.

The old throw pin is now a sustained successful contact regression: 1200 frames,
2733 contacts, no debt/refusals, worst radial error 1.11e-16, whole-field clearance
and carried tangent validation checked every frame. Small-vector normalization
and 10000-leg closed-form great-circle/linear-carry checks added at R=.5/8/100.
Old metric-space.js from d3160ba in an isolated temporary engine copy fails both
new metric checks (16/18) and the walking regression (9/10), exit 1 for each.
Copy removed. Current metric 18/18 and walking 10/10 pass.

## Review verdicts

MUSE-47 ACCEPTED with a corrected interpretation: selecting a reversed plane as
floorId selects gravity pointing toward that plane. Rejecting it based on author
Z would add a global up the contract does not have. The original phrase about
ceilings was ambiguous; NEXT_CAPABILITIES section 2 is clarified. Preserve the
original report as history, and retain the measured reversed-floor behavior as
a positive policy regression. The crash finding was valid and valuable.

MUSE-49 NEEDS REVISION: 6/6 rerun, useful sampled sight evidence, but varying
S3 radius was requested and only R=8 is covered. Add at least two other radii
with in-domain anchors and independently calculated physical lengths/directions.
The actual file connected-sight-truth.test.js is approved for this revision
(the assignment initially named region-sight-truth.test.js). No duplicate file.

MUSE-48 NEEDS REVISION: 4/4 rerun, exit offset and contact margin evidence useful.
- The S3 handedness number is a determinant of xyz projections. Within this
  open hemisphere its sign can track orientation, but its magnitude includes
  chart foreshortening (roughly p.w), not frame quality. Use local tangent
  coordinates or oriented 4D volume; separately check Gram matrix and tangency.
- Current fuzz creates a new frame and turns once per sample. Add actual repeated
  transport/turn paths and a reflected-frame negative control.
- The supposed undecided graze band instead asserts !hit in its else branch.
  Make near-band results explicitly inconclusive or resolve them with a tighter
  independent reference. Report counts. Check S3 initial clearance explicitly. For returned S3 sweep contacts, compare field
  distance against player radius, not merely zero: an outside center can still
  have a penetrating body.
- E3 uses an endpoint detector, not the dense oracle used for S3. A contact
  followed by penetration could escape the detector. Assert clearance on actual
  committed contact/end states and narrow the prose; no universal swept proof.
Do not discard the existing margin/exit tests to make these additions.

## Claude review

Markers: projection test 4/4 and real-handler browser checks pass. However,
markerOccluded treats a small positive conservative bound as certain occlusion,
and returns clear on budget exhaustion after starting 0.05 past the eye. That
must become a three-way editor visibility hint, not a false claim of visibility.
Assigned bounded correction in CLAUDE_NEXT.md; GPU portal work still blocked.

Host proposal is useful planning, not executed parity. Corrected two statements:
Godot exists at the previously documented Windows path (Test-Path True), and
radial author-vector norm IS origin distance in the supported normal chart.
Serializer byte identity is too strong; require structural/numeric preservation.

## Verification

node metric-space.test.js: 18/18; node spherical-walking-truth.test.js: 10/10;
node connected-sight-truth.test.js: 6/6; node invariant-evidence.test.js: 4/4;
node marker-projection.test.js: 4/4. Counts do not override the review limitations.
node tools/check-queue.js page-check --region-lab: 113 checks, no page error,
real RTX5070Ti ANGLE D3D11; walking doorway image inspected. This is
single-region rendering, not connected sight.
First full run: 69/70; s3-truth exceeded its existing 120-second cap.
Position-only advancement was then separated from transport construction and
redundant generated-vector validation removed. Both paths share the repaired
position calculation, pinned equal by the metric test; no timeout was raised.
The second full run still timed out in s3-truth. An isolated diagnostic hit
1000 coordinate-descent iterations with st/sp around 0.001: the strict greedy
reference search is sensitive to production retraction rounding. A test-local
cos/sin great-circle parameterization and ordinary tangent normalization
completed all five cases. That reference is now independent of the production
repair; all grids, 337-probe cases, resolutions and acceptance tolerances remain.
It uses fresh single-shot surface samples, not accumulated movement. The real
compiled field still uses the production kernel. Reference-global convergence
remains a sampled limitation, not a proven nearest-point guarantee.
Final rerun: node tools/test.js, 70/70 workspace suites passed. This includes
the two pending MUSE-48/49 suites, which remain uncommitted and unaccepted.
A +0.01 bias in the composed S3 field in an isolated copy fails the independent
reference center check (exit 1). An initial mutation of an unused primitive
distance wrapper did not fail; corrected targeting reaches the actual composed
field. No assertion, sample grid, or timeout was relaxed.
