# Bridge and spherical exclusion integration

Base 7e61c4b plus this commit's working changes. Host LeoPC, Windows, Node
24.20.0. Initial run: 2026-09-11T06-32-35-009Z-b17bafe7. Logs remain local.

Claude Opus 5 launched automatically, produced a partial classifier change, then
hit its account limit. The bridge recorded needs-attention; no retry scheduled.
Muse completed its initial audit. One read-only Codex callback reviewed both and
held both: agent-bridge-first-review-2026-09-11.md preserves that review.

Astra completed the classifier locally and sent Muse only the three corrections.
Muse's revision terminal event reports completed; its Windows wrapper exited 1.
Acceptance therefore relies on inspected files and rerun checks, not wrapper
status. No second automatic review ran. Initial bridge metadata is historical;
this report records the follow-up. MUSE-53 accepted after revision: corrected
plane projection, far-only endpoint touch, tighter reference allowance and an
isolated origin-only mutation reported failing seven checks. Its reference is
sampled evidence, not a theorem. Astra qualified the libm-error wording without
changing assertions. See muse53-cell-exclusion.md.

The local VS Code extension installed and its version was verified by CLI. User
reports reloading; notification appearance was not independently inspected. It
watches files and opens reports, with no model calls or chat injection. Codex
executable discovery follows installed extension metadata after upgrades.

## Kernel result

Excluded cells become constant false through the existing scoped groups for the
whole requested segment. They request no roots or supply contact normals/owners.
Longer spans are screened afresh. Screening spends the shared maxWork allowance;
one-face exclusion costs one unit. Relevant coplanar cells still refuse.

Focused checks: spherical classifier 23/23, connected fixture 18/18, connected
independent queries 9/9, bridge 10/10. Budget checks cover one-unit exclusion,
19-unit relevant-cell hit and 56-unit connected traversal. Smaller caps refuse.
A short authored-plane ray excludes through another face; a longer ray reaching
that cell retains primitive-events refusal.

CPU diagnostic commands:

```
node tools/connected-sight-probe.js --scale 4 --out .agent-bridge/exclusion-entry.png --packet .agent-bridge/exclusion-entry.json
node tools/connected-sight-probe.js --pose doorway --scale 4 --out .agent-bridge/exclusion-doorway.png --packet .agent-bridge/exclusion-doorway.json
```

96x72 rays, 70-degree vertical field of view, range 32, budget 2048. Both saved
images inspected: far target visible; no new structural artifact observed. Hit
owners/counts match prior packets. Entry: 4,141 hits / 2,771 unresolved; doorway:
5,662 / 1,250. All unresolved are domain-exit; none exhaust budget.

| Pose | Work min/median/p90/max | Total work | Single-run CPU ms |
| --- | --- | --- | --- |
| Entry | 3/3/32/58 | 53,325 | 91.72 |
| Doorway | 45/45/50/52 | 320,584 | 243.46 |

Historical baseline: entry 3/3/38/46, doorway 33/33/38/40. Screening helps some
rays and adds overhead to others. Single CPU timings are not representative
frame-time distributions or GPU measurements. No GPU path promoted. Remaining
coplanar refusals, broader pose coverage and GPU precision need further work.

Final host run: `node tools/test.js > .agent-bridge/bridge-suite-host.log`,
79/79 suites passed, exit 0. Host execution was needed for subprocess-test
cleanup permissions; sandbox EPERM did not change test assertions.
