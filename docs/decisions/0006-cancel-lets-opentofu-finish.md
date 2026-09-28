# ADR 0006: Cancel stops the CLI but lets OpenTofu save its state

**Status:** Accepted (2026-09-27)

## Context

Cancelling during `tofu apply` SIGTERMed `larakube`. tofu then died of
SIGPIPE before persisting state, leaving cloud resources running that
`cloud:destroy` could not see. The shipped CLI binary (phpacker `php-bin`)
has no `pcntl` or `posix` extension.

## Decision (implemented in the CLI, commit f18da7d)

tofu writes to a log file larakube tails, never to a pipe, so larakube's
death cannot kill it. Where pcntl exists, SIGTERM becomes one graceful
SIGINT to tofu. The desktop's Cancel means "stop; anything the provider
started finishes and stays tracked. Use Destroy leftovers." The Run page
says exactly that, and NativePHP's exit code on a killed run is not trusted.
