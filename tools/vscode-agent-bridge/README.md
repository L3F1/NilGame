# NilGame Agent Bridge

Private local extension. Shows the latest bridge status and notifies when the
assigned agents finish, even without an automatic Astra review. Failed/blocked
runs are announced distinctly; completion does not mean acceptance. If automatic
review was requested, the notification waits for that review. Commands open status
or review files. Notifications are deduplicated per run and terminal status.
It reads only bridge metadata and report paths in the trusted workspace. No
network access, credentials, process launch, telemetry or chat-window injection.

Source and packaging stay in this repo; the installed VSIX is local, not a
marketplace dependency. See docs/engineering/AGENT_BRIDGE.md for the supervisor.

0.1.1 verification (2026-09-12, Windows Node24.20.0): notification host mock
5/5 scenarios; original 0.1.0 fails the ordinary-completion assertion. Full
`node tools/test.js`: 135/135. VSIX installed locally; editor reload activates
the new version. The mock validates behavior, not an observed VS Code popup.
