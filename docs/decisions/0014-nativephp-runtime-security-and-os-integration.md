# ADR 0014: NativePHP Runtime, Security, and OS Integration

**Status:** Accepted (2026-10-14)

## Context

LaraKube Desktop runs on the **NativePHP v2** desktop framework (Electron runtime + PHP embedded server). As the application matures from a local prototype to a production-ready desktop tool distributing across macOS, Linux, and Windows, several architectural facets must adhere strictly to NativePHP's design patterns:

1. **Configuration Drift**: Attempting to customize application names, icons, or metadata by manually editing files inside `nativephp/electron/` breaks because NativePHP regenerates and syncs that directory during `native:run` and `native:build`.
2. **Security & Secret Leakage**: Desktop apps run directly on end-user machines. Bundling a production application without sanitizing the local environment exposes developer API keys, cloud provider tokens, and internal credentials to binary inspection.
3. **File Paths & Bundled Distros**: Hardcoding environment variables like `$HOME`, `%USERPROFILE%`, or custom folder paths behaves inconsistently across operating systems and fails inside Windows WSL environments. Furthermore, large dependencies (like the custom WSL2 Ubuntu rootfs) require internet downloads unless bundled via NativePHP's resource conventions.
4. **Queue Worker Utilization**: Background synchronization tasks (syncing clusters, domains, tools, and mail status) must not freeze UI threads or spin up unmanaged daemon loops.
5. **Process Execution Ambiguity**: Understanding when to execute synchronous system commands versus when to spawn NativePHP-managed child processes.

## Decision

### 1. Configuration-Driven Desktop Identity

All desktop application metadata, versioning, and lifecycle parameters MUST be defined through standard Laravel and NativePHP configuration files:

- **Application Name**: Configured in `config/app.php` (`APP_NAME="LaraKube Desktop"`). NativePHP automatically propagates this as `NATIVEPHP_APP_NAME` into Electron builder's `productName` and window titles.
- **App Metadata & Deep Links**: Configured in `config/nativephp.php`:
    - `app_id`: `app.larakube.desktop`
    - `version`: SemVer string matching application releases.
    - `author`: `LuchTech` (LuchTech Web Development Services, https://www.luchtech.dev)
    - `copyright`: `Copyright © 2026 LuchTech`
    - `website`: `https://www.larakube.app`
    - `deeplink_scheme`: `larakube` (enabling `larakube://` protocol handlers).
- Never modify generated `nativephp/electron/package.json` manually for application branding.

### 2. Standardized Application Icon Assets

Icons must be placed in `public/` following NativePHP's discovery naming scheme:

- `public/icon.png`: Primary icon (minimum 512×512), automatically applied to Desktop, Dock, and app switchers.
- `public/icon.ico`: Automatically selected for Windows installer and executable packaging.
- `public/icon.icns`: Automatically selected for macOS `.app` bundle packaging.
- `public/IconTemplate.png` and `public/IconTemplate@2x.png`: Menu bar tray icons for standard and Retina displays.

NativePHP's build step automatically copies these files into `nativephp/electron/build/` during compilation.

### 3. Production Security & Secret Sanitization

To ensure security across untrusted environments:

1. **Automated `.env` Redaction (`cleanup_env_keys`)**:
   `config/nativephp.php` MUST include wildcard patterns for all cloud provider and automation tokens:
    ```php
    'cleanup_env_keys' => [
        'AWS_*', 'AZURE_*', 'GITHUB_*', 'DO_SPACES_*',
        'CLOUDFLARE_*', 'HETZNER_*', 'DIGITALOCEAN_*',
        'GCP_*', 'GOOGLE_*', 'TAILSCALE_*', 'OPENBAO_*', 'VAULT_*',
        '*_SECRET', '*_TOKEN', '*_KEY',
        'BIFROST_*', 'NATIVEPHP_*',
    ],
    ```
2. **Encrypted Local Storage**:
   Any credentials, API tokens, or server passwords persisted to local SQLite tables must be encrypted using `Illuminate\Support\Facades\Crypt::encryptString()`.
3. **Process Isolation & Pre-Shared Secret**:
   Internal IPC requests between Electron and the PHP web server are guarded by `NATIVEPHP_API_SECRET` and `PreventRegularBrowserAccess` in production builds.

### 4. Filesystem & Bundled Asset Integration

1. **Native Directory Resolution**:
   Use NativePHP's built-in Storage disks (`user_home`, `desktop`, `documents`, `downloads`, `extras`) rather than guessing host paths:
    - Kubeconfigs and exported tokens resolve via `Storage::disk('downloads')->path('')`.
    - User workspace roots default via `Storage::disk('user_home')->path('')`.
2. **Bundling Heavy Assets via `extras/`**:
   The `extras/` project folder is bundled into the distribution package and exposed read-only via `Storage::disk('extras')`.
    - On Windows, `Wsl::download()` first checks `Storage::disk('extras')->exists('larakube-ubuntu.tar.gz')` before initiating network downloads, enabling instant, offline WSL distro provisioning.

### 5. Asynchronous Queue Workers

Background sync operations MUST utilize NativePHP's managed queue worker architecture:

- Configured in `config/nativephp.php` under `queue_workers`:
    ```php
    'queue_workers' => [
        'default' => [
            'queues' => ['default'],
            'memory_limit' => 256,
            'timeout' => 120,
            'sleep' => 2,
        ],
    ],
    ```
- All fleet synchronization jobs (`SyncServersJob`, `SyncClusterToolsJob`, `SyncServerDomainsJob`, `SyncPlexJob`, `SyncMailJob`) extend `SyncJob` (`ShouldQueue`, `ShouldBeUnique`) on the SQLite `database` driver, preventing overlapping subprocess execution.

### 6. Two-Tier Process Invocation Standard

Subprocesses must be invoked according to operational characteristics:

1. **Synchronous Short Inspections** (`<3s` latency):
    - Use Laravel's `Illuminate\Support\Facades\Process::run()`.
    - Examples: `ToolLocator::find()`, `kubectl cluster-info`, cached `StackCatalog::all()` inspects.
    - Enforce timeouts and memoize or apply sentinel caching (ADR 0012).
2. **Long-Running Orchestration Verbs** (`5s`–`1800s` latency):
    - Use NativePHP's `Native\Desktop\Facades\ChildProcess::start()`.
    - Spawns an Electron-managed child process associated with a unique alias.
    - Real-time output streams asynchronously via `MessageReceived` and `ErrorReceived` events into the `Run` log.
    - Cancel operations cleanly invoke `ChildProcess::stop($alias)`.

## Consequences

- Configuration is 100% declarative and survives clean builds without manual patches to the `nativephp/electron/` scaffold.
- Production builds are protected against credential leaks via automated `.env` key scrubbing.
- Windows WSL provisioning supports offline bundled installations via `extras/` disk detection.
- Queue workers run with ample memory and timeouts to reliably process background cluster syncs.
- Clear separation between fast blocking inspections and asynchronous, event-streamed child processes.
