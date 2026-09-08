# Instruction layout and model handoffs

`AGENTS.md` and `CLAUDE.md` are small entry points. Both direct the agent to
`docs/engineering/WORKING_RULES.md`: one source of shared project rules.
`MUSE.md` adds Muse's narrower role and `MUSE_TASKS.md` contains bounded handoffs.
The full former duplicated instructions are preserved in
`docs/engineering/legacy-agent-reference.md`, loaded by relevant heading only.

An instruction file is not an access-control boundary. File ownership, separate
worktrees and review prevent conflicting edits; agent profiles communicate scope.
Do not put a root `AGENTS.override.md` in place to select Muse: it could replace
the normal rules for other clients too. Directory-scoped files select locations,
not models sharing the same location.

Codex discovers AGENTS.md by directory and has a default combined discovery
limit of 32 KiB; it does not infer a Muse profile from a subscription. See the
[official instruction-loading guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
For Claude, the repository's CLAUDE.md explicitly tells it to read the same
shared file. Muse's automatic loading depends on its client; until configured,
use the explicit launch prompt in MUSE.md. No external agent was launched by
creating these files, and no account/configuration settings were changed.

Task workflow: user/lead assigns one entry; Muse claims it and edits only its
allowed paths; Astra/Opus reviews the result and integrates it. Prefer one lead
writer for the queue and one worktree per concurrently edited task. Preserve
branch/hash, checks and unresolved questions in the handoff rather than copying
entire conversations into instruction files.

## Muse in Ubuntu / WSL

The current Windows checkout is accessible in Ubuntu with:

```sh
cd /mnt/c/Users/lflyn/Projects/NilGame
git status --short
```

Launch your installed Muse CLI there, then paste the prompt from MUSE.md.
WSL identifies the environment, not the CLI's instruction-loading convention;
we have not assumed any executable name or modified its configuration.
This path is the SAME working tree as Windows, not an independent copy. For
simultaneous code edits, create a task worktree/branch first and launch Muse
there. Avoid overlapping Git operations from Windows and Ubuntu.

The archived instruction snapshot retains its original root-relative paths;
resolve those against the repository root when following historical references.
