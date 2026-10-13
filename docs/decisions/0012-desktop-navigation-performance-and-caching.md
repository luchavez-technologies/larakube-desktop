# ADR 0012: Subprocess caching, sentinel timeout guards, and Inertia v3 navigation primitives

**Status:** Accepted (2026-10-13)

## Context

In an Electron desktop application, page navigation should feel instantaneous. Users reported that navigating between primary desktop tabs (such as clicking "Dashboard", "Servers", "Tools", or "Mail") took 5 or more seconds to load.

Root cause analysis identified three primary performance bottlenecks:

1. **Uncached Synchronous Subprocesses**: Core service methods like `StackCatalog::all()` and `LocalCluster::detect()` invoked CLI inspection commands (`larakube cloud:stacks --json`, `kubectl config view -o json`, `kubectl cluster-info`) on every HTTP request. Controllers called `StackCatalog::all()` up to three times during a single page visit.
2. **PHP Worker Starvation from Unreachable Clusters**: `ClusterStatus::remember()` cached successful responses, but failed or timed-out subprocesses returned `null` and were never cached. When a server had an unreachable, stopped, or unconfigured cluster context, background requests querying companion status (`tls:show`, `dns:list`, `backup:status`) repeatedly launched CLI subprocesses with 60s–180s timeouts on every poll, exhausting PHP's built-in web server worker pool.
3. **Redundant Props & Un-Prefetched Visits**: Static application metadata (`theme`, `experimental`, `demoMode`, `untested`, `hideProjects`) was re-evaluated and serialized on every navigation. Furthermore, sidebar navigation links did not prefetch page JSON, forcing users to wait for the entire round-trip after clicking.

## Decision

1. **In-Memory Memoization & Short-Lived Caching for CLI Inspections**:
    - Heavy inspection services (`StackCatalog`, `LocalCluster`) must memoize results in-memory during the request lifecycle.
    - They must cache responses in Laravel Cache (`stack_catalog.everything`, `local_cluster.detect`) with a short TTL (30 seconds).
    - Any mutating operation (`store`, `destroy`, `update`, or server state changes) must call `forget()` to immediately evict the cache.

2. **Sentinel Caching for Unreachable or Missing Resources**:
    - `ClusterStatus::remember()` must cache `null` / timed-out results using a sentinel record (`['__empty' => true]`) with a 60-second TTL.
    - When an external cluster is unreachable or misconfigured, subsequent requests must fail fast immediately rather than spinning up repeated subprocesses that tie up the server.

3. **Inertia v3 Prefetching & Stale-While-Revalidate (SWR)**:
    - Primary navigation links in `AppLayout` must declare `prefetch` and `cacheFor={['30s', '1m']}`.
    - Hovering over a navigation item prefetches the page JSON in the background.
    - Clicking renders immediately from client cache (0ms perceived latency), revalidating in the background between 30s and 60s.

4. **Inertia v3 `shareOnce` for Static App Metadata**:
    - Static configuration and feature flags (`theme`, `hideProjects`, `experimental`, `demoMode`, `untested`) must be returned from `HandleInertiaRequests::shareOnce()` rather than `share()`.
    - Inertia delivers these properties once on the initial page load and excludes them from subsequent navigation requests via `X-Inertia-Except-Once`, reducing network and serialization overhead.

5. **Inertia Progress Indicator Tuning**:
    - Configure Inertia's progress bar in `resources/js/app.tsx` with `delay: 100` and `showSpinner: false`.
    - Sub-100ms transitions remain completely clean and flicker-free, while genuine background operations smoothly display the branded `#4f46e5` indicator.

## Consequences

- Primary route response times dropped from ~5,200ms to 10ms–48ms backend response time, with 0ms client-side transition time on prefetched routes.
- The desktop app feels crisp, native, and responsive.
- Any future controller or service executing CLI subprocesses must implement appropriate caching or run asynchronously via background jobs and deferred props with timeout guards.
