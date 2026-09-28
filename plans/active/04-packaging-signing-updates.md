# Plan 04 — Packaged, signed builds and auto-update

**Status:** Not started.
- `config/nativephp.php`: `app_id` is `app.larakube.desktop`. Set version, author, website.
- macOS: Developer ID signing + notarization (Apple Developer account).
  Auto-update only works on signed builds.
- Windows: Azure Trusted Signing or signtool.
- Updater: GitHub Releases provider (`NATIVEPHP_UPDATER_PROVIDER=github`).
- CI matrix (macOS, Windows, Linux runners). Cross-building macOS→Windows is limited.
- Decide: ship the CLI inside the .app (it must then be signed with the
  hardened runtime) or download it on first run (app-managed
  `~/Library/Application Support/LaraKube/bin`). The feasibility plan leans
  toward app-managed download plus an "Install `larakube` command in
  Terminal" menu item.
