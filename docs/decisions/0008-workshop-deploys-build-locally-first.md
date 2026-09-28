# ADR 0008: Workshop deploys build locally first; CI builds come second

**Status:** Accepted (2026-09-28)

## Context

Students deploy Laravel, Statamic, WordPress, Next.js, Vite, Astro and
Docusaurus apps. These are exactly the `AppFramework::isDeployable()` set.
`cloud:deploy` builds the image locally, then SSH-sideloads it (VPS) or
pushes it to a registry. The CI path (`cloud:configure --only=ci`, GitHub
Actions) avoids a local container runtime but needs a GitHub account and
login per student.

## Decision

Build the deploy flow on local builds first (`cloud:deploy`). Setup checks
for a container runtime: OrbStack/Docker Desktop on macOS, and Podman inside
the LaraKube WSL distro on Windows. CI builds are a follow-up
(plans/active/02-ci-builds.md) and plug into the same Projects screens.
