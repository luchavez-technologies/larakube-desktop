# Next steps (updated 2026-09-28)

**The goal:** before the workshop, a student on LaraKube Desktop can create
(or add) an app in every workshop framework and deploy it to a server:
Laravel, Next.js, Vite, Astro, Docusaurus, then Statamic and WordPress
(`AppFramework::isDeployable()`). The tracking plan is
`active/07-all-frameworks-for-workshop.md`. Start there.

## ⚠️ Do these first

1. **The user runs `./build` in `cli/`.** Everything below needs it:
   `new:options`, `new --email`, `init --email`, the wizard's "None" fix, and
   `laravel new` without `-it`. Never run `./build` yourself.
2. **Retry the Laravel create.** Projects → hello-world-desktop → Try again
   (its run recorded its arguments). The first run pulls the PHP image and
   installs Composer packages; expect several minutes. The older
   `hello-laravel` project predates recorded arguments: Remove it.
3. **Push both repos** (the user pushes, never the agent): desktop `develop`
   and cli `develop` are both several commits ahead.

## Framework status (New project → Deploy)

| Framework  | Create (desktop)                                       | Set up existing (`init`) | Deploy tried |
| ---------- | ------------------------------------------------------ | ------------------------ | ------------ |
| Astro      | ✅ worked live (2 min)                                 | built                    | no           |
| Vite       | built, not tried                                       | built                    | no           |
| Docusaurus | built, not tried                                       | built                    | no           |
| Next.js    | built, not tried                                       | built                    | no           |
| Laravel    | failing → fixed, retry it                              | built (email + options)  | no           |
| Statamic   | not offered                                            | built (email only)       | no           |
| WordPress  | not offered (needs `-it` fix in `WordpressNewCommand`) | built (email only)       | no           |

"Deploy tried" is the big open item: no framework has been deployed from the
desktop yet. Use `gcp-test-vps`, never `luchtech-vps`.

## Built this session (all committed, all checks green)

Desktop (`desktop/`, branch `develop`):

- New project: framework list on the left, one card on the right (name,
  email, folder, Laravel options, actions). Laravel's options come from
  `larakube new:options --json` (`app/Services/LaraKube/LaravelOptions.php`),
  defaulting to React + PostgreSQL + FPM/Nginx; PostgreSQL promotes the Plex
  Commons, so Laravel has no `--no-plex` (Next.js keeps it).
- Failed creates: list card shows "Couldn't be created"; project page has
  Try again (re-runs the recorded arguments/folder from run meta) and Remove.
- Set up for LaraKube (`init`): Laravel/Statamic/WordPress ask for the
  Let's Encrypt email; Laravel also gets the options form minus frontend.
- Open in editor (VS Code, PhpStorm, Zed, Cursor), `app/Services/EditorLauncher.php`.
- Tools page keeps the last verified list and re-checks every 30 min;
  Refresh forces a check. Run log fills the window; a crash's exception
  message shows in the failure card.
- App icon from `logo.png`.

LaraKube CLI (`cli/`, branch `develop`):

- `new:options --json`, `new --email`, `init --email` (shared
  `applyEmailOption()` in `GathersInfrastructureConfig`).
- `new` forwards no LaraKube-only flags to `laravel new`; offers
  `larakube up` only when interactive; runs `laravel new` without `-it`
  headlessly (`installerCanPrompt()`).
- Wizard "None" answers use a `'none'` key (select() is always required).
- `tool:list` adopts live, unregistered convention tools into the registry.
- Also: `dns:init` reads `LARAKUBE_CLOUDFLARE_TOKEN`, `tls:show --json`,
  `tool:list --registry-only`.
- Known, left alone: two commits (`1e49076`, `a13762e`) have their
  Co-Authored-By trailer run into the subject line; the user may reword
  before pushing.

## Release status

- First canary `0.0.1-canary.3` published with 7 installers (unsigned,
  no auto-update). The repo is public now. Tag `v0.0.1` after the user
  smoke-tests the installers.

## Backlog after the frameworks

| #   | Plan                                       | Why                                                                    |
| --- | ------------------------------------------ | ---------------------------------------------------------------------- |
| 07  | `active/07-all-frameworks-for-workshop.md` | **The workshop goal. Do first.**                                       |
| 03  | `active/03-windows-wsl-spike.md`           | Most students are on Windows.                                          |
| 01  | `active/01-deploy-app-local-build.md`      | Deploy stepper, attach-existing-server, Plex warning for static sites. |
| 02  | `active/02-ci-builds.md`                   | Removes the local container runtime.                                   |
| 04  | `active/04-packaging-signing-updates.md`   | Signing and auto-update.                                               |
| 05  | `active/05-small-follow-ups.md`            | Polish, incl. Clone from Git and "trust this folder".                  |
| 06  | `active/06-structured-progress-events.md`  | Replace log matching.                                                  |

## Rules that bite

- Never test destructive flows on `luchtech-vps` (the user's production server).
- The user runs `./build` and pushes; agents don't.
- `composer ci:check` in `desktop/` before committing; the `cli/` pre-commit
  hook runs the full suite (commit with `git commit --only -- <paths>`).
- Secrets go to the CLI by environment variable, never argv.
