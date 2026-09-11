# Automatic Claude / Muse handoffs

The bridge is a local Node supervisor using installed agent CLIs. It launches
the two assignments in tools/agent-bridge-tasks.json automatically, collects
their outputs and candidate patches, then optionally launches one read-only
Codex review. No API keys are copied into the repository. Existing CLI accounts
and configured default models are used; these runs consume their normal usage.

## Use

From the main checkout, after reviewing the bounded task manifest:

```sh
node tools/agent-bridge.js start --review
node tools/agent-bridge.js status
```

Start returns immediately. The hidden supervisor continues after the invoking
terminal/agent turn ends. The `--review` switch automatically sends the completed
handoffs to Codex, once, in a separate read-only session. This does not inject a
prompt into the already-open VS Code conversation. It does not launch another
implementation round or integrate results. Read-only review can inspect test
evidence; a lead must rerun relevant checks before integration.

Local VS Code tasks named `NilGame: start agent handoffs and review` and
`NilGame: agent bridge status` invoke these same commands. The installed Claude
Code and Codex extensions provide their normal clients. A small local extension,
`nilgame-local.nilgame-agent-bridge`, is also installed: it watches result files,
shows status and opens the latest review. Source: tools/vscode-agent-bridge/.
It makes no model calls and cannot inject prompts into either chat.

## Files and status

`.agent-bridge/latest.json` names the current run folder. In that folder:

- `summary.json`: overall task/review status and base hash.
- Each task folder: `result.json`, process stdout/stderr, `candidate.patch`,
  and the complete isolated `checkout/`, including the assigned QA report.
- `astra-review.md`: automatic completion review, once produced.
- `review.stdout.jsonl` / `review.stderr.log`: review errors and session events.

Everything under `.agent-bridge/` is ignored by Git. Logs may contain source
and agent outputs; do not publish the folder. No secrets/configuration are
printed intentionally. `awaiting-review` is an unaccepted task result, not proof
that its implementation is right. Nonzero exits, missing reports, unexpected
files, changed HEADs or timeouts become `needs-attention`/`failed`. Review has
its own success/failure status. A provider may return an error inside successful
process output; read the saved response and review, not just the process code.

## Isolation and approvals

Each agent gets an independent local clone at the exact starting commit. This
avoids Windows worktree links that Linux Git cannot interpret. The clones have
independent indexes and no publishing remote. They never edit the main checkout.
Allowed-path checks flag unexpected files; they are a review check, not an OS
access-control boundary. Agents receive explicit instructions not to commit,
push, launch agents, modify other checkouts or bypass refused operations.

Claude uses acceptEdits plus a session-local allowlist for reads/edits and Node,
Git inspection and search commands. It does not use bypassPermissions. A fresh
clone may not load trusted-project hooks; the task must explicitly run tests.
Muse uses `--disable-approval` for this requested unattended run while keeping
its sandbox enabled; no --yolo or --disable-sandbox. Neither client's persistent
settings are changed. Browser checks are not dispatched from these clones to
the main checkout's browser queue, which would validate the wrong files.

One active run is enforced by `.agent-bridge/active.lock`. Do not delete a lock
while its supervisor/agents may still be running. After a crash, inspect the
recorded PID, supervisor.log and task statuses before cleanup; the bridge does
not guess that a lock is stale. No automatic retries or recursive review loop.
Tasks have a 30-minute timeout; Muse also has an 80-model-step limit and a
12,000-byte tool-output cap. Claude uses medium effort. Linux
timeout owns Muse's process group, with a later Windows transport watchdog.
Only owned live process handles/PIDs are stopped. Review has a 20-minute limit.

## Local configuration / another machine

`.agent-bridge/config.json` contains executable locations, not credentials:

```json
{
  "claude": "C:/path/to/claude.exe",
  "codex": "auto",
  "muse": "/home/your-user/.local/bin/muse",
  "distro": "Ubuntu",
  "vscodeExtensions": "C:/Users/your-user/.vscode/extensions"
}
```

Use actual native executables, not PowerShell/CMD scripts, for the first two.
This bridge currently targets a Windows main checkout plus Ubuntu/WSL Muse.
The auto setting discovers Codex from installed VS Code extension metadata;
an explicit native path is also supported. Existing CLI
login must work independently. The bridge does not provision accounts, switch
models, repair host security settings or auto-answer authentication questions.

The protocols behind the callback are documented in
[Claude programmatic usage](https://code.claude.com/docs/en/headless) and
[Codex noninteractive execution](https://learn.chatgpt.com/docs/non-interactive-mode).
Muse options were verified from the installed `muse exec --help`.

## Usage discipline and current batch

Idle supervision and the VS Code file watcher consume no model tokens. Agent
reasoning, tool-output reading and the optional review do. Use `start` without
`--review` while Astra is already actively reviewing this batch; use `--review`
for an unattended handoff, once. Keep status checks occasional and compact.
No heartbeat prompts, automatic retries or additional review rounds run.
Time/step/output limits are controls, not a guaranteed token cap.

The checked-in manifest records the first batch, now completed/reviewed. Replace
its assignments before starting another batch; do not repeat completed work.
Claude's first run hit its account limit; no retry is scheduled. Muse's revision
was reviewed in the active Astra session, without a second CLI review. See
docs/qa/agent-bridge-integration-2026-09-11.md for results and limitations.
