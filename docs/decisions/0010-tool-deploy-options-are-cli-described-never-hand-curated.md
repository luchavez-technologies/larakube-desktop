# ADR 0010: A tool's deploy options come from the CLI's own `initFields`, never a hand-curated per-app list

**Status:** Accepted (2026-10-11)

## Context

Quick Launch's n8n deploy was labeled as standalone but always provisioned a Plex Commons Postgres database — a real bug, not a misunderstanding. Investigation found the CLI side was already correct and complete (`FlowInitCommand`'s `--no-plex` flag, the n8n manifest's SQLite/Postgres branches, `ToolInitSpec`'s registration of `no-plex` as a real option for `ClusterTool::N8N`). The Tools page's Install dialog already renders this correctly too, because it draws its fields generically from `initFields`, whatever the CLI reports for that tool.

Quick Launch never adopted that pattern. It is a separate, hand-curated "1-click deploy" flow with its own small `AppOption` catalog (`pocketbase | n8n | wordpress`) and exactly one hand-written special case — WordPress's database picker, hardcoded as `$tool === 'wordpress'` in the launch controller. n8n simply never got its own copy. The bug was not "n8n is missing a flag" — it was that this flow's design invites exactly this gap: every tool that wants a real option needs its own hand-written special case, discovered and fixed one at a time, as each gap is separately noticed.

LaraKube Cloud is coming — described by the person building it as "basically what Desktop does, but without the customer installing anything, accessible from anywhere, plus other Cloud-specific features." Whatever drives a tool's deploy options in Cloud will face the identical problem at a larger scale: more tools, more operators, no desktop session to fall back on for the Tools-page path that happens to be correct today. Fixing the pattern now, while there are only three apps and one special case, is far cheaper than discovering it independently in Cloud later.

## Decision

- A tool's deploy-time options (what it needs besides domain/context/admin-email) are always read from the CLI's own `initFields` for that tool (`ToolInitSpec` in the CLI, surfaced via `tool:list --json`/the equivalent), rendered by the existing generic `FrameworkFields` component (`resources/js/components/framework-fields.tsx`) and resolved server-side by the existing generic `FrameworkForm::resolve()` (`app/Services/LaraKube/FrameworkForm.php`).
- No UI — Desktop's Quick Launch, the Tools page, or LaraKube Cloud's own equivalent later — hand-curates a picker, a flag list, or a capability check for a specific tool. If a tool needs a new option, it is added once, to that tool's `ToolInitSpec` in the CLI, and every surface that deploys it picks it up automatically.
- A "this is what the app will do" claim in copy (e.g. "operates 100% standalone") must be derived from the tool's actual resolved option values, never from an unrelated signal (Quick Launch's old "Standalone Deployment" badge was keyed off whether the tool supported mail/SSO wiring — nothing to do with its storage mode).

## Consequences

Adding a tool, or a new option to an existing tool, requires zero Desktop (or future Cloud) code changes — only a CLI-side `ToolInitSpec` entry. The cost is that any UI surface deploying a tool needs access to that tool's live `initFields` (a small new read, not a design problem) rather than a convenient local constant. Existing hand-curated special cases (WordPress's database picker was the only one) are removed as this pattern is adopted, not left to coexist with it.
