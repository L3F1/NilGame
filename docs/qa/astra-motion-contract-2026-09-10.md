# Motion carry prerequisite and region policy

Host: LeoPC, Windows, Node v24.20.0. Base 7c68a62 plus preceding uncommitted
Astra camera/docs changes. No commit/push. Scope: one contract and its prerequisite.

The review found moveProbe discarded sweep's transport map; camera consumers
could not follow slide/lift/settle via its public result. Historical contact
normals also lacked point provenance. walker.js remains three-component and is
not a valid S3 integration merely because collision.js now supports S3.

Changes: moveProbe.carry composes committed sweep, lift and settle maps, without
contact projection. It snapshots the input point and validates input tangents.
contactSamples pair original contact points with normals; legacy contacts remain.
The pending settle normal is also carried along subsequent travel.

node motion-carry.test.js failed before the change: 0/2, exit 1, missing carry.
After: 2/2, exit 0. The curved slide compares rotating-plane transport against
the independent per-leg endpoint formula and checks that shortest overall
endpoint transport differs. Also tests zero-time identity and normal provenance.
node curved-collision.test.js: 12 passed. node collision.test.js: 22 passed.

REGION_MOTION_CONTRACT.md fixes ownership, remaining-time accounting, correction
policy, atomic destination checks, domain exits, tie handling and budgets.
CLAUDE_REGION_HANDOFF.md scopes implementation and the conditional independent
Muse review. NEXT_SESSION.md is sufficient to restart without the chat history.
No region coordinator, curved walker, editor or renderer integration is claimed.

node tools/test.js: 48/48 suites passed, exit 0, including the motion and
cross-region frame regressions. git diff --check: clean. Browser checks were not
run: no new GPU/UI path, last host probe found no available worker.
