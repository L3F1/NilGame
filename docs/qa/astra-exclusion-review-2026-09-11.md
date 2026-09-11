# Connected sight review and exclusion groundwork

Base a1c0da7, Windows LeoPC, Node v24.20.0. Claude fixture accepted: focused
18/18 rerun. MUSE-52 accepted: code/report reviewed, focused 9/9 rerun; its
reference limitations remain. Baseline including Muse: 76/76 Node suites.
Claude's 15/15 mutations and Muse's reversal fail-demo are their attributed
evidence, not rerun here. New screen has a separate fail-demo below.

Regenerated and visually inspected entry-spawn and doorway images using
`node tools/connected-sight-probe.js --scale 4` and the same with `--pose doorway`
(distinct --out/--packet paths). Both 96x72 queries, 70-degree vertical field,
range 32, maxWork 2048. These are CPU diagnostic images, not GPU screenshots.

- Entry: 4141 hits, 2771 domain exits; work min/median/p90/max 3/3/38/46.
  Far target visible through the curved wall's doorway. CPU total 81.12 ms.
- Doorway: 5662 hits, 1250 domain exits; work 33/33/38/40. Far target and pillar
  visible above the far floor. CPU total 191.76 ms.
- Neither sampled view exhausts work. Both show magenta chart exits prominently;
  this is a reported domain limitation, not valid empty-space sky. These two
  samples say nothing about prevalence of authored-face degeneracies elsewhere.

## Delivered decision and mathematics

Keep domain exits explicit. Add a sufficient full-segment cell exclusion screen,
not a heuristic that skips faces just because the origin is outside a cell.
See ../engineering/S3_EXCLUSION_CONTRACT.md for derivation, API and integration.
This commit does not wire it into the classifier: existing runtime answers stay
unchanged. It does not repair every coplanar/cutter or distant coincidence case.

`node s3-cell-exclusion.test.js`: 6/6. Whole-span versus origin-only exclusion,
endpoint/coplanar guards, budgets, decimal compiled cells at R=.5/8/100, dense
independent face evaluation, immutability and invalid-input refusal.
The dense sample checks the reported face lower value, not merely cell distance.
Sampled evidence is not a general floating-point proof.

Isolated temp engine copy: replace endpoint minimum with origin value only.
Focused suite fails 3 checks (3/6, exit 1): later-entry, endpoint touch and dense
witness reference. Copy removed; working engine untouched by mutation.
Final `node tools/test.js`: 77/77 suites passed on this host.

Next: Claude integrates within the contract; Muse independently audits the
screen. Astra then reviews unresolved-pose coverage and specifies GPU precision
and traversal. No new framework or host migration in this step.
