# Plan 05 — Small follow-ups

- **Per-tool install forms:** some `*:init` need more than `--domain` (for
  example an admin email) and fail with MissingFlagException. Surface the
  flag from the run failure ("The CLI needs --X") and add fields per tool.
- **Minimum CLI version:** Readiness should flag a CLI older than the flags
  the app uses (`cloud:providers`, `cloud:stacks --json`,
  `tool:list --registry-only`, `tls:show --json`, `dns:init`
  LARAKUBE_CLOUDFLARE_TOKEN).
- **Stale OpenTofu:** the user's local tofu is 1.6.2. Cloud remote state
  needs 1.10 or newer. Flag outdated versions, not just missing ones.
- **Cloud logins from the app:** DO/Hetzner tokens into the OS keychain;
  GCP/AWS via device-code/open-url.
- **Tool detail credentials:** `tool:show --json` returns no admin
  credentials. Add them CLI-side if Desktop should show them.
