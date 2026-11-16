# 0021. Push data changes to the UI through NativePHP events

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Pages learn about new data in two ways today: Inertia `usePoll()` while a sync is
known to be running (ADR 0018), and a full `router.reload()` that the floating run
HUD fires when a run ends.

Both guess at timing. Updating an app showed why that isn't enough. The run
finished and the HUD reloaded the page, but the run's end is what dispatches
`SyncClusterToolsJob`. So the reload landed before fresh data existed. The card
kept offering **Update** for an app that had just been updated, and no poll was
running to correct it.

NativePHP already provides a push channel. Its `EventWatcher` listens to every
Laravel event. Any event whose `broadcastOn()` includes the `nativephp` channel is
posted to Electron, which forwards it to every window as `window.Native.on(...)`.
This works from queue workers too, since they run with `NATIVEPHP_RUNNING`. No
websocket server or broadcast driver is involved. Desktop already used this for
`NotificationClicked`.

## Decision

1. **The server announces what changed, not the data.** An event names the change
   and its scope, for example `ServerDataSynced(server, scope)`. It never carries the
   rows themselves. The page reacts with `router.reload({ only: [...] })` scoped to
   the affected props (ADR 0019). SQLite stays the single source of truth (ADR
   0018), and an event can never deliver stale data.
2. **Fire it where the data becomes true.** That means the end of the job or
   action that wrote the rows, including on a recorded error (the page shows that
   too). It is not fired when a run merely ends. Every per-server sync job extends
   `ServerSyncJob`, whose `AnnounceServerDataSynced` job middleware fires
   `ServerDataSynced` with the job's `ServerDataScope` once each attempt ends,
   early returns included. A run's own lifecycle is announced by `RunStarted`
   (from `CliRunner::start()`) and `RunFinished` (from `RecordRunOutput`, after
   the final status is saved).
3. **Events expose `broadcastOn()` but do not implement `ShouldBroadcast(Now)`.**
   `EventWatcher` only needs the method. Implementing the contract would also send
   every event through Laravel's broadcaster, which is the `log` driver here. Event
   classes live in `app/Events/`.
4. **One JS bridge.** `resources/js/lib/native-events.ts` registers each event name
   with `window.Native.on()` once, since NativePHP has no way to unsubscribe. It
   re-dispatches each event as a window `CustomEvent`. Pages subscribe with
   `onNativeEvent(name, callback)`, which returns an unsubscribe function, from a
   `useEffect`. Event names live in `NativeEvents`. Most pages use the
   `useServerDataReload(server, { scope: props })` and `useRunReload(props, match?)`
   hooks instead of subscribing by hand.
5. **Polling becomes the fallback, not the mechanism.** Existing `usePoll()` loops
   stay for a plain browser in development (no `window.Native`) and as a backstop.
   New freshness work starts from an event.

## Consequences

- A page updates the moment its data does. There is no race with a run's end and
  no fixed polling interval to tune.
- Each new kind of data change needs a small event class and one subscription.
  That is cheap enough to add per feature.
- Events fired outside the NativePHP runtime (tests, a plain `php artisan` call)
  are dispatched normally and simply never reach a window. Tests assert them with
  `Event::fake()`.
- Payloads are public properties serialized to JSON, so they must stay small and
  non-sensitive: identifiers, not secrets or rows.
