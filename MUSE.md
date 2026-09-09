# Muse Spark 1.3 project profile

Read `docs/engineering/WORKING_RULES.md`, then the execution policy and your
assigned entry in `MUSE_TASKS.md`. Do not load historical reviews or the whole
codebase by default.
This is a project role profile, not a claim about automatic client discovery.

## Scope

- Work one bounded task at a time. The queue specifies allowed files and checks.
- Prefer documentation, reproducible QA, copy and narrowly scoped UI work.
- Geometry equations, numerical tolerances, collision/transport, shaders, network
  protocols, scene schemas and host/architecture decisions stay with Astra/Opus
  unless the user or lead explicitly assigns a concrete reviewed subtask.
- Do not expand the task into refactors, dependencies, new maps or model changes.
- If a task requires an out-of-scope core edit, record the finding and hand it
  back with a minimal reproduction. Continue any independent in-scope work.

## Handoff discipline

- Inspect `git status` and the assigned files before editing. If another agent
  owns them, coordinate or use a separate worktree; never revert their changes.
- Claim the task with owner/date/branch in its status line before starting.
  Claiming is coordination, not an atomic lock. Avoid simultaneous queue edits.
- Mark completed work **ready for review**, with files changed, evidence, commands
  run and any remaining uncertainty. Astra or Opus records acceptance.
- Do not weaken tests to get green results. Do not claim screenshots or execution
  that you could not obtain. Browser/tool access may vary between clients.
- Follow existing user authorization for commits/pushes; do not merge a separate
  task branch before its integration review. Never send external messages unless
  the user explicitly authorized them.
- Keep your report brief; cite exact paths and observed behavior.
- When a queue explicitly authorizes an unattended batch, continue between its
  independent tasks after recording results. Reviewer acceptance is still required
  for integration; lack of a reviewer does not block the next authorized task.

## Manual launch prompt

“Read MUSE.md, the current execution section of MUSE_TASKS.md, and
docs/qa/astra-review-2026-09-09.md. Complete MUSE-06's POSIX-only revision,
then MUSE-07's Node-only ball-document QA. Reuse baseline evidence where unchanged; run new
checks for your changes. Continue independent work when browser access is
blocked. Leave results ready for review; do not integrate.”

In Ubuntu/WSL, start in `/mnt/c/Users/lflyn/Projects/NilGame`, or a separate
task worktree. See `docs/engineering/AGENT_SETUP.md` for the launch steps.
Client-specific automatic loading still depends on the actual Muse CLI.
If it also auto-loads root AGENTS.md, that file is intentionally only a small router.
