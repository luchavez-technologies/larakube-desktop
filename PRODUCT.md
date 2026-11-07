# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo developers and small teams who want to run their own apps and cluster tools (n8n, PocketBase, WordPress, and 30+ others) on infrastructure they own, without being Kubernetes or DevOps experts. They're comfortable enough to run a CLI and manage a server, but one-click installs exist specifically so they never have to learn `kubectl`, write YAML, or reason about Ingress/Traefik/cert-manager themselves.

## Product Purpose

LaraKube Desktop is the GUI for the LaraKube CLI: it provisions servers (a single VPS or managed Kubernetes), deploys Laravel and other framework projects to them, and installs "Cluster Tools" — self-hosted alternatives to per-seat SaaS (n8n, PocketBase, WordPress, Vaultwarden, Matrix, Twenty CRM, etc.) — all in one click, with DNS, HTTPS, and SSO wiring handled automatically. Success looks like someone who has never touched Kubernetes directly ending up with a hardened, production-ready cluster.

## Positioning

One blueprint, every stage: the exact same Kubernetes manifests run on a local dev cluster, a single cheap VPS, and managed Kubernetes. A user starts on the cheapest option and moves up as they grow without rewriting anything — unlike tools that force a platform commitment (or a specific cloud) upfront.

## Operating Context

Core workflows: provisioning a cloud server (VPS or managed Kubernetes); deploying a project; one-click installing a Cluster Tool and watching its live rollout; managing DNS, SSL, secrets, and backups for a server; reviewing Activity/Run logs after an operation; switching between multiple registered servers via the server switcher.

Every operation that touches a real cluster runs as a tracked "Run" with live, streamed output — the user watches infrastructure changes happen, they don't just get a spinner and a toast.

## Capabilities and Constraints

- Desktop is a NativePHP app: a Laravel backend (SQLite) with a React/Inertia/Tailwind frontend, wrapped in a native shell. The UI itself is a web design language, not a native one — a native wrapper around a web UI doesn't make the UI native (per Impeccable's own platform rule).
- Drives the `larakube` CLI as a subprocess for every cluster operation; never embeds the CLI's own logic (ADR 0001). Every CLI call runs in an isolated environment (ADR 0002).
- No app-level login — there's no separate Desktop auth layer to design around (ADR 0005).
- Background queue workers auto-start (NativePHP's own mechanism) to run async sync jobs (tool catalog sync, server sync, DNS/TLS status, etc.) without blocking the UI.
- Demo Mode exists specifically to redact sensitive data (credentials, tokens, real hostnames) for screen recording and screenshots — a first-class feature, not an afterthought.
- Two release channels: Canary and stable.
- External links always open via a background `/open` dispatch, never an Inertia visit (ADR 0011).
- Skeletons, not spinners, for sections waiting on data (ADR 0009) — an existing, confirmed design convention to preserve, not replace.

## Brand Commitments

Product name: "LaraKube Desktop" (never "LaraKube" alone in user-facing copy, except for specific named commands or the Local CA/Console). Built by LuchTech.

## Product Principles

1. **Same manifests everywhere.** Local, VPS, or managed Kubernetes — never a rewrite to move between them.
2. **One click hides Kubernetes.** The user should never need to know `kubectl` exists to succeed.
3. **Own your infrastructure.** Self-hosted Cluster Tools replace renting the same features as per-seat SaaS.
4. **Operate-mode precision, not marketing flourish.** This is a utility app for completing real infrastructure tasks — every design decision favors clarity, scanability, and native-feeling restraint over visual ambition or personality.
5. **Plain language over jargon.** Status text, errors, and labels stay readable to someone who isn't a DevOps expert, even where the underlying operation is genuinely complex.
