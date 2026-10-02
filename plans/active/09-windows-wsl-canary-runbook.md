# Plan 09: Windows (WSL) canary test runbook

**Goal:** prove LaraKube Desktop 0.0.1 works for a Windows student through WSL, using the canary build, before tagging `v0.0.1`.

## Before you start (on the Mac)

1. Push the three repos. A push to `develop` publishes a canary; the CLI and Desktop each have their own:
   - `cli/` (`develop`): the Desktop installs the CLI's canary, so it needs the latest commits.
   - `desktop/` (`develop`): publishes `canary` with the Linux `.AppImage` and `.deb`.
   - `docs/`: the download page and the Windows steps.
2. Wait for both GitHub Actions `release` runs to finish, then check:
   ```bash
   gh release view canary -R luchavez-technologies/larakube-desktop --json assets -q '.assets[].name'
   ```
   You need `LaraKube.Desktop-0.0.1-canary.N.AppImage`. (Past runs: build matrix mac/win/linux must all be green.)

## On the Windows laptop

Check each step and note what you see. Stop at the first failure and write down the exact message.

1. **WSL.** In PowerShell: `wsl --status`. It should list a default distro (Ubuntu) and WSL version 2. If not: `wsl --install`, then restart.
2. **WSLg.** Open Ubuntu and run `echo $DISPLAY $WAYLAND_DISPLAY`. One of them should be non-empty. If both are empty, this machine cannot show Linux apps (Windows 10 or an old WSL): `wsl --update`, then retry.
3. **Download.** In Ubuntu, from the docs download page's Linux link (or the command below):
   ```bash
   cd ~ && curl -fL -o LaraKube.AppImage \
     "$(gh release view canary -R luchavez-technologies/larakube-desktop --json assets -q '.assets[]|select(.name|endswith(".AppImage")).url')"
   chmod +x LaraKube.AppImage
   ```
4. **Launch.** `./LaraKube.AppImage`. If it fails with a FUSE error, run `./LaraKube.AppImage --appimage-extract-and-run` and note it. If it opens a window, take a screenshot.
5. **First launch → Setup.** With no CLI installed the app should land on Setup, not the dashboard.
6. **CLI install.** Press Install on LaraKube CLI. It should download into `~/.larakube/bin`. Confirm: `~/.larakube/bin/larakube --version`.
7. **kubectl and OpenTofu.** Press Install on each. Both should turn Installed.
8. **Container runtime.** Docker or Podman is installed by you (it needs `sudo`, which the app cannot ask for). In Ubuntu: `sudo apt-get install -y podman slirp4netns fuse-overlayfs uidmap`, then **Check again**. Podman should turn Installed.
   **Elevation probes** (so we can later install Podman from the app without a terminal). Run each in Ubuntu and note the result:
   - `which pkexec && pkexec true` (a graphical password prompt on Windows means it works; "no agent" or no window means it will not).
   - `/mnt/c/Windows/System32/wsl.exe -u root -- id -u` (prints `0` if the Windows-side root route works with no password).
9. **Cloud account.** Save a DigitalOcean or Hetzner token in Settings. The provider shows Ready on Setup.
10. **Create a server** (billed by the provider, destroy it afterwards). Servers → Create a server → size the smallest → Create. Expect about five minutes.
11. **Install a tool** on that server (Tools → pick the server → Install one small tool).
12. **New project.** Projects → New project → Astro (the fastest, it worked before). It should create inside the container without PHP or Node.

## Record

For every step note: pass or fail, the exact message, and a screenshot of any failure. Put the results below.

| Step | Result | Notes |
| --- | --- | --- |
| 1 to 12 | | |

## Known gaps (not failures)

- Podman cannot be installed from the app: it needs `sudo`.
- Deploying a project to a server from Desktop is not built yet.
- The Windows build runs through WSLg and is unverified until this runbook passes.

## After it passes

Tag `v0.0.1` on `desktop/` (`git tag v0.0.1 && git push origin v0.0.1`) and re-run the download page check on `/download` Stable.
