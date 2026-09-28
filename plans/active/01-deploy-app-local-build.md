# Plan 01 — Projects + Deploy an app (local build)

**Status:** In progress (2026-09-28). The decision is option A in ADR 0008.

## Progress
- ✅ **Built (commit after 242fe55):** Projects section (sidebar), `projects`
  table (path only; everything else is read from `.larakube.json` /
  `.larakube.local.json` by `ProjectInspector`), folder picker (restricted to
  $HOME), framework detection for the 7 deployable frameworks, project page
  with steps **Set up → Server → Address → Deploy**. `CliRunner::start()`
  has a `cwd`. RunKinds `init-project`, `configure-host`, `deploy-app`.
  "Create a server for this project" runs `cloud:create … production`
  inside the folder, which binds the env. Project runs link back to their
  project. 12 new tests (`tests/Feature/ProjectsTest.php`).
- ⏳ **Not verified live:** `init --framework=X --fast` fully headless,
  `cloud:configure --only=hosts` headless, `cloud:deploy` from the app.
  Try each on a throwaway app + `gcp-test-vps`.
- ❌ **Still to do:**
  1. ✅ Readiness shows Docker and Podman (optional rows; OrbStack's
     `~/.orbstack/bin` and Docker Desktop's bin are searched). Still to add:
     a real `docker info`/`podman info` check (is the daemon running?), and
     disabling Deploy for image apps when neither works.
  2. Deploy stepper (cloud:deploy messages), like `run-steps.tsx`.
  3. Link an EXISTING server. CLI gap: `cloud:create <env>` inside a project
     with no expected stack **defaults to creating a new server** headless
     (the attach `confirm()` defaults to false). Needs a real CLI command, for
     example `cloud:attach <env> --stack=<name>`. Don't emulate by writing
     `.larakube.local.json` from the app.
  4. Static sites need Plex Commons on the server (`plex:init`). Surface
     that on the project page before Deploy.
**Goal:** a workshop student opens an app folder, links it to a server
they created in the app, clicks Deploy, and gets a live URL, for all seven
`AppFramework::isDeployable()` frameworks: Laravel, Statamic, WordPress,
Next.js (image builds) and Vite, Astro, Docusaurus (static bundles).

## CLI facts this plan relies on (verified 2026-09-28, CLI `develop`)

| Step | CLI | Headless? |
|---|---|---|
| Detect / scaffold | `larakube init --framework=<slug> --fast` in the project dir. Writes `.larakube.json`, Dockerfiles, `.infrastructure/`. | `--fast` skips the wizard. Verify the remaining 6 prompts in `InitCommand` all have defaults or flags. |
| Bind env → existing server | `larakube cloud:create production` inside the project offers "attach to existing stack" (`attachToExisting()`, `select('Attach to which stack?')`). | **Gap:** no flag picks the stack. Non-interactive `select()` returns its default, the project's *expected* stack or else the first one. Add `--attach=<stack>` to `cloud:create` (CLI change), or a dedicated `cloud:attach <env> --stack=`. Must follow the "no hidden-flag commands" rule, so prefer a real command. |
| Web host | `larakube cloud:configure production --only=hosts --web-hosts=<host>` | Flags exist. `cloud:deploy` refuses to run while the host is a placeholder. |
| Deploy | `larakube cloud:deploy production` | Git-push prompt is skipped under `--no-interaction`; `confirm('Proceed?')` defaults to yes. Image apps build locally with docker/podman, then SSH-sideload (VPS) or push (registry). Static sites build in Node and publish to the **Commons bucket** (needs Plex Commons on the server, `plex:init`). |

## Desktop work

1. **Setup:** add "Container runtime" to ReadinessCheck: docker or podman
   binary plus a working `docker info` / `podman info`. Required only for
   deploys, so show it as "needed to deploy apps".
2. **Projects section** (new sidebar item between Servers and Tools):
   - `projects` table: `id, name, path, framework, server (stack name), host,
     last_run_id, timestamps`. A project is a local folder the app knows about.
   - "Add project": a native folder picker (`Native\Desktop\Facades\Dialog`),
     then read `.larakube.json` if present, else detect with
     `init --framework` or offer a picker of the 7 deployable frameworks.
   - Project page: framework, folder, bound server, web host, a **Deploy**
     button, and recent runs for this project.
3. **Runs:** new `RunKind` values `init-project`, `bind-project`,
   `configure-host`, `deploy-app`. `CliRunner::start()` gets a `cwd`
   parameter (the project folder). Today it always uses `storage_path('app')`.
4. **Deploy stepper** for `deploy-app`. Match cloud:deploy's messages
   ("Regenerating manifests…", build, "Sideloading…"/push, apply, rollout)
   the same way `run-steps.tsx` does for cloud:create.
5. **Result:** show the app URL (the web host) with Open (OpenExternal).

## Order to build
1. CliRunner `cwd` + RunKinds + projects table/model + Projects list/add page.
2. Project page with Init (if no `.larakube.json`), Link server
   (needs the CLI attach flag; until then run `cloud:create production` and
   document the default-stack behavior), Set host, Deploy.
3. Readiness container-runtime check.
4. Deploy stepper + URL.

## Test plan
Feature tests with a fake `larakube` (see `tests/Feature/ServersTest.php`):
assert argv and `cwd` for each step, and that a project folder outside
`$HOME` is rejected. Manual: deploy one Vite and one Laravel app to a test
server (never `luchtech-vps`).
