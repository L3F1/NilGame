# NilGame agent entry point

Read [shared working rules](docs/engineering/WORKING_RULES.md) before changing
project files. Astra and Claude use that single source; do not duplicate it here.
The user's current instructions take precedence.

Direction: a first-person **geometry kernel and level editor** for connected
geometries, validated by small levels. See docs/what-this-is.md for why that is
the accurate description and "engine" is not: Godot is a candidate HOST for this
work, not a competitor to it. Follow TODO.md, docs/architecture.md, docs/scene-format.md and
docs/decisions/001-runtime-strategy.md.

Muse also reads MUSE.md and only its assigned entry in MUSE_TASKS.md.
See docs/engineering/AGENT_SETUP.md for client setup and coordination.

Historical mathematical and rendering traps are preserved in
docs/engineering/legacy-agent-reference.md. Read relevant sections when changing
their subsystem; do not load the entire archive for every task.
