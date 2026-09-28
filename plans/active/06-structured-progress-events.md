# Plan 06 — Structured progress events (`--output=ndjson`)

**Status:** Proposed, shared with LaraKube Cloud (cloud plan §10).
The CLI emits one JSON event per line on stdout (`step`, `log`, `open-url`,
`result`), and the last line is exactly today's `--json` result. The desktop
steppers (`run-steps.tsx` and the deploy stepper) switch from log-text
matching to step events. Cloud's deferred "live log streaming" comes free.
Start in `LaraKubeOutput` (most output already goes through
laraKubeInfo/Warn/Error).
