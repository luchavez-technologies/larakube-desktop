# Next steps (updated 2026-09-28)

## ⚠️ Pending right now: do these first

1. **CLI changes are written and tested but NOT committed** (`cli/`, branch `develop`):
   - Staged: `dns:init` reads `LARAKUBE_CLOUDFLARE_TOKEN`
     (`app/Commands/Dns/DnsInitCommand.php` + test), and `tls:show --json`
     (`app/Commands/Tls/TlsShowCommand.php` + test).
   - Unstaged: `tool:list --registry-only` (`app/Commands/Tool/ToolListCommand.php`
     + `tests/Feature/ToolListCommandTest.php`).
   - Why not committed: the pre-commit hook runs the full suite (`pest
     --parallel`). On 2026-09-28 it failed four times, only on real processes
     (`openssl genrsa`, `git describe`, `kubectl`) exceeding 60s while the Mac
     was throttling, never on these files. Retry when the machine is idle:
     suggested messages are `feat(dns): …`, `feat(tls): add --json to
     tls:show`, `feat(tool): add --registry-only to tool:list`. Before
     committing in `cli/`, message any live peer Claude session.
   - After committing, the user runs `./build` so Desktop's DNS/SSL status
     and the fast Tools list work.
2. Desktop work in progress: plan 01. Projects screens are built; see its Progress section for the remaining 4 items.

## Backlog, in order

| # | Plan | Why now |
|---|---|---|
| 01 | `active/01-deploy-app-local-build.md`: Projects + Deploy | The workshop's core task. Decided: local builds first. |
| 03 | `active/03-windows-wsl-spike.md`: Windows | Most workshop students are on Windows. Biggest risk. |
| 02 | `active/02-ci-builds.md`: GitHub Actions deploys | Removes the container-runtime requirement. |
| 04 | `active/04-packaging-signing-updates.md` | Needed before handing the app to anyone. |
| 05 | `active/05-small-follow-ups.md` | Polish. |
| 06 | `active/06-structured-progress-events.md` | Replaces fragile log matching (shared with Cloud). |

## Done so far (desktop `feat/desktop-spike`)
- b1725e4: spike (Setup, Create server, live runs).
- 3c25c26: Figma restyle, Servers list/detail/destroy, Activity.
- 7efd4b4: Tools section (install/remove/open).
- 0aca6a7: DNS/SSL next steps with live status, compact Tools grid with
  filter, run back links, non-JSON log fix.
- (next commit) two-phase Tools loading (registry then verified), and the
  create-server result card buttons that open the domain/SSL dialogs.

## Verified live
- GCP create server end to end (6 steps, about 6 minutes). Destroy leftovers
  of an unfinished server. Connect a domain on `gcp-test-vps` (a second
  Cloudflare account, as its own group). Tools list on a production VPS with 17 installed tools.
- **Never test destructive flows on `luchtech-vps`** (the user's production
  server). Use `gcp-test-vps` or a throwaway server.
