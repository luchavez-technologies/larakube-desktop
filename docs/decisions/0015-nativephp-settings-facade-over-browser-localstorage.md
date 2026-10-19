# 0015: NativePHP Settings Facade Over Browser LocalStorage

## Status

Accepted

## Context

When building Electron/Inertia applications, web developers habitually reach for browser `localStorage` to persist lightweight UI state — such as the active tab in a popover, the last selected cluster, drawer open/collapsed states, or display filters.

In LaraKube Desktop (powered by NativePHP on Electron), relying on browser `localStorage` introduces severe architectural problems:

1. **Window Isolation & Partitioning**:
   LaraKube Desktop uses multiple distinct Electron browser windows and webContents — notably the primary application window (`main`) and the lightweight system menu bar popover (`tray`). In Electron, different windows or frames frequently execute in separate storage partitions. `localStorage` updates made in the tray window do not reliably or reactively sync with the main window, and vice versa.

2. **Inertia Hydration Mismatch & Layout Shift (FOUC)**:
   Browser `localStorage` is completely inaccessible to the PHP backend during HTTP and Inertia lifecycle requests. When a window renders, PHP must guess a fallback or default value. Once the frontend JavaScript hydrates, it reads `localStorage`, causing visible layout flashes, flickering tabs, and redundant re-renders.

3. **Storage Fragility**:
   Browser `localStorage` is volatile. It can be wiped during webview cache clears, dev tool refreshes, origin changes, or Electron profile resets.

4. **Underutilization of NativePHP Capabilities**:
   NativePHP provides a first-class, dedicated `Native\Desktop\Facades\Settings` service out of the box. It persists key-value settings to a durable `config.json` inside the operating system's standard application data directory (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS, `~/.config` on Linux). It also dispatches `Native\Desktop\Events\Notifications\SettingChanged` across all windows and processes.

## Decision

1. **Ban Browser `localStorage` for Application & UI State**:
   Browser `localStorage` MUST NOT be used for persistent UI preferences, active tabs, selected clusters, or user configurations.

2. **Adopt `Native\Desktop\Facades\Settings` as the Canonical Key-Value Store**:
   All lightweight UI preferences and cross-window settings MUST be stored and retrieved using `Native\Desktop\Facades\Settings`.

3. **Backend-Driven Initial State (Zero FOUC)**:
   Controllers serving Inertia responses (such as `TrayController::payload()`) MUST read user preferences directly from `Settings::get(...)` during the request lifecycle and inject them into the initial page props. The frontend component initializes its state directly from the backend prop, guaranteeing zero layout shift upon opening.

4. **Lightweight API Endpoints for State Updates**:
   When the user toggles a tab or selects a filter in the frontend (e.g. switching between "Projects" and "Clusters" in the menu bar tray), the frontend dispatches an asynchronous background request (`POST /tray/settings` or similar) to persist the setting via `Settings::set(...)`.

5. **Safe Fallback in Unit Tests**:
   Because `Native\Desktop\Facades\Settings` relies on the NativePHP bridge runtime, calls to `Settings` must be safely wrapped in `rescue(...)` or guarded with fallbacks so that automated unit/feature tests run cleanly without requiring an active Electron bridge.

## Consequences

### Positive

- **Instant, Accurate Rendering**: No flashes of unstyled content or tab jumping when opening the menu bar tray or app windows.
- **Cross-Window Consistency**: Settings are shared across the main application window, menu bar popover, and background workers.
- **Durable OS Persistence**: User preferences survive browser cache clears, dev server reloads, and window recreation.
- **Auditability**: Preferences are stored cleanly in the OS application data `config.json` and can be inspected or pre-seeded.

### Negative

- Persisting state changes requires an asynchronous HTTP request rather than a synchronous `localStorage.setItem` call. Since LaraKube Desktop operates with a local internal PHP daemon (sub-millisecond latency), the overhead is negligible.
