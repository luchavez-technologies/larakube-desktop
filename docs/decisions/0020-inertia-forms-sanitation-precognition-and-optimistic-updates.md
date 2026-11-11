# ADR 0020: Standardize UI Forms on Inertia `<Form>`, `SanitizingFormRequest`, Precognition, and Optimistic Updates

**Status:** Accepted (2026-11-11)

## Context

LaraKube Desktop runs `@inertiajs/react` `^3.0.0` and `inertiajs/inertia-laravel` `^3.4.0`, yet forms and mutations drifted into three recurring UX and correctness gaps:

1. **"Waiting for Sync" UI lag after deletes/toggles**: Deleting a mailbox (`MailController::deleteAccount`) or domain started an async `CliRunner` subprocess and returned `back()` without touching the mirrored SQLite rows (`MailAccount` / `MailDomain`) or passing an `optimistic` prop to `<Form>`. The deleted row stayed visible until the CLI exited and `RecordRunOutput` triggered `SyncMailJob`. Similarly, marking notifications read waited on HTTP round-trips despite being deterministic DB updates.
2. **Ad-hoc validation and sanitation**: Most controllers used inline `$request->validate(...)` with inconsistent trimming/lowercasing and loose string rules (or raw `abort_unless(...)` checks) instead of dedicated `FormRequest` classes.
3. **Silent modal validation failures & unused Precognition**: Many `<Form>` dialogs omitted `{({ errors }) => ...}` render slots entirely, so validation errors from Laravel never appeared next to the offending field, and none of the mutating routes enabled Laravel Precognition (`HandlePrecognitiveRequests`).

Note an important subtlety discovered while wiring `SanitizingFormRequest`: stripping `https://` or `/path` automatically during `prepareForValidation()` silently rewrites intentionally invalid URL inputs (like `https://example.com/` submitted into a DNS hostname field) into passing values, bypassing the domain regex error message that educates the user.

## Decision

1. **Use Inertia `<Form>` by default for mutations; keep `useForm` only for stateful multi-step wizards** (`servers/create.tsx`, `projects/create.tsx`). Render `<Form>` with `{({ errors, invalid, validate, processing }) => ...}` and shared [`FieldError`](file:///Users/jsluchavez/Codes/Ideas/laravel-k8s/desktop/resources/js/components/field-error.tsx) / `fieldInputClass()` helpers so server validation errors always surface inline.
2. **Back mutating form routes with dedicated `FormRequest` classes extending [`SanitizingFormRequest`](file:///Users/jsluchavez/Codes/Ideas/laravel-k8s/desktop/app/Http/Requests/SanitizingFormRequest.php)** (no inline `$request->validate(...)` in new/refactored endpoints):
    - Normalize harmless formatting in `prepareForValidation()` via `sanitizeEmailField()`, `sanitizeDomainField()`, and `sanitizeTrimmedField()`.
    - **Never silently strip URL schemes (`https://`) or paths in `sanitizeDomainField()`**; preserve them so `HOSTNAME_REGEX` rejects them with actionable guidance.
3. **Attach `Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests` to `FormRequest` routes** and configure `validationTimeout={250}` + `onBlur={() => validate('field')}` on `<Form>` inputs. Because Precognition stops cleanly before controller execution, live validation never spawns `CliRunner` / `ChildProcess` jobs.
4. **Apply Inertia v3 Optimistic Updates cleanly by backing pattern**:
    - **Synchronous SQLite/state actions** (e.g. `NotificationBell` read/dismiss): use `router.optimistic((props) => ...)` (paired with `only: [...]` per ADR 0019).
    - **Async `CliRunner` deletes/removals** (e.g. `MailController::deleteAccount`, `removeDomain`): pair client-side `<Form optimistic={(props) => ...}>` with an **optimistic update/delete on the mirrored SQLite cache** before returning `back()`. Because Inertia replaces optimistic client props once the `303` redirect returns, updating the mirrored DB table keeps the UI consistent until `RecordRunOutput` → SyncJob confirms or restores real cluster state on failure.

## Consequences

- Delete, dismiss, and toggle actions update the UI in 0ms without stale-row flicker waiting on background cluster syncs.
- Invalid fields highlight immediately on blur via Precognition while consuming `FormRequest` rules as the single source of truth — zero duplicate JS validation schemas and zero accidental CLI spawns.
- Every future feature adding or updating a Desktop form or quick action must follow this checklist: dedicated `SanitizingFormRequest`, `HandlePrecognitiveRequests` on its route, inline `<FieldError />` rendering, and `optimistic` handling where safe.
