# ADR 0011: External links use background `/open` dispatch; never trigger Inertia visits

**Status:** Accepted (2026-10-13)

## Context

In a desktop Electron application, opening an external URL in the user's default browser—such as provider dashboards (Cloudflare, AWS, GCP, DigitalOcean), pricing calculators, documentation guides, Git repositories, or companion webmail and admin consoles (Bulwark, Stalwart)—is a frequent interaction.

Historically, the frontend rendered these links as Inertia `<Link>` components submitting a POST visit:

```tsx
<Link href={open().url} method="post" data={{ url }} as="button">
```

When clicked, Inertia intercepted the request and attached the `X-Inertia: true` header. The server's `OpenExternalController` processed the shell command to open the URL and returned `back()`. Because it was an Inertia visit, the client treated this redirect as an internal page navigation:

1. It triggered a full Inertia page reload and remounted the active page component.
2. Any in-progress form inputs that were not explicitly serialized were wiped out (for example, entering cluster names, cloud credentials, or SSH settings on the "Create server" page was completely cleared when clicking the Cloudflare API token link).
3. The page suffered jarring UI re-renders and unneeded network round-trips for what should have been a side-effect-only OS action.

## Decision

1. **External links must never use Inertia `<Link>` components or Inertia form visits.**
   External URLs must be dispatched through the dedicated utility function `openExternalUrl(url)` or the `<ExternalLinkButton url={url}>` component defined in `resources/js/lib/open-external.tsx`.

2. **Background JSON dispatch via `/open`.**
   The dispatcher sends a background `fetch` request (`POST /open` with `Accept: application/json` and CSRF headers) directly to the local backend. `OpenExternalController` returns `{ ok: true }`. The browser window opens, but Inertia's client router is never notified and the active page DOM and React component tree remain completely untouched.

3. **Form state remembering on complex wizard pages.**
   All multi-step or input-heavy forms (such as `resources/js/pages/servers/create.tsx`) must pass a unique form key to `useForm('servers.create', ...)` so that even if a user explicitly leaves the page or refreshes the window, their inputs are preserved via Inertia's `remember` mechanism.

## Consequences

- Clicking external provider links, documentation links, or companion admin consoles is completely safe and will never wipe user inputs.
- Developers and agents creating buttons or links to external URLs must use `<ExternalLinkButton>` or `openExternalUrl()` rather than Inertia `<Link>`.
