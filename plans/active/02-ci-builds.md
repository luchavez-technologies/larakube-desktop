# Plan 02 — Deploy via CI builds (GitHub Actions)

**Status:** Not started. Follows plan 01 (ADR 0008).
**Why:** no container runtime on student laptops. Students push to GitHub
and Actions builds and deploys.

## CLI pieces that already exist

- `cloud:configure <env> --only=ci` writes the GitHub Actions workflow and
  deploy secrets. `--rotate` mints fresh ones. Registry per environment:
  `cloud:configure <env> --only=registry` (GHCR/Docker Hub).
- `gh` is a CliTool (`larakube setup --tools=gh`).

## Desktop work

1. Setup: GitHub login status (`gh auth status`), with login through
   `gh auth login --web` shown as an open-url + device code in the app.
   Needs the CLI to print the code/URL on stdout headlessly. Verify.
2. Project page: "Deploy with GitHub" toggle, which runs
   `cloud:configure production --only=ci --no-interaction` in the project
   folder, then shows "Commit and push to deploy" plus the Actions run link.
3. Show the latest workflow run status (`gh run list --json`).

## Risks

Per-student GitHub accounts and org access, secrets in repos (the CLI's
"Secrets out of CI" work: `dotenv:push/pull`), and rate limits on venue Wi-Fi.
