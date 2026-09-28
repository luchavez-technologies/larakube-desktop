# ADR 0001: Drive the LaraKube CLI as a subprocess; never embed its code

**Status:** Accepted (2026-09-27)

## Context
The desktop app needs every capability of the LaraKube CLI (cloud:create,
`*:init`, dns/tls, deploy). The CLI is a Laravel Zero app that ships as a
static binary, and LaraKube Cloud already decided (cloud plan §6/§10) to
run the same binary as Kubernetes Jobs.

## Decision
The desktop runs the real `larakube` binary as a child process for every
action and every read. It never requires the CLI as a Composer package and
never reimplements CLI logic. Missing capabilities are added to the CLI
(a flag, `--json`, a read-only command) and consumed from there.

## Consequences
- One source of truth. Fixes land in `cli/app/Commands/*` and every
  front-end (terminal, Desktop, Cloud, Console) gets them.
- Desktop features can depend on a CLI version: the user must rebuild or
  update the CLI. Readiness should eventually enforce a minimum version.
- The CLI must be fully drivable headless: `--no-interaction` must never
  prompt, and results need `--json`. Every prompt without a flag is a CLI bug.
