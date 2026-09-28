# LaraKube Desktop — start here

A NativePHP (Electron) desktop app that drives the **LaraKube CLI** for people
who never want a terminal: create cloud servers, install Cluster Tools, and
(next) deploy their apps. First users: a non-developer teammate on macOS, and
a workshop of mostly-Windows students who will deploy Laravel, Statamic,
WordPress, Next.js, Vite, Astro and Docusaurus apps.

**Current goal:** every workshop framework created and deployed from the
desktop before the workshop. See `plans/active/07-all-frameworks-for-workshop.md`.

Read in this order:

1. This file: what exists, how to run it, where things live.
2. `docs/decisions/`: the architecture decisions (ADRs). Don't undo one
   without writing a new ADR that supersedes it.
3. `plans/NEXT-STEPS.md`: the prioritized backlog with the current state of
   every in-flight item.
4. `plans/active/*.md`: one plan per feature, each written so an agent can
   pick it up cold.

The original feasibility research lives in the CLI repo:
`cli/plans/active/larakube-desktop-feasibility.md` (Figma, toolbox image,
LaraKube Cloud and Console relationships, workshop risks).

## Stack

|              |                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime      | NativePHP Desktop **2.3.1** (Electron) with bundled static PHP 8.4                                                                                                                         |
| Backend      | Laravel 13, Pest, Pint, Larastan                                                                                                                                                           |
| Frontend     | Inertia v3 + React 19 + Tailwind 4, Wayfinder route helpers, `vite-plus` (`vp`) for lint/format                                                                                            |
| Fonts/colors | Geist / Geist Mono via the Vite font plugin (bunny, self-hosted at build), tokens in `resources/css/app.css`                                                                               |
| Design       | Figma file `5lHxcb5oXNJGpCd4NotBw3`: "Foundations" page (tokens, components) and "Screens" page (Setup / Servers / Runs / Tools sections). Starter plan: 20 MCP calls/month, 3 pages/file. |
| Database     | SQLite. Dev runs use `database/nativephp.sqlite` (not `database.sqlite`).                                                                                                                  |

## Before you push

Run `composer ci:check`, the exact gate CI runs: `vp check` over the
**whole** repo (not just `resources/js`), tsc, Pint, PHPStan and Pest.
`nativephp/**` is NativePHP's regenerated Electron scaffold and is excluded
from `vp` lint and format in `vite.config.ts`.

## Run it

```bash
composer native:dev          # NativePHP window + Vite (a COMPOSER script, not artisan)
php artisan native:migrate   # after adding a migration (dev skips auto-migrate)
php artisan test --compact   # Pest, all ChildProcess/Process calls faked
vendor/bin/pint --dirty --format agent
vendor/bin/phpstan analyse --memory-limit=1G
npx vp check --fix resources/js   # lint + format; must be warning-free
npx tsc --noEmit
php artisan wayfinder:generate     # after changing routes (Vite does it in dev)
```

The app shells out to whatever `larakube` it finds, usually
`/usr/local/bin/larakube` (the user's `./build` output). **Features that need a
new CLI flag only work after the user rebuilds the CLI.** Agents must never run
`./build` themselves (CLI rule); ask the user.

## How it works (one paragraph)

Every action is a **Run**: `CliRunner` starts `larakube <args> --no-interaction`
as a NativePHP `ChildProcess`, isolated from the app's own environment
(`ToolLocator::isolate`). Output streams back as NativePHP events that
`RecordRunOutput` appends to the `runs` row. The Run page polls every second,
shows a stepper for known run kinds, and parses the `--json` result line.
Read-only screens call the CLI synchronously (`Process`) for `--json` data
(`cloud:providers`, `cloud:stacks`, `tool:list`, `dns:list`, `tls:show`), load
it as Inertia **deferred props**, and cache slow answers per kube-context.

## Map

```
app/
  Services/LaraKube/
    ToolLocator.php     finds binaries without PATH; isolate() = clean env (ADR 0002)
    CliRunner.php       starts a Run as a ChildProcess; tokens only via env
    ReadinessCheck.php  Setup: tool versions + cloud:providers
    StackCatalog.php    servers from cloud:stacks --json
    ToolCatalog.php     Cluster Tools: registered() fast + forContext() verified (ADR 0004)
    ClusterStatus.php   dns:list / tls:show status per server, cached
  Listeners/RecordRunOutput.php   stdout/stderr → Run; result + missing-flag parsing
  Models/Run.php  Enums/RunKind.php  Enums/RunStatus.php
  Http/Controllers/  Readiness, Server (create/destroy/dns/tls), ClusterTool,
                     Run (index/show/cancel), ToolInstall (Setup CLI tools), OpenExternal
resources/js/
  layouts/app-layout.tsx     sidebar: Setup / Servers / Tools / Activity
  components/                button, card, list-row, page-header, status-pill,
                             log-panel (hides CLI banner), run-steps, copy-button, logo-mark
  pages/readiness.tsx  servers/{index,create,show}  tools/{index,show}  runs/{index,show}
  types/larakube.ts          shared types + describeTool/toolName helpers
tests/Feature/               one file per feature; fake CLI via a temp bin dir
```

## Conventions and traps (read before editing)

- **Never let secrets reach argv.** Pass them in the `secretEnvironment`
  argument of `CliRunner::start()` (for example `TF_VAR_do_token`,
  `HCLOUD_TOKEN`, `LARAKUBE_CLOUDFLARE_TOKEN`). The app never stores them.
- **Every CLI call goes through `ToolLocator::isolate()`.** The CLI is also
  Laravel, and it breaks on this app's `DB_CONNECTION`/`APP_CONFIG_CACHE`
  if it inherits them.
- **Slow CLI calls need `set_time_limit()`.** PHP's 30s request limit killed
  `tool:list` against remote clusters.
- **`_native/api/events` is exempt from TrimStrings and
  ConvertEmptyStringsToNull** (`bootstrap/app.php`). Trimming ate every
  newline of the run log.
- **Unknown is not "not done".** A status the app can't confirm shows
  "Couldn't check", never a false "Set up".
- **Scripted edits vs. the formatter.** `vp check --fix` reflows TSX/TS. A
  find-and-replace written against pre-format text silently matches nothing.
  Assert every replacement, or use exact Edit calls against the current file.
- **Tests:** fake the CLI binary with a temp dir + `ToolLocator` instance
  (see `serversFakeCli()`), `ChildProcess::fake()` for runs, `Process::fake()`
  for sync calls. Helper function names must be unique per file.
- **Product naming:** always "LaraKube CLI", never "LaraKube" alone for the
  CLI. Never commit real customer/partner domains; use `example.com`.
