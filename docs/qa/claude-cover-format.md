# Claude: cover-region v1 codec

Base ee54f24, host LeoPC win32, node v24.20.0. Uncommitted.

## Files
- `engine/world/cover-region-document.js`: `parseCoverRegion(json)` and
  `compileCoverRegion(source,{playerRadius=.25})`, written to COVER_REGION_FORMAT.md.
- `cover-region-document.test.js` (new, root).
- No changes to spherical-cover, region-portal or scene-v2.

## Behaviour
- Input is first copied into fresh plain data, then that copy is validated. It
  refuses non-plain objects, typed arrays, sparse arrays and `__proto__` keys.
- Strict key sets, including required fields for each kind. Only version 1 and
  kind `s3` are accepted. IDs must be lowercase and unique across the region,
  charts and entities.
- Chart checks use `chartAt`: unit center, orthonormal tangent basis, extent in
  (0,πR/2]. The basis must also have det>0 against `space.frame(center)`.
- Entity positions must lie inside the open chart. A ball may cross the chart edge.
- Kinds are ball, spawn and anchor. Radii must be in (0,πR/2). Anchor
  forward/up must be orthonormal within 1e-8. Exactly one spawn.
- Anchor normal/up and `spawnFrame` are the lifted chart basis, transported
  (`space.transport`) from the chart center to the placement. If the result
  misses portal tolerance (1e-8), compile refuses it rather than renormalizing.
- Spawn clearance: `distance − radius ≥ playerRadius − 1e-7`, the same slack
  region-world uses.
- Outputs are frozen. `document()` returns `structuredClone` of the snapshot.

**Interpretation for review:** the spec does not give `spawnFrame`'s shape. I made
it the transported chart basis `[e0,e1,e2]`, the same shape as `space.frame`,
with no forward/up names added.

## Evidence
- `node tools/host-probe.js`: browser could run directly; not used (Node-only task).
- `node cover-region-document.test.js`: passed. It checks:
  - Centers and anchor forward/up against independent great-circle exp/transport
    formulas (1e-12).
  - A ball in a chart centered on the antipode [0,0,0,-1]:
    `-c[3]=cos(6/R)`, distance to origin = πR−6.
  - A chart-crossing ball is accepted.
  - Transport differs from a construction-frame rebuild by >1e-4.
  - `compileFramedPortals` consumes the anchors.
  - JSON save/load with a rotated chart near the antipode reproduces every physical
    vector exactly.
  - Caller mutation leaves compiled data and `document()` unchanged; mutating a
    `document()` copy does not affect later copies.
  - 48 refusals, each also tried through JSON text.
  - Clearance to a ball placed from another chart, measured independently:
    gap +1e-4 and 0 accepted; −1e-4 and playerRadius .3 refused.
- `node global-portal.test.js`, `node spherical-cover.test.js`: passed (unchanged).
- Fail-demos ran in an isolated `git archive` temp copy, since removed. The
  unmutated copy passed before and after. Each of these changes made the test fail:
  - orientation check removed
  - no snapshot
  - frame rebuilt instead of transported
  - clearance check removed
  - `document()` shared instead of cloned
  - `spawns>=1`
  - unknown keys allowed
  - closed chart. Caught only because `decode` throws a different message.

Not run: full Node suite (lead) and browser checks (not required).
Leftover: the fail-demo driver `%TEMP%\claude-cover-faildemo.mjs` is still there.
Deleting it was blocked by permissions (outside the checkout). It is safe to delete.

## Uncertainty / next
- Test registration in the root runner is outside my allowed writes, if the runner
  needs it.
- Next: lead integrates, runs the full suite, and confirms the `spawnFrame` shape.

READY FOR REVIEW

## Lead verdict - ACCEPTED, 2026-09-11

Scope and unchanged checkout HEAD verified against ee54f24. Host rerun passed,
including 48 refusal cases. spawnFrame=[e0,e1,e2] is accepted and now specified.
Connected-world integration also passes body/sight/save-load tests. Agent's
mutation evidence is attributed above; lead did not rerun those codec mutations.
See connected-global-review.md for integration evidence and remaining limits.
