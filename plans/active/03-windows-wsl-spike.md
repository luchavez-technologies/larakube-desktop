# Plan 03 — Windows via a bundled WSL distro (spike)

**Status:** Not started. **Workshop blocker**: most students are on Windows. See ADR 0007.

## Spike (needs a Windows 11 machine or VM)

1. From the NativePHP app, run `wsl.exe --status`, then `wsl --install
--no-distribution` (UAC + reboot) when missing.
2. Build a minimal rootfs from the toolbox image (Debian slim + larakube
   standalone linux binary + kubectl + tofu + openssh + podman) and export
   it: `docker export` → `larakube-rootfs.tar`.
   `wsl --import LaraKube %LOCALAPPDATA%\LaraKube\wsl larakube-rootfs.tar`.
3. Confirm `ChildProcess::start(['wsl.exe','-d','LaraKube','--','env','-i',
…,'larakube','cloud:stacks','--json'])` streams stdout/stderr live and
   that `stop()` cancels.
4. Build the Windows target in GitHub Actions (it can't be built on a Mac).

## Then implement

- `ToolLocator` gets a platform adapter: on Windows, `find()` checks inside
  the distro, and `isolate()` prefixes `wsl.exe -d LaraKube --`.
- A readiness screen (designed in Figma: Setup → "Windows — first run"):
  virtualization, admin rights, disk, network to the providers.
- Paths: project folders live in Windows (`C:\…`), so pass them as
  `/mnt/c/...` to the distro.
- Signing: Azure Trusted Signing (see plan 04).

## Watch out

Corporate or school laptops that block virtualization. Keep the rootfs small
for venue Wi-Fi (ship gcloud/aws on demand).
