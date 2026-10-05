# ADR 0002: Every CLI call runs in an isolated environment

**Status:** Accepted (2026-09-27)

## Context

Child processes inherit the app's environment. In dev, Electron carries the
app's `.env` (`DB_CONNECTION`, …), and NativePHP sets `APP_CONFIG_CACHE` and
`NATIVEPHP_*` for its own PHP. The CLI (Laravel Zero) read those and crashed
with `Target class [db] does not exist`. Separately, apps launched from the
Dock get no shell PATH, so Homebrew and `~/.local/bin` tools are invisible.

## Decision

`ToolLocator::isolate()` wraps every command as
`/bin/sh -c 'exec /usr/bin/env -i NAME="$NAME"… "$@"'` with an allowlist:
PATH (built from explicit directories), HOME, USER, SSH_AUTH_SOCK, TMPDIR,
LANG, NO_COLOR, plus per-call secrets. Secrets are referenced by name, so
their values live only in the spawn environment and never in argv. Binaries
are resolved by scanning `ToolLocator::directories()`, never via PATH lookup.

## Consequences

- The Windows adapter must do the same inside WSL (`wsl.exe -d larakube-ubuntu --
env -i …`).
- A CLI feature that needs a new environment variable must be added to the
  allowlist deliberately.
