# ADR 0007: Windows runs the CLI inside a bundled WSL distro

**Status:** Accepted (Amended 2026-10-18 — native dispatch for `larakube` invocations)

## Context

The CLI is POSIX shell throughout (138 `sudo`, 73 `2>/dev/null`, 69 `~/`,
34 `command -v`), and a native Windows port would be a long tail. `larakube
setup` already tells Windows users to use WSL2.

## Decision

On Windows the app enables WSL (one UAC prompt, one reboot), imports a
LaraKube distro built from the shared **toolbox image** (larakube + kubectl

- tofu + ssh + provider CLIs, plus rootless Podman for local builds), and
  runs every command as `wsl.exe -d larakube-ubuntu -- env -i … larakube …`. A
  readiness check (virtualization, admin rights, disk, network) runs before
  the workshop.

## Amendment (2026-10-18): Native `larakube.exe` Dispatch & Lockstep Binary Cache

Now that the CLI includes its own `WslBridge` entry point (`cli/larakube` +
`App\Services\WslBridge`), Desktop no longer wraps `larakube` invocations in
`wsl.exe`:

1. **Native Entry Point (`larakube.exe`)**: When `%USERPROFILE%\.larakube\bin\larakube.exe`
   is present on the Windows host, `ToolLocator::find('larakube')` resolves to
   that native `.exe` and `ToolLocator::isolate()` invokes it directly via
   `isolateForNativeWindows()` (falling back to the in-distro binary if
   `larakube.exe` is not yet installed). The CLI itself decides per-command
   whether to run natively on Windows (`setup`, `update`, `wsl:*`, and 1-hop
   UAC elevation for Windows hosts-file sync) or transparently re-exec inside
   `larakube-ubuntu`.
2. **Host-Cached Linux Binary (`larakube-linux-x64`)**: Both `CliInstaller` and
   `larakube.exe update` cache the matching `larakube-linux-x64` binary next to
   `larakube.exe` under `%USERPROFILE%\.larakube\bin\`. `WslBridge` and
   `Wsl::import()` automatically sync this cached Linux binary into
   `/usr/local/bin/larakube` inside `larakube-ubuntu`, keeping both binaries in
   strict version lockstep and surviving "LaraKube Linux Reset" (`wsl --unregister`)
   without redownloading.
3. **Other Linux Tools Unchanged**: Direct Desktop invocations of `kubectl`,
   `ssh`, editor CLIs, and `ReadinessCheck` probes continue using
   `ToolLocator::isolateForWsl()`.
