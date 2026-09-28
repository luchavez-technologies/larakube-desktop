# ADR 0007: Windows runs the CLI inside a bundled WSL distro

**Status:** Proposed (not built; see plans/active/03-windows-wsl-spike.md)

## Context

The CLI is POSIX shell throughout (138 `sudo`, 73 `2>/dev/null`, 69 `~/`,
34 `command -v`), and a native Windows port would be a long tail. `larakube
setup` already tells Windows users to use WSL2.

## Decision

On Windows the app enables WSL (one UAC prompt, one reboot), imports a
LaraKube distro built from the shared **toolbox image** (larakube + kubectl

- tofu + ssh + provider CLIs, plus rootless Podman for local builds), and
  runs every command as `wsl.exe -d LaraKube -- env -i … larakube …`. A
  readiness check (virtualization, admin rights, disk, network) runs before
  the workshop.
