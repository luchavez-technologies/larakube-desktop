# 0018. Database-first background sync and tabbed UI for cluster service pages

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

Cluster-level companion services (`Mail` / Stalwart, `Drive` / Nextcloud + Collabora, `Secrets` / OpenBao, and `Identity` / Zitadel SSO) originally varied in how they loaded state and presented their UI:

1. **Blocking or deferred subprocess reads vs. SQLite cache:** Some controllers wrapped fast SQLite reads in `Inertia::defer()`, causing unnecessary flash-of-skeleton states on every tab switch, while `SyncClusterToolsJob` overwrote `cluster_tools.data` with shallow `tools:status` payloads and clobbered deep-sync keys (`serverInfo`, `queue`, `wiredTools`, `driveInfo`, `extensions`, `status`) populated by service-specific sync jobs.
2. **Sync job dispatch bug on stale installed tools:** Status services (`MailStatus`, `DriveStatus`, `OpenBaoStatus`, `SsoStatus`) checked `$tool === null || $tool->sync_status !== 'fresh'` and dispatched `SyncClusterToolsJob` instead of the service-specific `Sync*Job`, leaving stale or manually refreshed tools waiting on the wrong job.
3. **Inconsistent page layouts:** `Mail` and `Drive` used a compact, scannable 4-tab layout with badge counts, whereas `Secrets` (`OpenBao`) and `Identity` (`Zitadel SSO`) stacked every table and form vertically on a single long page.

## Decision

Every cluster-wide companion service page (`Mail`, `Drive`, `Secrets`, `Identity`, and any future service management page) must follow the **Database-First with Background Sync** architecture and the **Tabbed Service Page** UI standard:

### 1. Database-First Reads & Non-Blocking Background Sync

- **Zero Synchronous CLI Calls in Controllers:** Controllers (`MailController`, `DriveController`, `OpenBaoController`, `SsoController`) must read exclusively from SQLite (`Server`, `ClusterTool`, `MailDomain`, `MailAccount`, `SsoGrant`) and return cached props directly without `Inertia::defer()`.
- **Two-Stage Sync Hierarchy:**
    1. `SyncClusterToolsJob` discovers which tools are installed on a server (`larakube tools:status --json`). When upserting `cluster_tools`, it **must merge** incoming `tools:status` metadata into existing `cluster_tools.data` so deep-sync keys (`serverInfo`, `queue`, `wiredTools`, `driveInfo`, `extensions`, `status`) are never clobbered.
    2. Service-specific jobs (`SyncMailJob`, `SyncDriveJob`, `SyncOpenBaoJob`, `SyncSsoJob`) populate deep service state in `cluster_tools.data` and dedicated tables (`mail_domains`, `mail_accounts`, `sso_grants`).
- **Stale-While-Revalidate (`syncIfNeeded`):**
    - If the `ClusterTool` row does not exist or is not installed and not fresh, dispatch `SyncClusterToolsJob`.
    - If the `ClusterTool` row is installed and its `sync_status !== 'fresh'` or `isStale(10 minutes)` is true (or its deep-sync payload key is missing), mark `sync_status = 'syncing'` and dispatch the service-specific `Sync*Job`.
    - Transient CLI failures in a `Sync*Job` must record `sync_status = 'error'` and `sync_error` without wiping previously cached rows when the tool is still installed.
- **Reactive Frontend Polling:** Each service page receives a `<service>Sync` prop (`{ status, lastSyncedAt, error }`), renders `<SyncStatusBadge />` and a `Refresh` button (`POST /servers/{server}/<service>/refresh`) in the header, and starts/stops Inertia `usePoll(2000)` via `useEffect` whenever `status === 'syncing' || status === 'stale'`.

### 2. Standardized Tabbed Service Page Layout

Every cluster service page must use a consistent visual hierarchy:

1. **Header Bar:**
    - Left: `<ToolLogo />`, `<h1 className="text-xl font-bold tracking-tight text-ink">`, `<ExperimentalBadge />`, active status pill (`Stalwart Active`, `Nextcloud Active`, `OpenBao Active`, `Zitadel Active`), `<SyncStatusBadge />`, and a one-line subtitle.
    - Right: `Refresh` button (`RotateCw` icon, spinning while syncing), primary service-level quick actions (e.g., `Seal` / `Unseal`), and `<ServerSwitcher />`.
2. **Horizontal Tab Bar:**
    - `flex items-center gap-6 border-b border-line` with 4 focused tabs.
    - Each tab button displays a Lucide icon (`h-4 w-4`), label, optional count/status badge (`rounded-full px-1.5 py-0.5 text-[10px]`), and a `h-0.5 bg-brand` bottom indicator when active.
3. **Tab Content Area:**
    - Filter/search bar (`w-64`) on the left and primary creation/action buttons on the right.
    - Tables rendered inside `<Card className="overflow-hidden p-0">` with `bg-paper/50` headers.

## Consequences

- Navigating between `Mail`, `Drive`, `Secrets`, and `Identity` renders instantaneously from SQLite with zero layout shift or skeleton flash when cached data exists.
- `SyncClusterToolsJob` can run at any time without erasing detailed Mail, Drive, OpenBao, or SSO state.
- Clicking `Refresh` on any service page immediately marks the service stale, dispatches its dedicated background sync job, spins the Refresh icon, and polls until `sync_status` returns to `fresh`.
- All four cluster service pages share a cohesive, scannable tabbed interface.
