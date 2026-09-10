# Shared working rules

Applies to Astra, Claude and Muse. The user's current instructions take precedence.

- Build a first-person connected-geometry kernel and editor, validated by small
  levels. Retain the browser reference; Godot is a candidate host. No new host,
  framework, dependency or mode without relevant authorization.
- Check git status before edits. Preserve others' changes and personal .codex/
  state; stage explicit paths. Use separate worktrees for overlapping work.
- Run node tools/host-probe.js once per execution session. Follow its current
  verdict; do not repeatedly diagnose Chrome or assume historical host status.
  Run GPU checks sequentially, through the queue when required.
- Read [TASK_ROUTER.md](TASK_ROUTER.md), then only the relevant sections and code.
  Do not load the entire roadmap, history or queue by default.
- Keep math/physics/rules/network modules host-free. CPU/GPU fields consume shared
  authored data. Separate metric, topology, region, connection policy and host.
- Never compare tangents at different points without transport. Distinguish exact
  distances, bounds, normals, hits, misses and unresolved queries.
  CPU/GPU agreement alone is not mathematical proof.
- Select affected checks. Run relevant regressions and the full Node suite before
  code integration. Demonstrate meaningful failure before a fix; never weaken
  checks. Shader compilation alone does not verify rendering.
- Attribute measurements to command, host and revision. Mark historical evidence
  and blocked/unrun checks explicitly. Put summaries last, before exit.
- Preserve geometry IDs/preset order, effective options (optVal), menu isolation,
  resets and visible boot errors when modifying the arena.
- Use bounded assignments for corpora, reproducible checks and scoped implementation;
  reserve unresolved contracts for the lead. Muse reads MUSE.md and only its
  assigned task. Report defects outside assigned scope without fixing them.
- Explain plainly. Leave a short handoff: files, evidence, uncertainty, one next
  task. Keep the open queue short and closed assignments in the historical log.

Detailed mathematical, graphics and testing safeguards are preserved in
[SUBSYSTEM_RULES.md](SUBSYSTEM_RULES.md). Acceptance and coordination rationale
is in [COORDINATION.md](COORDINATION.md). Read applicable sections, not both files
in full at startup.
