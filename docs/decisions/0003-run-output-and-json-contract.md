# ADR 0003: How runs report progress and results

**Status:** Accepted (2026-09-27); `--output=ndjson` proposed (plans/active/06)

## Context

Commands with `--json` put exactly one result line on stdout and everything
human on stderr. Most commands (dns:init, tool:add, cloud:destroy) have no
`--json` and write everything to stdout.

## Decision

- `Run::emitsJsonResult()` checks for `--json` in the command. If present,
  stdout goes to `runs.stdout`; otherwise stdout goes to the log (`runs.output`).
- The result is the last JSON line on stdout. With no result, a
  "Missing --flag" block in the log becomes a readable failure message.
- Progress steppers (`run-steps.tsx`) match the CLI's own log messages, and
  the UI hides the CLI banner lines.
- Long term, the CLI emits structured progress events (`--output=ndjson`,
  last line = the `--json` result), shared with LaraKube Cloud.

## Consequences

Log-text matching is fragile. A CLI wording change degrades a stepper to
"unknown progress", never to a crash. Replace it with ndjson when that lands.
