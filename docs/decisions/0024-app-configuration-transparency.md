# 0024. An app's configuration is fully visible; Secret values are revealed one at a time

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

An installed app reads its settings from several ConfigMaps and Secrets, written
by its install (`:init`), by connections (`sso:wire`, `mail:wire`, …), by OpenBao
through ExternalSecrets, and by the user (`tool:env:set`). Desktop showed only the
user's own custom variables, so an operator who wanted to know what an app was
actually configured with had to leave Desktop for `kubectl`.

Showing everything raises two concerns: Secret values must not be exposed casually,
and most keys are owned by something else, so editing them by hand would be undone
or would break the app.

## Decision

1. **The app page has a Configuration tab** listing every ConfigMap and Secret the
   app uses, from the LaraKube CLI's `tool:resources --json`. That command finds
   them from what the app's workloads reference, so a Secret is listed whether or
   not it carries labels.
2. **ConfigMap values are shown. Secret values never travel in that list.** Each is
   revealed on its own, on request, through `tool:secret`, which only reads a
   Secret `tool:resources` lists for that same app. The reveal request is a POST,
   so a value never appears in a URL or an access log, and it is not cached.
3. **Every key shows who owns it**: managed by LaraKube (install or connection),
   rotated by OpenBao (an ExternalSecret writes it), or custom. Only custom keys are
   editable in Desktop, through `tool:env:set`; the others change by re-applying a
   connection or by rotation.
4. **The Logs tab merges every component's logs** from `{tool}:logs --json`,
   polling for lines after the last one shown, only while the tab is open.
5. **The Manage drawer stays a summary** (access, connections, update and pause)
   and links to the app page for configuration, logs and images.

## Consequences

- Anyone with Desktop and the cluster context can read an app's Secrets, the same
  access `kubectl` already gives them; Desktop adds no new permission, only makes
  each read deliberate.
- New kinds of app resources appear without Desktop changes, as long as the app's
  workloads reference them.
