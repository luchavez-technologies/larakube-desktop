<?php

namespace App\Services\LaraKube;

use App\Services\EditorLauncher;
use App\Services\Runtime\WslDistro;
use Native\Desktop\Enums\SystemThemesEnum;
use Native\Desktop\Facades\Settings;
use Native\Desktop\Facades\System;

class GlobalSettings
{
    public const ALLOWED_TLDS = ['test', 'kube', 'localhost', 'local', 'internal'];

    /** What this computer is for: `tools` installs Cluster Tools on servers, `apps` also builds and runs apps locally. */
    public const USAGES = ['tools', 'apps'];

    public const CLOUD_PROVIDERS = ['gcp' => 'Google Cloud', 'aws' => 'Amazon Web Services', 'do' => 'DigitalOcean', 'hetzner' => 'Hetzner Cloud'];

    public const WSL_SHUTDOWN_MODES = ['terminate', 'shutdown', 'disabled'];

    public const THEMES = ['system', 'light', 'dark'];

    public const DEFAULT_EDITOR = 'vscode';

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{
     *     theme: string,
     *     localTld: string,
     *     email: ?string,
     *     defaultCloudProvider: string,
     *     shareToken: ?string,
     *     hideProjects: bool,
     *     experimental: bool,
     *     demoMode: bool,
     *     demoHiddenServers: list<string>,
     *     cliChannel: string,
     *     usage: ?string,
     *     intendedProviders: list<string>,
     *     onboardingCompletedAt: ?string,
     *     wslShutdownMode: string,
     *     defaultEditor: string,
     *     detectedAgents: array<string, array{name: string, installed: bool, bridged: bool}>
     * }
     */
    public function get(): array
    {
        $config = $this->readConfig();
        $home = ToolLocator::hostProfile($this->locator->isWindows());
        $binary = $this->locator->find('larakube') ?? 'larakube';

        $agents = [
            'antigravity' => [
                'name' => 'Antigravity CLI (agy)',
                'installed' => is_dir("{$home}/.gemini") || $this->locator->find('agy') !== null,
                'bridged' => $this->isAgentBridged("{$home}/.gemini/antigravity.json"),
            ],
            'claude' => [
                'name' => 'Claude Desktop / Claude Code',
                'installed' => is_dir("{$home}/Library/Application Support/Claude") || is_dir("{$home}/.claude") || $this->locator->find('claude') !== null,
                'bridged' => $this->isAgentBridged("{$home}/Library/Application Support/Claude/claude_desktop_config.json") || $this->isAgentBridged("{$home}/.claude/config.json"),
            ],
            'opencode' => [
                'name' => 'OpenCode',
                'installed' => is_dir("{$home}/.config/opencode") || $this->locator->find('opencode') !== null,
                'bridged' => $this->isAgentBridged("{$home}/.config/opencode/mcp.json"),
            ],
        ];

        return [
            'theme' => $this->getTheme(),
            'localTld' => (string) ($config['localTld'] ?? 'test'),
            'email' => is_string($config['email'] ?? null) ? $config['email'] : null,
            'defaultCloudProvider' => (string) ($config['defaultCloudProvider'] ?? 'do'),
            'shareToken' => is_string($config['shareToken'] ?? null) ? $config['shareToken'] : null,
            'hideProjects' => (bool) ($config['hideProjects'] ?? false),
            'experimental' => (bool) ($config['experimental'] ?? false),
            'demoMode' => (bool) ($config['demoMode'] ?? false),
            'demoHiddenServers' => $this->demoHiddenServers(),
            'cliChannel' => (string) ($config['cliChannel'] ?? 'canary'),
            'usage' => in_array($config['usage'] ?? null, self::USAGES, true) ? $config['usage'] : null,
            'intendedProviders' => $this->intendedProviders(),
            'onboardingCompletedAt' => is_string($config['onboardingCompletedAt'] ?? null) ? $config['onboardingCompletedAt'] : null,
            'wslShutdownMode' => $this->wslShutdownMode(),
            'defaultEditor' => $this->getDefaultEditor(),
            'detectedAgents' => $agents,
        ];
    }

    public function getTheme(): string
    {
        try {
            $val = Settings::get('theme');
            if (is_string($val) && in_array($val, self::THEMES, true)) {
                return $val;
            }
        } catch (\Throwable) {
        }

        $config = $this->readConfig();

        return (string) ($config['theme'] ?? 'system');
    }

    public function setTheme(string $theme): void
    {
        if (! in_array($theme, self::THEMES, true)) {
            $theme = 'system';
        }

        $config = $this->readConfig();
        $config['theme'] = $theme;
        $this->writeConfig($config);

        try {
            Settings::set('theme', $theme);
        } catch (\Throwable) {
        }

        $themeEnum = match ($theme) {
            'light' => SystemThemesEnum::LIGHT,
            'dark' => SystemThemesEnum::DARK,
            default => SystemThemesEnum::SYSTEM,
        };

        try {
            System::theme($themeEnum);
        } catch (\Throwable) {
        }
    }

    public function hideProjects(): bool
    {
        $config = $this->readConfig();

        return (bool) ($config['hideProjects'] ?? false);
    }

    /** Whether the person turned on features that are still being tried out. */
    public function experimental(): bool
    {
        return (bool) ($this->readConfig()['experimental'] ?? false);
    }

    /**
     * Whether Demo Mode is on — masks IPs/account identifiers/credentials
     * across the app and drops demoHiddenServers() from the Servers list,
     * both purely at render time. Reversible: turning this off needs no
     * cleanup, since nothing underneath (CLI, cluster, the servers
     * themselves) is ever touched by either effect.
     */
    public function demoMode(): bool
    {
        return (bool) ($this->readConfig()['demoMode'] ?? false);
    }

    /**
     * Server names to drop from the Servers list (and 404 directly) while
     * demoMode() is on — set ahead of time, independent of whether Demo Mode
     * is currently on, so it's ready the moment it's switched on.
     *
     * @return list<string>
     */
    public function demoHiddenServers(): array
    {
        $servers = $this->readConfig()['demoHiddenServers'] ?? null;

        return is_array($servers) ? array_values(array_filter($servers, 'is_string')) : [];
    }

    /**
     * Cloud providers the person said they plan to deploy to, picked during
     * onboarding. Empty means "not decided yet" — treated as "show everything"
     * everywhere this is read, never as "none".
     *
     * @return list<string>
     */
    public function intendedProviders(): array
    {
        $config = $this->readConfig();
        $providers = is_array($config['intendedProviders'] ?? null) ? $config['intendedProviders'] : [];

        return array_values(array_intersect($providers, array_keys(self::CLOUD_PROVIDERS)));
    }

    public function hasCompletedOnboarding(): bool
    {
        return is_string($this->readConfig()['onboardingCompletedAt'] ?? null);
    }

    public function completeOnboarding(): void
    {
        $config = $this->readConfig();
        $config['onboardingCompletedAt'] = now()->toIso8601String();
        $this->writeConfig($config);
    }

    /** Lets the person redo the wizard from Settings. */
    public function resetOnboarding(): void
    {
        $config = $this->readConfig();
        $config['onboardingCompletedAt'] = null;
        $this->writeConfig($config);
    }

    /** The Desktop version last seen at boot, so NativeAppServiceProvider can tell "just updated" from "same launch as before". */
    public function lastSeenDesktopVersion(): ?string
    {
        $version = $this->readConfig()['desktopVersion'] ?? null;

        return is_string($version) ? $version : null;
    }

    public function rememberDesktopVersion(string $version): void
    {
        $config = $this->readConfig();
        $config['desktopVersion'] = $version;
        $this->writeConfig($config);
    }

    public function wslShutdownMode(): string
    {
        $config = $this->readConfig();
        $mode = (string) ($config['wslShutdownMode'] ?? 'terminate');

        return in_array($mode, self::WSL_SHUTDOWN_MODES, true) ? $mode : 'terminate';
    }

    public function getLocalTld(): string
    {
        $config = $this->readConfig();

        return (string) ($config['localTld'] ?? 'test');
    }

    public function getDefaultEditor(): string
    {
        $config = $this->readConfig();
        $editor = $config['defaultEditor'] ?? null;

        return is_string($editor) && array_key_exists($editor, EditorLauncher::EDITORS)
            ? $editor
            : self::DEFAULT_EDITOR;
    }

    public function setDefaultEditor(string $editor): void
    {
        if (array_key_exists($editor, EditorLauncher::EDITORS)) {
            $config = $this->readConfig();
            $config['defaultEditor'] = $editor;
            $this->writeConfig($config);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(array $data): void
    {
        $config = $this->readConfig();

        if (isset($data['theme']) && in_array($data['theme'], self::THEMES, true)) {
            $this->setTheme((string) $data['theme']);
        }

        if (isset($data['localTld']) && in_array($data['localTld'], self::ALLOWED_TLDS, true)) {
            $config['localTld'] = $data['localTld'];
        }

        if (array_key_exists('email', $data)) {
            $config['email'] = ! empty($data['email']) ? (string) $data['email'] : null;
        }

        if (isset($data['defaultCloudProvider']) && array_key_exists($data['defaultCloudProvider'], self::CLOUD_PROVIDERS)) {
            $config['defaultCloudProvider'] = $data['defaultCloudProvider'];
        }

        if (isset($data['cliChannel']) && in_array($data['cliChannel'], ['canary', 'stable'], true)) {
            $config['cliChannel'] = $data['cliChannel'];
        }

        if (isset($data['usage']) && in_array($data['usage'], self::USAGES, true)) {
            $config['usage'] = $data['usage'];
        }

        if (array_key_exists('intendedProviders', $data) && is_array($data['intendedProviders'])) {
            $config['intendedProviders'] = array_values(array_intersect($data['intendedProviders'], array_keys(self::CLOUD_PROVIDERS)));
        }

        if (isset($data['wslShutdownMode']) && in_array($data['wslShutdownMode'], self::WSL_SHUTDOWN_MODES, true)) {
            $config['wslShutdownMode'] = $data['wslShutdownMode'];
        }

        if (isset($data['defaultEditor']) && array_key_exists((string) $data['defaultEditor'], EditorLauncher::EDITORS)) {
            $config['defaultEditor'] = (string) $data['defaultEditor'];
        }

        if (array_key_exists('shareToken', $data)) {
            $config['shareToken'] = ! empty($data['shareToken']) ? (string) $data['shareToken'] : null;
        }

        if (array_key_exists('hideProjects', $data)) {
            $config['hideProjects'] = (bool) $data['hideProjects'];
        }

        if (array_key_exists('experimental', $data)) {
            $config['experimental'] = (bool) $data['experimental'];
        }

        if (array_key_exists('demoMode', $data)) {
            $config['demoMode'] = (bool) $data['demoMode'];
        }

        if (array_key_exists('demoHiddenServers', $data) && is_array($data['demoHiddenServers'])) {
            $config['demoHiddenServers'] = array_values(array_filter($data['demoHiddenServers'], 'is_string'));
        }

        $this->writeConfig($config);
    }

    public function bridge(string $agent): bool
    {
        $home = ToolLocator::hostProfile($this->locator->isWindows());
        $binary = $this->locator->find('larakube') ?? 'larakube';

        $mcpConfig = [
            'larakube-cli' => [
                'command' => $binary,
                'args' => ['mcp:start', 'mcp'],
            ],
        ];

        return match ($agent) {
            'antigravity' => $this->writeMcpFile("{$home}/.gemini/antigravity.json", $mcpConfig),
            'claude' => $this->writeMcpFile("{$home}/Library/Application Support/Claude/claude_desktop_config.json", $mcpConfig) ||
                        $this->writeMcpFile("{$home}/.claude/config.json", $mcpConfig),
            'opencode' => $this->writeMcpFile("{$home}/.config/opencode/mcp.json", $mcpConfig),
            default => false,
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function readConfig(): array
    {
        $path = $this->hostConfigPath();
        if (@is_file($path)) {
            $decoded = json_decode((string) @file_get_contents($path), true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        $wslPath = $this->wslConfigPath();
        if ($wslPath !== null) {
            try {
                if (@is_file($wslPath)) {
                    $decoded = json_decode((string) @file_get_contents($wslPath), true);
                    if (is_array($decoded)) {
                        return $decoded;
                    }
                }
            } catch (\Throwable) {
            }
        }

        return [];
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function writeConfig(array $config): void
    {
        $path = $this->hostConfigPath();
        $dir = dirname($path);

        try {
            if (! @is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }

            @file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } catch (\Throwable) {
        }

        $wslPath = $this->wslConfigPath();
        if ($wslPath !== null) {
            try {
                $wslDir = dirname($wslPath);
                if (! @is_dir($wslDir)) {
                    @mkdir($wslDir, 0755, true);
                }

                @file_put_contents($wslPath, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            } catch (\Throwable) {
            }
        }
    }

    private function hostConfigPath(): string
    {
        $profile = ToolLocator::hostProfile($this->locator->isWindows());

        return $profile !== ''
            ? rtrim(str_replace('\\', '/', $profile), '/').'/.larakube/config.json'
            : storage_path('larakube/config.json');
    }

    private function wslConfigPath(): ?string
    {
        if (PHP_OS_FAMILY !== 'Windows' || ! $this->locator->isWindows()) {
            return null;
        }

        return WslDistro::toWindows(WslDistro::HOME.'/.larakube/config.json');
    }

    private function isAgentBridged(string $configPath): bool
    {
        if (! is_file($configPath)) {
            return false;
        }

        $content = (string) file_get_contents($configPath);

        return str_contains($content, 'larakube-cli');
    }

    /**
     * @param  array<string, array<string, mixed>>  $servers
     */
    private function writeMcpFile(string $path, array $servers): bool
    {
        $dir = dirname($path);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $existing = [];
        if (is_file($path)) {
            $decoded = json_decode((string) file_get_contents($path), true);
            if (is_array($decoded)) {
                $existing = $decoded;
            }
        }

        $existing['mcpServers'] = array_merge($existing['mcpServers'] ?? [], $servers);

        return file_put_contents($path, json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) !== false;
    }
}
