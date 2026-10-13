# ADR 0013: Always paginate large data lists

**Status:** Accepted (2026-10-13)

## Context

In LaraKube Desktop, several domain entities scale rapidly with fleet size, operational activity, and user infrastructure:

1. **Mailboxes & Aliases**: A mailserver managing multiple corporate or application domains can easily host hundreds or thousands of mailboxes and email aliases.
2. **Activity & Runs**: Every deploy, tool installation, backup run, and orchestration verb logs an entry in SQLite (`Run`). A busy environment accumulates tens of thousands of runs.
3. **Fleet Projects & Cloud Servers**: Large development teams and multi-cluster operators manage dozens to hundreds of workspaces and cloud nodes.
4. **Audit Logs & Cluster Events**: Operational audit logs, backup snapshots, and Kubernetes cluster events grow continuously over time.

Previously, certain controllers loaded full collections into memory (e.g., querying full account lists or returning raw arrays via Inertia). In an Electron/NativePHP environment, unconstrained data fetching creates acute performance and UX failures:

- **PHP Memory & CPU Spikes**: Serializing massive datasets in single-threaded PHP workers consumes significant memory and delays HTTP response generation.
- **Large IPC / Wire Payloads**: Passing megabytes of JSON over local HTTP/IPC bloats memory and introduces serialization lag.
- **Chromium DOM Thrashing & Jank**: Mounting hundreds or thousands of complex React components—each with status pills, clipboard triggers, dropdown menus, and action buttons—freezes Chromium's main UI thread, causing dropped frames and sluggish interactions.
- **Inefficient Filtering**: Client-side filtering over large arrays forces the browser to evaluate thousands of objects instead of leveraging indexed database queries.

## Decision

1. **Mandatory Server-Side Pagination for High-Cardinality Domains**:
    - Any collection that can scale beyond 20 items (Mail accounts/aliases, Runs/execution history, Projects, Cloud Servers, Audit logs, Backups) MUST be paginated on the backend.
    - Unbounded queries like `Model::all()` or unconstrained array returns to Inertia are strictly prohibited for these domains.
    - Standard page sizes:
        - **15–25 items** per page for detailed card-based rows and interactive lists.
        - **Up to 50 items** for dense, tabular data views.

2. **Inertia v3 Paginated Resource Contract**:
    - Backend controllers must return standard Laravel pagination payloads (`LengthAwarePaginator` or `CursorPaginator`), structured with:
        ```json
        {
          "data": [...],
          "links": [...],
          "meta": {
            "current_page": 1,
            "last_page": 10,
            "per_page": 25,
            "total": 248
          }
        }
        ```
    - Page transitions, searches, and tab switches must utilize Inertia partial reloads (`only: ['accounts']`, `preserveState: true`, `preserveScroll: true`) to swap list contents without re-requesting shared page layout data.

3. **Dashboard & Summary Widget Capping**:
    - Overview widgets (such as the Dashboard's Projects, Cloud Servers, and Recent Activity cards) must strictly cap results to a concise set of the most relevant items (e.g. `take(4)` or `take(5)`).
    - Summary cards must display the total count (e.g., `/{stats.serversCount}`) and provide explicit "View All →" links navigating to the dedicated, paginated resource index.

4. **Server-Side Scoping for Search and Filtering**:
    - Search inputs (e.g., filtering mailboxes by keyword, domain, or status) must debounce and synchronize state via URL query parameters (`?page=1&domain=example.com&q=alice`).
    - Filtering and sorting must be executed on the backend via scoped queries or index lookups, never through client-side array filtering over oversized payloads.

5. **Bounded DOM Footprint & Infinite Scroll Standards**:
    - When infinite scrolling or append-style pagination is preferred over numbered pagination controls (e.g., live log streaming or event feeds), implementations must either:
        - Use Inertia v3 `<WhenVisible>` / merge props with strict limits, or
        - Implement DOM virtualization (e.g., TanStack Virtual) to ensure the rendered DOM node count remains constant regardless of scroll depth.

## Consequences

- **Predictable Backend Resource Usage**: PHP memory usage remains low (<32 MB), and JSON serialization latency stays under 15ms.
- **Fluid Desktop UX**: Chromium's DOM stays lightweight, maintaining smooth 60fps scrolling and instant responsiveness even when servers manage 1,000+ mail accounts or thousands of audit logs.
- **Deep-Linkable State**: Filters, search keywords, and active pages are represented cleanly in URL query strings, allowing reliable navigation history and state preservation.
