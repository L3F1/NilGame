# H3 image and per-pixel reference

Lead on LeoPC/Node24.20.0, base47dba7c. The existing connected-sight-probe now
accepts explicit experimental-h3 runtime and all-pixel records. Default runtime
still refuses H3. Packets embed the saved scene plus hit positions/normals;
replay no longer depends on an unchanged external scene path.

Reproduce the inspected CPU diagnostic image:

```sh
node tools/connected-sight-probe.js --runtime experimental-h3 --scene levels/fixtures/connected-h3-cpu.nil.json --pose h3-entry --width 65 --height 49 --range 6 --rays all --scale 4 --out .agent-bridge/h3-entry-reference.png --packet .agent-bridge/h3-entry-reference.json
```

Observed 3185 rays: 70 hits on hyperbolic/landmark, 3115 misses, zero unresolved,
zero work-budget exhaustion; maximum work14. CPU query time59.13ms for the grid
on this run, not a GPU frame measurement. Inspected image: white ball footprint
against dark diagnostic background; no surface lighting or portal outline.

hyperbolic-sight-packet.test.js replays all825 records from each of entry and
H3-landmark camera views, with owner region, distance, hit point and normal.
JSON normalizes signed zero; replay comparisons explicitly use its numeric
representation. Dropping all-pixel output fails 4 vs825 records in an isolated
mutant. Existing connected-sight-fixture suite18/18 remains green.

MUSE-70 acceptance: replaced its frame[0] pseudo-tangent with an actually
orthogonal direction and replaced copied production classification with
expectations from constructed cases. Lead run: 9 documents,162 queries,
18 hits/36 misses/108 unresolved. The old report's42/102 split is historical.
Isolated B>0 mutant still fails two off-centre tangential cases. This is sampled
evidence, not proof; large-R views remain near-origin under the audit's extent cap.

Next: accept MUSE-71, then GPU H3 implementation using these reproducible pixel
queries. Preserve refusal visibility and compare geometry/ownership before
polishing light/AO. No H3 GPU rendering landed in this change.

Full node tools/test.js:121/121 suites (h3-reference-suite.log). No GPU check
needed for this Node-only tooling/audit change; no new GPU performance claim.
