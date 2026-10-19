# 0016: Interactive Request Simulation Engine via React Flow and Motion

## Status

Accepted

## Context

LaraKube orchestrates complex cloud-native topologies spanning multiple infrastructure hops: Cloudflare DNS and edge proxies, Ingress controllers (Traefik), Kubernetes internal ClusterIP services, tenant application pods (FrankenPHP/Octane, WordPress, PocketBase), and shared storage or managed database pods (PostgreSQL, Redis, SQLite).

To help developers, students, and operators understand what happens under the hood during a web or API request, an educational visual tracing mechanism was requested ("Life of a Request" Simulator / Holo-Trace).

Several technical approaches were evaluated:

1. **Full 3D WebGL via Three.js / React Three Fiber**:
    - Heavy battery drain and GPU fan spin on student laptops.
    - High complexity in hit-testing, text rendering, and responsive canvas zooming.
    - Significant bundle size overhead (~600KB+ minified).
2. **Video / Timeline Generation via Remotion**:
    - Requires bundling heavy external binaries (`ffmpeg`) or high CPU rendering overhead for headless video generation.
    - Non-interactive: users cannot pause on a specific node, inspect request headers, or trigger dynamic chaos faults (e.g. 500 DB Crash, 502 Pod Down).
3. **2.5D Isometric & Node Flow Graph via `@xyflow/react` (React Flow v12) + `motion` (Framer Motion v14)**:
    - Zero WebGL overhead; runs at a buttery 60 FPS using hardware-accelerated CSS transforms and SVG paths.
    - Native DOM rendering: crisp typography, full accessibility, easy copy-pasting of payload headers, cURL commands, and SQL queries.
    - First-class support for custom nodes, custom animated Bezier SVG packet edges, interactive minimaps, zoom/pan controls, and real-time state manipulation.

## Decision

1. **Standardize on `@xyflow/react` + `motion` for Infrastructure Visualization**:
    - The "Life of a Request" Simulator and future architectural topology diagrams will be powered by `@xyflow/react` and `motion`.
    - WebGL (Three.js) and headless video generation (Remotion) are avoided for real-time interactive tracing in the Desktop UI to preserve battery life and eliminate heavy binary dependencies.

2. **Full In-Browser Scenario & Chaos Simulation**:
    - The simulator runs interactive, deterministic simulation scenarios entirely on the client, with initial cluster and project blueprints provided by `SimulatorController`.
    - Five canonical educational scenarios are provided out of the box:
        - `web-happy`: Web Browser GET (HTML 200 OK)
        - `api-json`: Client API Request with Bearer Token & Database Query (JSON 200 OK)
        - `db-crash`: Database Outage / Connection Refused (500 Internal Server Error)
        - `pod-crash`: Ingress Pod Failure / Zero Replicas (502 Bad Gateway)
        - `not-found`: Ingress Route Not Found / Traefik 404
    - Each hop in the trace includes exact protocol details, port numbers, latency benchmarks, transport headers, and payload previews.

3. **Dynamic Project & Server Awareness**:
    - The backend controller (`SimulatorController`) automatically discovers registered projects and servers, allowing users to trace real workloads (e.g. switching between a Laravel Octane app with Postgres and a WordPress site with SQLite).

4. **Bi-directional Navigation**:
    - Users can access the simulator from the main application sidebar (`/simulator`) or jump directly into a traced view for a specific project from the Project Show page ("Trace Request" button).

## Consequences

### Positive

- **Lightweight & High Performance**: Runs smoothly on low-power devices with zero GPU fan noise.
- **Deeply Educational**: Clearly illustrates Kubernetes concepts (Cloudflare $\to$ Traefik Ingress $\to$ Service $\to$ Pod $\to$ Database) with step-by-step inspector drawers.
- **Resilient & Interactive**: Supports step-by-step manual scrubbing, speed adjustment ($0.5\times$ to $2\times$), and real-time chaos fault injection.
- **Maintainable**: Standard React components and TypeScript types without custom WebGL shaders.

### Negative

- Not suitable for true 3D spatial terrain or free-camera fly-through animations, which are unneeded for architectural request tracing.
