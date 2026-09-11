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

## Automation options verified 2026-09-11

Local help confirms Windows `claude.cmd` supports `-p`, `--output-format json`
and explicit `--resume` session IDs. The PowerShell `claude.ps1` shim fails this
host's execution policy; the installed CMD launcher prints help successfully.
No execution-policy change is needed for that launcher. See
[Claude programmatic usage](https://code.claude.com/docs/en/headless).

Ubuntu `muse exec --help` confirms `--prompt-file`, `--json`, `--max-model-steps`,
explicit workspace/worktree selection, and session IDs. `muse session-message`
can list/send messages to Muse session targets; cross-client delivery to this
Codex IDE thread has NOT been established. `muse --disable-approval` is the
installed option for disabling tool approval prompts only; unlike `--yolo`,
it does not also disable the sandbox. This review did not enable either option
or change saved settings. Headless jobs should have an explicit permission scope
and must report refused operations rather than silently retry outside it.

A bounded launcher can supply a task file, collect JSON output and notify a
supervisor on process exit. This is feasible CLI orchestration, not control of
an arbitrary already-open VS Code chat. Codex supports
[noninteractive runs and resumption](https://learn.chatgpt.com/docs/non-interactive-mode)
and a programmatic [App Server](https://learn.chatgpt.com/docs/app-server).
Those enable a separately managed workflow; they do not by themselves install
a completion callback into the currently active IDE thread. No bridge, agent
job, account change or automatic review loop was installed in this review.

If implemented later: start one explicit bounded task per agent/worktree, record
session ID/base hash/allowed files/checks, serialize integration and browser
checks, collect result plus exit status, and stop for lead review. Do not resume
`--last` in concurrent jobs or launch recursive agent-to-agent loops. Use the
existing handoff files as task inputs; avoid pasting entire conversations.
