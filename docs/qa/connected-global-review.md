# Connected global-region integration - 2026-09-11

Lead work on main after baseline ee54f24; Claude and Muse used isolated bridge
checkouts at that baseline. Final commit contains this report. This is a CPU
milestone, not a new browser preview or editor release.

## Delivered

- Physical-frame portal factory shared with bounded scene-v2. The legacy adapter
  preserves omitted programmatic policy defaults and resolves connected endpoints.
- Global S3 entering roots searched beyond the starting half-sphere, with finite
  disc/body fit at each root. The antipodal disc is not a duplicate portal.
- Strict cover-region v1 codec (Claude), local authoring charts with transported
  construction axes, and nil-connected-cover persistence envelope (lead).
- Additive global metric-ball collision field and connected CPU sight dispatch.
- levels/fixtures/connected-global.nil.json: flat entry, 3/4 of a full spherical
  orbit, flat return. The body goes past the antipode. A second test inserts a
  spherical blocker and checks physical clearance. JSON reload preserves sight.

## Evidence

Windows LeoPC, Node 24.20.0, RTX 5070 Ti / ANGLE D3D11. Commands on integrated
working tree; historical results in agent reports remain attributed.

- node cover-region-document.test.js: independent exp/transport and clearance
  comparisons, snapshot/JSON roundtrip and 48 refusal checks passed.
- node global-portal-truth.test.js: 45 rotated rays across R=.5,8,10000 plus
  radial/body/antipodal/velocity-roundtrip cases passed. Lead isolated old-policy
  mutation failed at the expected full-orbit case, without touching main engine.
- node global-portal.test.js: full-orbit/antipodal/range/transit checks and all
  three central frame axes passed.
- node connected-cover.test.js: two-portal sight/body route, antipode, save/load,
  collision and explicit unsupported renderer refusal passed.
- Full suite first run: 89/90. Existing cross-region-frame.test.js exposed
  omitted policy/kind compatibility in the old adapter. Fixed adapter, no test
  edits; focused test now 6/6. Final suite result recorded below.
- Queue page-check --connected-preview: 16 passed, cold real GPU. 320x240,
  75 timing samples per region: entry median .162/p90 .175 ms, curve .180/.192,
  far .184/.193. These measure the UNCHANGED bounded renderer, not global portals.
- Queue page-check --spherical-cover: 13 passed, cold real GPU. 28,800 sampled
  rays, no missed CPU hits; one conservative refusal on a CPU miss. Animated
  circuit returned within 5.48e-13 physical units. No new timing distribution.
- Saved entry and antipode images inspected. Known thin magenta seam/refusal
  pixels remain visible. Passing parity is not a claim that artifacts are gone.

## Accepted and limits

Claude's three paths and Muse's two paths passed scope checks; checkout HEADs
unchanged. Both accepted. Muse oracle is sampled transverse-ray evidence, not
proof or exhaustive grazing coverage. Claude codec mutations are agent-reported;
lead inspected tests and reran acceptance, not the codec mutation harness.

Scene-v2 remains bounded. Global subset has balls, anchors and a spawn, no CSG,
walking gravity or editor UI. Mixed-world renderData throws until global packets
and GPU queries exist. Existing browser previews remain separate. Next task is
coverage-tagged connected rendering, retaining explicit uncertainty, CPU collision
authority and tested precision limits. See NEXT_SESSION.md.

Final integration: node tools/test.js exited 0, 90/90 suites passed. The queued connected-preview browser check was repeated after the legacy adapter repair and passed again (16 checks).
