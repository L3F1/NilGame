# S3 scene queries connected to sight — Astra, 2026-09-10

Base 5877847, Windows LeoPC / Node v24.20.0.
MUSE-51 accepted after review and rerun (9/9), with original limitations intact.
Claude classifier accepted with the integration corrections below (21/21 after
new checks; original submission 19 tests). Primitive root guards are numerical
screens, not formal interval certification.

## Delivered

traceRegionSight defaults to s3Method:'events', dispatching S3 legs to
castSphericalRegion. One maxWork budget spans domain queries, aperture queries,
transits and all region casts. S3 work is passed the remaining allowance and
charged back exactly. E3 still uses its existing analytic query. Hit metadata
retains surfaceOwner and additiveOwners; owner aliases the unique additiveOwner
and may be null for genuinely multiple owning groups. Local query.t/distance
and whole-route result.distance are deliberately distinct.

s3Method:'march' preserves the previous conservative reference path. It still
returns unresolved/surface-candidate for a small positive bound, never a hit.
The original tests of that behavior now request the reference mode explicitly;
new tests assert default event hits. No automatic fallback hides event refusals.

The coordinator clips each cast at its next aperture/domain/range event, carries
physical range and tangent, and maps portals without the player's exit offset.
Domain/aperture ambiguities remain unresolved. Renderer/editor gates stay as-is;
this is a CPU query integration, not connected GPU rendering.

## Corrections before integration

- Event application previously incremented work before refusing, reporting
  maxWork+1. Check before increment now; integration sweeps caps 0..29.
- Zero-length casts now classify origin only: definitely empty is miss, occupied
  is hit at zero without a surface normal, near-boundary is unresolved. A ray
  may end exactly at a mapped portal endpoint, so throwing was not acceptable.
- Inside/empty early returns now apply the input-roundoff screen rather than
  bypassing it. Unsupported ball degeneracy is also fenced before occupancy.
- MUSE-51's decimal-frame finding is fixed for plane poles. A great-sphere
  boundary is dot(p,n)=0: multiplying n by a positive scalar leaves it unchanged.
  We retain compile-scale validity checks but remove the tighter UNIT-length
  screen for planes. Coefficient-scaled root guards and normal normalization
  already support their actual stored poles. Ball centers, which compare against
  a nonzero cosine level, keep their tight unit check. No pole, frame, field,
  primitive dimension or saved scene is normalized/rewritten by this change.

## Evidence

node s3-ray-cast.test.js: 21/21, including zero range, budget accounting,
inside-start drift refusal, and decimal frame roots with unchanged stored poles.
node region-sight.test.js: 17/17. S3 ball hit after entry at total distance 1.8;
S3 plane only .00001 beyond the exit hit at 1.00001; E3-S3-E3 carved passage
stays open (4.5 total), off-center ray hits its wall; zero-range exit and budgets.
node connected-sight-truth.test.js: 7/7 (old conservative S3 checks retained).
node s3-ray-events-truth.test.js: 9/9.
Old 5877847 event/cast/sight modules in isolated temp copy fail new regressions:
region sight 13/17, classifier 17/21, exit 1 each. Copy removed; engine untouched
by fail-demo. node tools/test.js: 74/74 suites passed (completed 2026-09-11). No browser rerun or GPU performance claim in this CPU-only integration.

## Next

Claude: build a small valid connected fixture and CPU diagnostic image/ray packet
under CLAUDE_NEXT.md. Muse: MUSE-52 independently audits composed S3 queries and
cross-region integration. Astra: review their evidence, especially unresolved
coverage in actual scenes, then specify GPU traversal/precision acceptance.
A distant coincident primitive event can conservatively refuse an earlier hit;
this known completeness/performance limitation remains, not a false miss.
