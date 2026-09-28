# ADR 0004: Ask the server; show fast answers first; cache slow ones

**Status:** Accepted (2026-09-28)

## Context
Status inferred from the app's own run history was wrong for servers set up
from Terminal ("Set up" shown for DNS that was already running). A full
`tool:list` takes about 30s against a remote cluster (kubectl round trips per
tool), and `tls:show` about 14s (Cloudflare API per zone).

## Decision
- Status is read from the server via CLI `--json` commands, never from local
  run history.
- Slow reads are Inertia deferred props, each in its own group so they load
  in parallel. Each is cached per kube-context for 10 minutes and dropped when
  a run that changes it exits (`RecordRunOutput`).
- Two-phase lists: `tool:list --registry-only` (about 1s, unverified) draws
  the page with a "Verifying with <server>…" badge. The full `tool:list`
  replaces it. Actions that depend on accuracy (Install) stay disabled until
  verified.
- Unknown is never shown as "not done": use "Checking…" or "Couldn't check".

## Consequences
The cache can be up to 10 minutes stale for changes made outside the app;
Refresh drops it.
