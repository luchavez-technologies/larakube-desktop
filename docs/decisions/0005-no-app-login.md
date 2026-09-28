# ADR 0005: No app-level login

**Status:** Accepted (2026-09-27)

## Context

Real secrets (kubeconfig, SSH keys, provider CLI credentials) live on disk
and are readable by anyone with the OS account. A login would add a server
dependency and a workshop sign-up step without protecting them.

## Decision

No login in the app. Cloud access uses the provider CLIs' own flows.
Destructive actions need type-the-name confirmation. App-held tokens are
passed per run and never stored. If storage is ever needed, use the OS
keychain. The local PHP server already rejects requests without NativePHP's
secret (`PreventRegularBrowserAccess`). An optional "Sign in to LaraKube
Cloud" can come later via the planned Passport Device Grant.
