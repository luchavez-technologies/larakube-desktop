# 08: Environments and linking a project to a server

**Blocks every deploy from the desktop.** Plan 07's deploy steps depend on it.

## The problem

A project made by `new` or `init` has only the `local` environment. To deploy,
it needs a cloud environment (usually `production`, but a project can have
several: staging, production, …) that says which server it goes to.

`larakube env <name>` (`cli/app/Commands/EnvCommand.php`) is the command that
creates an environment, and it already asks for the server at creation time
(`ResolvesEnvironmentContext::promptCloudTarget()`). But it is fully
interactive, so the desktop (no TTY, `--no-interaction`) can't drive it:

| Wizard step (in order)                         | Where                                            | Headless today                                                                                      |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Environment name                               | `EnvCommand` `text()`                            | ok (positional `name`)                                                                              |
| Ingress controller                             | `gatherEnvironmentIngress()`                     | check: `--ingress` exists on `cloud:configure`, not on `env`                                        |
| Externally-managed services                    | `gatherEnvironmentManaged()`                     | check: `--managed` exists on `cloud:configure`, not on `env`                                        |
| Web host + promptable hosts (Reverb, S3/CDN)   | `PromptsForHosts::promptForHosts()`              | needs a flag (e.g. `--web-host=`)                                                                   |
| Additional web hosts                           | `gatherAdditionalWebHosts()`                     | `--web-hosts` (via `flag()`), not declared on `env`                                                 |
| Configure a registry?                          | `confirm(default: false/has)`                    | ok (defaults to no); registry flags exist on `cloud:configure`                                      |
| **Which server** ("How is '<env>' reached?")   | `promptCloudTarget()` `select()`, **no default** | **dangerous**: headless it returns the first kube-context on the machine, silently the wrong server |
| VPS SSH user / port / key                      | `recordContextTarget()` `text()` with defaults   | ok (defaults: larakube, 22, ~/.ssh/id_rsa)                                                          |
| Managed provider (non-`larakube-<ip>` context) | `recordContextTarget()` `select()`               | needs a flag if managed clusters matter                                                             |
| Set up CI/CD now?                              | `confirm(default: false)`                        | ok                                                                                                  |

Also: `cloud:configure <env>` (full flow) and `cloud:deploy <env>` both call
`resolveEnvironmentContext()`, which falls back to the same prompt, so they
share the danger when the env has no target.

## LaraKube CLI work

1. `env` gets flags that answer every step, following
   `RequiresFlagsWhenNonInteractive::flagOrPrompt()` (non-interactive + no
   flag = `MissingFlagException`, never a silent default):
   `--context=` (the server, e.g. `larakube-203.0.113.21`), `--ingress=`,
   `--managed=`, `--web-host=`, `--web-hosts=`, and optionally
   `--ssh-user= --ssh-port= --ssh-key=` and `--provider=` for managed
   clusters. Only one positional (`name`), per the naming rule.
2. `promptCloudTarget()`: take the context from `--context` when given;
   when non-interactive without it, throw `MissingFlagException` instead of
   picking the first context. Same for `resolveEnvironmentContext()` used by
   `cloud:deploy` / `cloud:configure`.
3. A read-only `env:list --json` (or add to an existing JSON command) listing
   a project's environments with their target (context/ip) and web host, so
   the desktop doesn't parse `.larakube.json`/`.larakube.local.json` itself
   (today `ProjectInspector` reads them directly; fine short-term).
4. Tests in the style of `NewCommandScriptedRunTest` /
   `InitCommandEmailTest` plus a real `env production --context=… --no-interaction`
   run with `Process::fake()`.
5. Then verify `cloud:deploy production --no-interaction` end to end on
   `gcp-test-vps` (sideload to a single VPS). Watch for the other prompts in
   `CloudDeployCommand`: the GitHub-Actions "deploy via git push instead?"
   confirm is skipped under `--no-interaction` (good), but `confirm('Proceed?')`
   in the non-static path is **not** gated; gate it like `deployStaticSite()`.

## Desktop work (multi-environment)

The project page's steps 2–4 are single-environment today (hardcoded
`ProjectController::ENVIRONMENT = 'production'`). Redesign:

- **Environments section** on the project page: one row per cloud
  environment (name, server, address, last deploy), from `env:list --json`
  (or `ProjectInspector` reading both blueprint files meanwhile).
- **Add environment** dialog: name (default `production`, then `staging`),
  server picker (ready stacks from `StackCatalog`, whose `context` is exactly
  what `--context` takes), web address. Runs
  `env <name> --context=… --web-host=… --ingress=traefik --managed=`
  via `CliRunner` as a new `RunKind` (e.g. `add-environment`).
- **Per-environment actions**: Set address (`cloud:configure <env>
--only=hosts --web-hosts=…`, already built), Deploy (`cloud:deploy <env>`),
  and later Change server.
- Replace the "Linking an existing server is coming" note and keep
  "Create a server for this project" (it binds the new server to the env).
- Route/controller changes: env name becomes a route parameter
  (`projects/{project}/environments/{environment}/deploy`, etc.), validated
  against the project's environments.
- Tests: `ProjectsTest` style (fake CLI bin, `ChildProcess::fake()`).

## For the workshop

Students need one environment (`production`) on the shared workshop server,
so the minimum slice is: CLI steps 1, 2 and 5, and the desktop's
Add environment dialog + Deploy for that environment. The full multi-env
list can follow.
