# Architecture Decision Records (Desktop)

Short, durable records of _why_ the LaraKube Desktop application works the way it does — the decisions and trade-offs that aren't obvious from the code alone. Each ADR is self-contained: read it without needing the conversation that produced it.

These live in the repo (not in anyone's local notes) so contributors and AI agents share the same context, and so knowledge-graph and RAG tooling can index them.

## Format

One decision per file, `NNNN-kebab-title.md`, with **Status / Context / Decision / Consequences**. Statuses: `Accepted`, `Superseded by NNNN`, `Proposed`.

## Index

| #                                                                        | Decision                                                                                        | Status   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-drive-the-cli-never-embed-it.md)                             | Drive the LaraKube CLI as a subprocess; never embed its code                                    | Accepted |
| [0002](0002-isolated-environment-for-every-cli-call.md)                  | Every CLI call runs in an isolated environment                                                  | Accepted |
| [0003](0003-run-output-and-json-contract.md)                             | How runs report progress and results                                                            | Accepted |
| [0004](0004-server-is-the-source-of-truth.md)                            | Ask the server; show fast answers first; cache slow ones                                        | Accepted |
| [0005](0005-no-app-login.md)                                             | No app-level login                                                                              | Accepted |
| [0006](0006-cancel-lets-opentofu-finish.md)                              | Cancel stops the CLI but lets OpenTofu save its state                                           | Accepted |
| [0007](0007-windows-via-a-bundled-wsl-distro.md)                         | Windows runs the CLI inside a bundled WSL distro                                                | Accepted |
| [0008](0008-workshop-deploys-build-locally-first.md)                     | Workshop deploys build locally first; CI builds come second                                     | Accepted |
| [0009](0009-skeletons-not-spinners-for-loading-sections.md)              | Skeletons, not spinners, for sections waiting on data                                           | Accepted |
| [0010](0010-tool-deploy-options-are-cli-described-never-hand-curated.md) | A tool's deploy options come from the CLI's own `initFields`, never a hand-curated per-app list | Accepted |
| [0011](0011-external-links-never-trigger-inertia-visits.md)              | External links use background `/open` dispatch; never trigger Inertia visits                    | Accepted |
| [0012](0012-desktop-navigation-performance-and-caching.md)               | Subprocess caching, sentinel timeout guards, and Inertia v3 navigation primitives               | Accepted |
| [0013](0013-always-paginate-large-data-lists.md)                         | Always paginate high-cardinality data lists (Mail, Activity, Projects, Servers)                 | Accepted |
| [0014](0014-nativephp-runtime-security-and-os-integration.md)            | NativePHP runtime configuration, security scrubbing, OS disks, and child processes              | Accepted |
