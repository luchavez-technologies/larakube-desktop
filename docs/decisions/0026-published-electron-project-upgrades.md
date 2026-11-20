# 0026: The Published Electron Project Is Upgraded by Three-Way Merge, Against a Written List of Our Changes

**Status:** Accepted

## Context

Desktop runs from a published copy of NativePHP's Electron project at `nativephp/electron`, because we change a few of its files. Updating `nativephp/desktop` does not update that copy: `native:install --force` leaves an existing `nativephp/electron` alone. Re-running it with `--publish` replaces the folder with the stock copy and silently drops our changes. That includes the Windows installer fix that keeps `~/.larakube` safe during silent auto-updates.

When moving to NativePHP 2.5.0 the copy was still on Electron 40, while 2.5.0 ships Electron 45.

## Decision

1. **Upgrade by three-way merge, file by file.**
    - Base: the version first published in commit `1015e32b`, "Installed NativePHP".
    - Ours: the committed file.
    - Theirs: `vendor/nativephp/desktop/resources/electron/<file>`.

    Use `git merge-file`, copy in any files upstream added, and take upstream's `package-lock.json` with our name and version whenever the dependencies match. Never `--publish` over the folder.

2. **Every file that differs from stock is listed below, with why.** After an upgrade, comparing the folder against stock must show only these files. Anything else that differs is a missed upstream change; anything here that no longer differs is a lost change of ours.

| File                                                  | Our change                                                                              | Why                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `build/icon.png`, `build/icon.icns`, `build/icon.ico` | LaraKube icons                                                                          | Branding                                                                        |
| `build/installer.nsh`                                 | Ours only                                                                               | Silent NSIS auto-updates must not wipe `~/.larakube`                            |
| `electron-builder.mjs`                                | `LARAKUBE_UPDATE_URL` generic update feed; installer file names from `fileName`         | Updates come from the GitHub release assets; stable installer names             |
| `electron-plugin/src/server/php.ts`                   | `PHP_CLI_SERVER_WORKERS=4` (not on Windows)                                             | Page checks run in parallel instead of queueing behind PHP's one-request server |
| `src/main/index.js`                                   | `app.name = 'LaraKube'`; console mirrored to `<userData>/logs/main.log`; `shell` import | Packaged apps have no console; the sponsor link opens externally                |
| `package.json`, `package-lock.json`                   | Name `larakube`, author, homepage, description                                          | Branding                                                                        |

3. **Check after merging:**
    - `npx tsc --noEmit -p .` and `npx vitest run` in `nativephp/electron/electron-plugin`;
    - `npm ci` in `nativephp/electron`;
    - restart `native:dev`.

    A standalone `npm run build` fails by design, because it needs paths that only `native:run` provides.

## Consequences

- Upgrades keep upstream fixes, such as 2.5.0's signed native events, and our own changes, with a checklist that catches either being lost.
- A new customization of a file in `nativephp/electron` must be added to the table in the same commit.
- `native:dev` rewrites `package.json`'s name and metadata, and regenerates `build/icon.png`, from Desktop's config on every run. Those working-tree changes are expected and are never committed as part of an upgrade.
