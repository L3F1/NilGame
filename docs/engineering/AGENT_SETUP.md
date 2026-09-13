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

Implemented later the same day: [AGENT_BRIDGE.md](AGENT_BRIDGE.md) is the current
launch/status guide. Claude integration and MUSE-53 were dispatched automatically
in isolated checkouts, with one read-only Astra completion review enabled.
The notes below record the CLI discovery that informed the implementation.

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
a completion callback into the currently active IDE thread. The implemented
bridge uses a separate Codex review session and saved result, not IDE injection.

If implemented later: start one explicit bounded task per agent/worktree, record
session ID/base hash/allowed files/checks, serialize integration and browser
checks, collect result plus exit status, and stop for lead review. Do not resume
`--last` in concurrent jobs or launch recursive agent-to-agent loops. Use the
existing handoff files as task inputs; avoid pasting entire conversations.

## Seeing what Muse has spent

There is no way to ask the client how much subscription quota is left. `muse`
has no usage or quota subcommand, its bridge JSONL carries no token counts
(unlike Claude's, which the bridge already parses), and the provider states the
limit only when refusing: `Subscription quota exhausted. Your usage window
resets at <ISO time>`. That refusal is the single authoritative signal, and it
arrives too late to plan around.

The spend side IS readable. Every session log under
`~/.local/share/muse/sessions/<year>/<month>/<day>/<id>/session.jsonl` records
per-call usage - input, output, reasoning, cached, cache read and cache write
tokens - plus the client's own accounting stream tagged by `usage_family`
(provider, tool, reminder, compaction) with a `reported` flag.

`node tools/muse-usage.js [--days N] [--since <ISO>] [--root <path>]` reads those
over the WSL share and prints a per-UTC-day ledger, the reported accounting by
family, the largest sessions, and every quota refusal recorded under
`.agent-bridge/runs`. It is a PROXY: it counts what the client recorded, not
what the subscription meters, and the two can differ on model weighting and on
how cached reads are billed. Note that cached reads dominate - in the measured
span they were 94% of all input tokens - so the ledger reports fresh input
separately, since that is the figure most likely to be metered.

To calibrate a ceiling, which is the only way to get one: note the totals when a
refusal lands, and compare across windows. The one refusal observed so far came
at 2026-09-12T08:25Z and named a reset of 2026-09-14T00:00Z, so the window is
NOT daily - a second observation is needed before its length is known.

## Spending Muse tokens well, measured

`node tools/muse-usage.js --bridge` prints what each assignment actually cost.
Measured over twelve bridge runs:

| Assignment | Turns | Total input | Startup floor re-sent |
| --- | --- | --- | --- |
| muse67-h3-balls-revision | 17 | 0.68M | 68% |
| muse71-h3-sight | 39 | 2.38M | 45% |
| muse69-aperture-motion | 48 | 3.46M | 38% |

Three facts fall out, and they change how an assignment should be written.

**Turns are the price.** Input runs about 70k tokens per turn on average, because
every turn re-sends the whole conversation. Cutting ten turns saves roughly 700k
tokens - a third of a heavy assignment. Nothing else on this list comes close.

**The startup floor is paid per turn, not per run.** Every session begins at
about 27.5k tokens of client preamble, and it is 38-68% of each assignment's
entire cost. That part is the client's, not ours, so the only control is turn
count: short assignments are disproportionately cheap and long ones
disproportionately expensive.

**Reading a file costs its size times the turns that follow.** A file of T
tokens read at turn k of N adds about T*(N-k) input tokens. docs/qa/muse-log.md
is 47k tokens; read at turn 3 of 30 it would add about 1.3M - more than a whole
typical assignment, for one file. "Read only your task contract" is a cost rule
before it is a focus rule.

So, when writing an assignment:

- Name the exact files to read and the exact commands to run. A 600-token
  instruction that prevents five exploratory turns pays for itself 500 times.
- Say what NOT to read, by name. The archive, the roadmap and the log are the
  expensive mistakes.
- Keep one task per session. A follow-up in the same session starts at the
  accumulated context, not at the floor.
- Keep the tool-output cap. The bridge already passes
  `--max-tool-output-bytes 12000`; a single unbounded suite dump would ride
  along in every later turn.
- Do not ask for a full suite twice. The bridge prompt says so; the reason is
  that its output re-enters context for the rest of the run.
- Prefer several small assignments over one large one, and accept the extra
  27.5k floor each time: at 70k per turn, one avoided turn already pays for it.

