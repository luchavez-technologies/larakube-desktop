# 07: Every workshop framework, created and deployed from the desktop

**Goal (user, 2026-09-28):** before the workshop, students (mostly on
Windows, no PHP/Node installed) can use LaraKube Desktop to create a new app
or add an existing one, in each of these frameworks, and deploy it to a
server: Laravel, Next.js, Vite, Astro, Docusaurus, Statamic, WordPress. These
are exactly the frameworks where `AppFramework::isDeployable()` is true in
the LaraKube CLI.

## How the desktop drives each framework

| Framework  | Create command (desktop passes)                        | `init` extras                        |
| ---------- | ------------------------------------------------------ | ------------------------------------ |
| Laravel    | `new <name> --fast --email=… <flags from new:options>` | `--email=…` + options (not frontend) |
| Next.js    | `nextjs:new <name> --fast --no-plex`                   | none                                 |
| Vite       | `vite:new <name> --fast`                               | none                                 |
| Astro      | `astro:new <name> --fast`                              | none                                 |
| Docusaurus | `docs:new <name> --fast`                               | none                                 |
| Statamic   | not offered yet (`statamic:new`)                       | `--email=…`                          |
| WordPress  | not offered yet (`wordpress:new`)                      | `--email=…`                          |

Every run goes through `CliRunner` with `--no-interaction`, no TTY, cwd =
the parent folder (create) or the project (init). Anything that prompts or
needs a terminal fails there. That is the recurring bug class: look for
`run --rm -it` and required prompts without a flag.

## Checklist

1. [ ] User runs `./build`; retry the Laravel create (hello-world-desktop).
2. [ ] Try Vite, Docusaurus and Next.js creates live (Astro worked).
3. [ ] Deploy each created app to `gcp-test-vps`: Set up → Server → Address
       → Deploy. Static sites (Vite/Astro/Docusaurus) need `plex:init` on
       the server (Commons bucket); add a desktop warning or step for it.
       Laravel with PostgreSQL joins Plex when present.
4. [ ] Statamic: add to `ProjectController::SCAFFOLDERS`. Check
       `StatamicNewCommand` for `-it`/prompts headlessly (it also calls
       `larakube up` after a confirm; gate it like `new`, see
       `NewCommand` `isInteractive()`), and whether it needs `--email`.
5. [ ] WordPress: `WordpressNewCommand.php:252` uses `run --rm -it`
       unconditionally; gate it like `NewCommand::installerCanPrompt()`,
       then add to `SCAFFOLDERS` (plus `--email` if its wizard asks).
6. [ ] Windows: none of this is tried on Windows yet; see plan 03.
7. [ ] Optional: "Clone from Git" (`larakube clone <repo> --directory=`),
       if the workshop hands out a starter repo.

## Tests to keep in the same style

- Desktop: `tests/Feature/ProjectsTest.php` (fake CLI bin dir,
  `ChildProcess::fake()`, `Process::fake()` for `new:options`).
- LaraKube CLI: `NewCommandScriptedRunTest`, `NewOptionsCommandTest`,
  `InitCommandEmailTest`, `InitWizardTest`, `ScaffolderWizardTest`.
