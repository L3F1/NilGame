# Coordination and evidence

Read for acceptance, integration, measurements or bounded-agent assignments.

## Working with more than one agent

Added 2026-09-09 after a batch where each of these cost something real.

**Probe the host, do not diagnose it.** `node tools/host-probe.js` is the first
command of any session. It reports what this machine can do, checks its own
instruments before it checks anything else, and ends with a one-line verdict on
how to get browser checks here. Three separate sessions have rediscovered the
same block; one recorded the wrong reason, and the wrong reason then shaped a
queue of work for weeks. If the probe and your intuition disagree, the probe is
the evidence.

**A broken instrument reports a blocked capability.** `timeout(1)` is denied in
the sandboxed shell, and a probe that ran through it read EPERM on Chrome and
concluded WSL interop was blocked. Interop had never been tested. Before
believing a negative result, check the tool that produced it.

**Ship a check that fails without the change.** Acceptance is then one command
rather than a conversation, and the reviewer can re-run it instead of trusting
a report. Demonstrate the failure explicitly: break it in your own copy, paste
the failing output, restore, paste the passing output. "I verified it" is not
evidence, and a check that cannot fail is not a check.

**Measure, never cite.** Any number in a report or a document carries the
command that produced it and the host it ran on. One sweep found fourteen false
claims and nearly all were numbers that had been true once. If you are
repeating a figure from a document rather than running it, say so and mark it
unverified.

**Report defects, do not fix them out of scope.** A task that forbids touching
a file and then finds that file wrong has produced a finding, and the finding
is the deliverable. Some of the most valuable results here were handed back
unfixed.

**Split the work by shape, not by seniority.** If a task can be stated as *make
this check exist and make it fail without X* — corpora, sweeps, static
analysis, measurement, auditing claims against the tree — it belongs to the
bounded agent. If the hard part is deciding what the answer should BE —
contracts, formats, what a capability promises, what an error should say — it
belongs to the lead. An agent that finds itself designing rather than
measuring should stop and say so.

**Stage explicitly when the tree is shared.** `git add -A` in a checkout where
another agent has uncommitted work sweeps that work into your commit. It
happened in `e348791`, which carries a batch's report edits inside a commit
about booleans. Nothing was lost, but the history now says something untrue
about when that work happened. Check `git status` before staging, and name the
paths you mean.

**Keep the queue short.** `MUSE_TASKS.md` holds only OPEN work; closed
assignments and their verdicts live in `docs/qa/muse-log.md`. A queue file that
had grown to 977 lines was being read in full at the start of every session,
almost all of it history.
