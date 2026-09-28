# Plan 04 — Releases: canary, v0.0.1, then signing and auto-update

**Status:** Release workflow written (2026-09-28): `.github/workflows/release.yml`.
Not run in CI yet, because the repo has no GitHub remote. **Verified
locally:** `NATIVEPHP_APP_VERSION=0.0.1-local NATIVEPHP_UPDATER_ENABLED=false
php artisan native:build mac arm64 --no-interaction` produced
`LaraKube Desktop-0.0.1-local-arm64.dmg` and `.zip` (about 145 MB each),
ad-hoc signed (`TeamIdentifier=not set`). NativePHP's notarize hook logs
"appleId property is required" and skips notarization; that's harmless.

## How releases work (mirrors the CLI's ci.yml)

| Trigger           | Result                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| push to `develop` | **Canary** prerelease: version `0.0.1-canary.<run_number>`, moving `canary` tag, release replaced each push |
| push tag `v0.0.1` | **Stable** release `v0.0.1` (version = tag without `v`), immutable                                          |
| manual            | `workflow_dispatch` (behaves like develop unless run on a tag)                                              |

Jobs: `checks` (composer setup + `composer ci:check`: Pest, `vp check`,
`tsc`) → `build` matrix (macos-latest arm64 and x64, windows-latest x64,
ubuntu-latest x64) running `php artisan native:build <os> <arch>` → `publish`
(gh release with the .dmg/.zip/.exe/.AppImage/.deb from
`nativephp/electron/dist`). `config/nativephp.php` prebuild runs `npm run
build` (public/build is gitignored).

## To turn it on

1. Create the GitHub repo (e.g. `luchavez-technologies/larakube-desktop`), then
   `git remote add origin …`, push `main`, and create and push `develop`.
2. Canary: merge `feat/desktop-spike` into `develop` and push.
3. First stable: `git tag v0.0.1 && git push origin v0.0.1`.

## Known limits of these first builds

- **Unsigned.** macOS: right-click → Open, or
  `xattr -dr com.apple.quarantine "/Applications/LaraKube Desktop.app"`.
  Windows SmartScreen: More info → Run anyway. The release notes say so.
- **No auto-update** (`NATIVEPHP_UPDATER_ENABLED=false`). macOS auto-update
  only works on signed builds, and the config's default provider (`spaces`)
  has no credentials.
- The app still needs the LaraKube CLI installed separately (install.sh or brew).

## Next: signing + updates

- macOS: `NATIVEPHP_APPLE_ID`, `NATIVEPHP_APPLE_ID_PASS` (app-specific
  password), `NATIVEPHP_APPLE_TEAM_ID` as repo secrets on the mac build steps
  (Apple Developer account, $99/yr).
- Windows: Azure Trusted Signing: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `NATIVEPHP_AZURE_PUBLISHER_NAME`,
  `NATIVEPHP_AZURE_ENDPOINT`, `NATIVEPHP_AZURE_CERTIFICATE_PROFILE_NAME`,
  `NATIVEPHP_AZURE_CODE_SIGNING_ACCOUNT_NAME`.
- Updater: `NATIVEPHP_UPDATER_PROVIDER=github` with `GITHUB_REPO`,
  `GITHUB_OWNER`, `GITHUB_CHANNEL` (`latest`; a canary channel could use
  a prerelease channel), `GITHUB_RELEASE_TYPE`. NativePHP's own
  `native:publish` expects a draft release tagged `v<version>` to exist, so
  either switch the publish job to that flow or keep `gh` and point the
  updater at the same releases. Verify against electron-updater's GitHub
  provider (it reads `latest-mac.yml` etc. from the release).
- Decide whether to ship the CLI inside the app (it must then be signed with
  the hardened runtime) or download it on first run (the feasibility plan
  leans toward download).
