# ADR 0009: Skeletons, not spinners, for sections waiting on data

**Status:** Accepted (2026-10-11)

## Context

Building Plex Commons' persisted-report background sync turned a correct but
slow synchronous answer (`plex:show --json`, blocking) into a fast one with a
gap while the first sync completes. The simplest loading treatment for that
gap — an icon plus a "Checking the server…" text line — read as a broken or
empty page, not a page still loading.

A repo-wide check found this inconsistency already existed: roughly 31 real,
shape-matching skeletons (`animate-pulse rounded-xl bg-paper`, e.g. mail's
`MailboxesSkeleton`, Plex's own `Deferred` fallback blocks) alongside plain
spinner-plus-text or bare "Checking…"/"Verifying…" lines standing in for
whole sections (`readiness.tsx`, `tools.tsx`'s "Checking for changes…",
settings' update check, `gcp-sign-in.tsx`, `quick-launch-modal.tsx`).

## Decision

- A deferred or syncing SECTION or PAGE (a Card, a list, a page body) shows a
  skeleton shaped like its eventual content — pulsing blocks sized and
  arranged like the real rows/cards that will replace them, the pattern
  already used in `MailboxesSkeleton`/`Deferred` fallbacks — never a spinner
  or a single text line standing in for a block of content.
- A single summary ROW inside an existing list (`CheckingRow`,
  `StatusPill tone="busy"`) may keep its compact "Checking…" pill — the row
  itself is already the right shape; there is nothing bigger to skeleton.
- A spinner (`RefreshCw`/`RotateCw` with `animate-spin`) is for a control's
  own busy state (something just clicked — Refresh, Save), never for a whole
  section that is merely waiting on a deferred prop or a background sync.
- Never render a "not set up" empty-state CTA for data that is merely
  unresolved (ADR 0004 already says this); this ADR is about what to show
  while it resolves.

## Consequences

Existing bare "Checking…"/spinner section states are grandfathered —
migrate them opportunistically when next touched, not as a forced rewrite.
New deferred sections ship with a skeleton from the start.
