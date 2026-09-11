# Portal transaction review — 2026-09-11

Base: main 2960a75, Windows LeoPC, Node24.20.0.

Added addPortalPair and reconnectPortals to the connected preview model.
They publish a detached final graph through the existing compile, clearance,
host-upload and history boundary. Rewritten base connections move to the
envelope; untouched base connections retain ownership. No collision, ray,
shader or tolerance changes. No new browser controls in this increment.

`node portal-authoring.test.js` passed: pair creation/history/persistence,
immutable input, invalid IDs/charts/frames/radius, player/spawn aperture checks,
host rejection, occupied endpoints, batch swaps, directed-portal capacity and
nonempty base-connection migration with undo/redo.

Isolated mutation (`node .agent-bridge/portal-authoring-fail.mjs`) removes the
migration. The test fails with `unknown anchor sphere-entry`; main sources stay
unchanged. Scratch runner is local ignored evidence, not a shipped dependency.

MUSE-62 accepted after reading and rerunning `node portal-authoring-truth.test.js`.
Its useful evidence covers centre crossings both directions and an obstructed
destination. Its document reconstruction is not an editor atomicity/undo test;
the new API suite supplies that. Its empty untouched-base assertion is vacuous;
the new suite uses two actual base pairs. Camera adapter identity and unit length
do not prove that the entire carried orientation is correct. No universal
aperture-clearance or transport theorem is claimed.

Real-GPU queued `page-check --connected-global`: 37 passed, no page errors.
This checks the existing editor remains functional; new-pair GPU controls and
their screenshots still require Claude's follow-up and lead browser review.

Host `node tools/test.js`: 101/101 suites passed. Full output retained locally
in .agent-bridge/portal-authoring-suite.log. No new graphical appearance claimed.
