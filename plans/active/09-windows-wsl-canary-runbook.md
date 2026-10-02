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
3. **Download.** In Ubuntu (not Windows), run the command on `docs` `/download?os=windows`:
    ```bash
    curl -fL -o LaraKube-Desktop.AppImage https://github.com/luchavez-technologies/larakube-desktop/releases/download/canary/LaraKube-Desktop-linux-x64.AppImage
    chmod +x LaraKube-Desktop.AppImage
    ```
4. **Launch.** `./LaraKube-Desktop.AppImage`. If it fails with a FUSE error, run `./LaraKube-Desktop.AppImage --appimage-extract-and-run` and note it. If it opens a window, take a screenshot.
5. **First launch → Setup.** With no CLI installed the app should land on Setup, not the dashboard.
6. **CLI install.** Press Install on LaraKube CLI. It should download into `~/.larakube/bin`. Confirm: `~/.larakube/bin/larakube --version`.
7. **kubectl and OpenTofu.** Press Install on each. Both should turn Installed.
8. **Container runtime.** Press Install on Podman in Setup. Inside WSL it runs as root through Windows, so there is no password prompt. It should turn Installed. If it fails, copy the run's output from Activity. Fallback in Ubuntu: `sudo apt-get install -y podman slirp4netns fuse-overlayfs uidmap`, then **Check again**.
   **What is this computer for?** At the top of Setup, pick _Install tools on a server_ (hides Podman, Docker and Git) and then _Build and run apps here_ (shows them, plus **Local development**). The choice should stick after Check again.
   **Local development.** Press **Set up local development** and confirm. Expect no password prompt inside WSL; the run's output shows Podman, then k3s, then Traefik. Afterwards, in Ubuntu: `sudo ls /etc/sudoers.d/` must NOT list `larakube-desktop-setup` (access is removed when the run ends), and `kubectl get nodes` should show the node Ready. If Setup asks you to restart WSL (mirrored networking), do `wsl --shutdown` from PowerShell, reopen Desktop, and press **Check again**.
9. **Cloud account.** Save a DigitalOcean or Hetzner token in Settings. The provider shows Ready on Setup.
10. **Create a server** (billed by the provider, destroy it afterwards). Servers → Create a server → size the smallest → Create. Expect about five minutes.
11. **Install a tool** on that server (Tools → pick the server → Install one small tool).
12. **New project.** Projects → New project → Astro (the fastest, it worked before). It should create inside the container without PHP or Node.

## Record

For every step note: pass or fail, the exact message, and a screenshot of any failure. Put the results below.

| Step    | Result | Notes |
| ------- | ------ | ----- |
| 1 to 12 |        |       |

## Known gaps (not failures)

- Docker cannot be installed from the app; Podman can (Linux and WSL only).
- Deploying a project to a server from Desktop is not built yet.
- The Windows build runs through WSLg and is unverified until this runbook passes.

## After it passes

1. Tag `v0.0.1` on `desktop/` (`git tag v0.0.1 && git push origin v0.0.1`) and wait for the release run.
2. In `docs/src/brand.ts` set `stableReleased = true`, so the download page offers Stable.
3. Check `/download` Stable: the buttons link to `releases/latest/download/LaraKube-Desktop-*` (fixed names the workflow now publishes).
