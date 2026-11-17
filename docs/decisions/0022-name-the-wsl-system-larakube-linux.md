# 0022. Call the WSL system "LaraKube Linux"; keep `larakube-ubuntu` as its technical name

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

On Windows, LaraKube Desktop imports its own WSL distro. That distro is where projects,
k3s, Podman and the git forge CLIs live. The code, the image and the repository call it
`larakube-ubuntu`. User-facing text mixed three names for it: "LaraKube Linux",
"larakube-ubuntu" and "the WSL distro". "LaraKube Ubuntu" also came up as a candidate.

Points that shaped the choice:

- The base image is a detail that changes. It just moved from Ubuntu 24.04 to 26.04, and
  a smaller or different base is possible later.
- A modified distribution named after Ubuntu reads as an Ubuntu product. Canonical's
  trademark policy restricts using "Ubuntu" in the name of a derived distribution.
- On Windows, users need to know that a part of LaraKube runs in Linux. Which distribution
  it is only matters when someone is debugging it.
- The technical name already appears in about 290 places: `WslDistro::NAME`, the
  CLI's `WslBridge`, the image build, the release assets, and every installed machine's
  `wsl -l`. Renaming it would mean re-importing every distro for no visible gain.

## Decision

1. **Every user-facing string says "LaraKube Linux".** This covers Desktop UI text,
   notices and errors, CLI output, and docs prose. It never says "LaraKube Ubuntu", and
   never says "the distro" or "the WSL distro" where "LaraKube Linux" fits. On first
   mention, "LaraKube Linux (WSL)" is fine where it helps a reader place it.
2. **Technical identifiers stay `larakube-ubuntu`.** These are the WSL distro name, the
   image and its release assets, the repository, constants, and file names. User-facing
   text shows the technical name only where the user has to type or recognise it, such
   as `wsl -l`, `wsl --unregister` or a Windows Terminal profile. It goes in a code span
   next to the product name: "LaraKube Linux (the `larakube-ubuntu` WSL distro)".
3. **The base is mentioned only where it matters.** The image README and release notes
   say "based on Ubuntu 26.04 LTS". UI text does not name the base.

## Consequences

- New UI and CLI text has one name to use, and reviews can flag "WSL distro",
  "larakube-ubuntu" or "LaraKube Ubuntu" in prose.
- Changing the base image needs no rename and no re-import, only a README line.
- People debugging see `larakube-ubuntu` in `wsl -l`. The UI uses that name wherever it
  sends them there, so the two names are never left unconnected.
