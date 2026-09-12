# Claude project entry point

Read AGENTS.md and docs/engineering/WORKING_RULES.md before changing project files.
These are the same shared rules used by Astra; maintain them in one place.

Follow the current task and roadmap. Coordinate bounded Muse handoffs through
MUSE_TASKS.md; see docs/engineering/AGENT_SETUP.md. Read historical reference
sections only when relevant to the subsystem being changed.

## Compact instructions

Preserve the assigned contract, allowed paths, edits, exact failing checks and
one next action. Summarize completed exploration; do not carry whole logs or
archived task history. Read targeted ranges and save verbose test output to a
file, inspecting failures and the final summary. Avoid source-regex tests that
only restate the implementation. Stop at the assigned delivery boundary.
