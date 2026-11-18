# 0025. No native browser dialogs (`window.confirm`, `alert`, or `prompt`)

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Calling native `window.confirm()`, `confirm()`, `window.alert()`, `alert()`, or `window.prompt()` inside NativePHP/Electron triggers an unstyled Chromium OS dialog that clashes with LaraKube Desktop's design system, cannot render formatted code badges or Lucide icons, offers poor copywriting controls, and blocks the renderer thread.

Additionally, prompting for confirmation before staging a reversible draft change in the UI (such as clicking the trash icon on an environment variable row that only marks the row for removal with an inline **Undo** control) adds friction for no safety benefit.

## Decision

1. **Never call native browser dialogs** (`window.confirm()`, `confirm()`, `window.alert()`, `alert()`, `window.prompt()`) anywhere in Desktop's React UI (`desktop/resources/js/`).
2. **Use the shared `<ConfirmModal>` component** (`desktop/resources/js/components/confirm-modal.tsx`) whenever user confirmation is required before an immediate network, cluster, CI, or destructive filesystem mutation. Include an icon on every action button (`XCircle` on Cancel and a contextual Lucide icon on Confirm) and rich formatted descriptions where helpful.
3. **Never confirm reversible draft edits**: actions that only stage a draft change in memory (and expose an inline Undo/Discard control before saving) apply immediately without any modal.

## Consequences

- Every confirmation dialog in LaraKube Desktop shares consistent typography, theme tokens, backdrop blur, keyboard (`Escape`) support, and button iconography.
- Existing confirmation modals (`ConfirmModal`, `project-features-card.tsx`, `workloads-pods-card.tsx`, `php-extensions-card.tsx`) serve as the standard pattern across the app.
