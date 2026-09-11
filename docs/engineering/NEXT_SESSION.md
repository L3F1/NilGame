# Fresh-chat handoff for Astra

2026-09-11. Start with git status/log, WORKING_RULES, relevant TASK_ROUTER row.
Reviewed Claude a1c0da7 fixture/tool (18/18), Muse52 (9/9), baseline76/76.
Report: docs/qa/astra-exclusion-review-2026-09-11.md.

Implemented only engine/geometry/s3-cell-exclusion.js and focused tests:
sufficient whole-ray exclusion by one spherical cell face, closed physical
range <=piR, numerical guards, explicit unknown and budget accounting. Not yet
wired into classifier. Read S3_EXCLUSION_CONTRACT.md; it is the active contract.
Origin-only pruning is wrong; isolated mutation fails three new checks.
No floating-point formal-proof or GPU performance claims.

Claude integrates constant-false cells into existing Boolean groups under
CLAUDE_NEXT.md. Muse53 independently audits helper only. Check both before GPU
work, especially authored-plane pose sweeps, longer ranges entering a previously
excluded cell, intersects/subtractors, work caps, raw primitive versus scene
refusals. The helper cannot fix every coplanar or distant coincident event.

Two CPU diagnostic images regenerated/inspected; far target visible through the
curved passage. Domain exits dominate magenta background and remain explicitly
unresolved. No sky policy or chart collision wall added. Packet carries region
IDs even where reason colors do not. CPU ms are not GPU frame times.

Next Astra: review integration plus independent witnesses and pose refusal data,
then decide GPU precision/traversal acceptance. JS double guards cannot be copied
to GLSL float. Renderer/editor still single-region; cross-region walking support
remains separate from tested connected CPU motion and single-floor S3 walking.
Godot host experiment is not scene-v2 parity; preserve browser reference.

User asked about automatic Claude/Muse handoffs. Local help verified claude.cmd
(noninteractive) and Ubuntu muse exec --json / --prompt-file plus session-message.
No jobs launched, permissions changed, or auto-wake bridge configured. CLI output
can be collected in an active turn; waking this exact IDE thread requires a
separate integration, not just a done file. See AGENT_SETUP.md automation section.
