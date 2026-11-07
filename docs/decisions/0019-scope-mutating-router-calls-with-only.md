# ADR 0019: Scope every mutating router call with `only` — never trigger a full-page reload for a small action

**Status:** Accepted (2026-11-08)

## Context

Several small, frequent UI actions — a checkbox toggle, a Pause/Resume button — were implemented as plain `router.post(url, data, { preserveScroll: true, preserveState: true })` calls with no `only` option. `preserveScroll`/`preserveState` only prevent the scroll position and local component state from resetting; they do **not** limit which props Inertia re-fetches. Without `only`, every one of these calls triggers a **full page visit**, re-evaluating and re-serializing every prop on the page — including expensive `Inertia::defer()` props that shell out to the CLI (e.g. `serverNames` on the Settings page) or poll live cluster state (e.g. `pods`, `healthMetrics` on a project's show page).

Two confirmed instances, both found the same way — the user noticed the UI "reload" and asked why:

1. **Pause/Resume buttons** (`resources/js/components/workloads-pods-card.tsx`): clicking Pause or Resume posted to the `stop`/`start` routes with no `only`, causing the entire project show page — every card, every deferred section — to flash back into its loading/skeleton state for a single Stop/Start click.
2. **Demo Mode checkboxes** (`resources/js/pages/settings/index.tsx`): `toggleDemoModeNow`/`toggleHiddenServer`/`toggleHiddenProjectGroup`/`toggleHiddenProject` all posted to `/settings/demo-mode` with no `only`. Checking a single box re-fetched `serverNames` (a CLI subprocess call) and every other Settings prop, making a one-click toggle visibly reload the whole page.

This is the same class of problem ADR 0012 addresses for navigation (prefetching, caching, sentinel results) — but ADR 0012 is about _loading_ a page fast; this is about _not accidentally reloading the whole page_ for an action that only changed one small thing.

## Decision

1. **Every `router.post`/`put`/`patch`/`delete` call fired from a small UI action (checkbox, toggle, inline button) MUST pass `only: [...]`**, naming exactly the props whose server-side truth needs confirming — never the unscoped default. Determine the minimal set by asking "what did this action actually change?", not by copying whatever the page happens to load initially.
2. **If the server already reflects an obviously-correct value from optimistic client state** (e.g. a checkbox's own `form.setData` already shows the right UI), it's fine for `only` to be narrow (just the one settings/record prop) rather than omitted — don't fetch anything just because it's "available."
3. **If the action kicks off a background Run** (anything through `CliRunner::start()`), don't hand-roll a manual follow-up `router.reload()`. The project show page already runs a 1-second `usePoll` while any run is `status: running` (see `show.tsx`); add whatever prop the action affects (e.g. `pods`) to that poll's existing `only` list once, instead of each action re-implementing its own reload-after-finish.
4. **Full, unscoped visits stay reserved for actual navigation** — clicking a sidebar link, submitting a form that redirects to a different page/record, or anything where the user's mental model is "I'm going somewhere new." A same-page action is not navigation.

## Consequences

- Small actions feel instant and don't flash unrelated cards into loading states.
- CLI subprocess calls (`serverNames`, `StackCatalog`, etc.) only run when their own data is actually needed, not as a side effect of an unrelated checkbox click — consistent with ADR 0012's caching philosophy, extended to cover mutations, not just page loads.
- Any new `router.post`/`put`/`patch`/`delete` call added to a page must be checked against this ADR before merge: does it pass `only`, and is that list the minimum needed? A missing `only` is the default failure mode here, not an edge case — it's easy to write and looks correct until someone clicks fast enough (or the page has an expensive deferred prop) to notice.
