<?php

namespace App\Services\LaraKube;

class GlobalSettings
{
    public const ALLOWED_TLDS = ['kube', 'localhost', 'test', 'local', 'internal'];

    /** What this computer is for: `tools` installs Cluster Tools on servers, `apps` also builds and runs apps locally. */
    public const USAGES = ['tools', 'apps'];

    public const AI_PROVIDERS = ['anthropic' => 'Anthropic (Claude)', 'openai' => 'OpenAI', 'gemini' => 'Google Gemini'];

    public const CLOUD_PROVIDERS = ['do' => 'DigitalOcean', 'hetzner' => 'Hetzner Cloud', 'gcp' => 'Google Cloud', 'aws' => 'Amazon Web Services'];

    public function __construct(private ToolLocator $locator) {}

    /**
     * @return array{
     *     localTld: string,
     *     email: ?string,
     *     aiProvider: string,
     *     defaultCloudProvider: string,
     *     hasDoToken: bool,
     *     hasHetznerToken: bool,
     *     shareToken: ?string,
     *     hideProjects: bool,
     *     cliChannel: string,
     *     usage: ?string,
     *     detectedAgents: array<string, array{name: string, installed: bool, bridged: bool}>
     * }
     */
    public function get(): array
    {
        $config = $this->readConfig();
        $home = ToolLocator::home();
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
            'localTld' => (string) ($config['localTld'] ?? 'kube'),
            'email' => is_string($config['email'] ?? null) ? $config['email'] : null,
            'aiProvider' => (string) ($config['aiProvider'] ?? 'anthropic'),
            'defaultCloudProvider' => (string) ($config['defaultCloudProvider'] ?? 'do'),
            'hasDoToken' => ! empty($config['doToken']),
            'hasHetznerToken' => ! empty($config['hetznerToken']),
            'shareToken' => is_string($config['shareToken'] ?? null) ? $config['shareToken'] : null,
            'hideProjects' => (bool) ($config['hideProjects'] ?? false),
            'cliChannel' => (string) ($config['cliChannel'] ?? 'canary'),
            'usage' => in_array($config['usage'] ?? null, self::USAGES, true) ? $config['usage'] : null,
            'detectedAgents' => $agents,
        ];
    }

    public function hideProjects(): bool
    {
        $config = $this->readConfig();

        return (bool) ($config['hideProjects'] ?? false);
    }

    public function getLocalTld(): string
    {
        $config = $this->readConfig();

        return (string) ($config['localTld'] ?? 'kube');
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(array $data): void
    {
        $config = $this->readConfig();

        if (isset($data['localTld']) && in_array($data['localTld'], self::ALLOWED_TLDS, true)) {
            $config['localTld'] = $data['localTld'];
        }

        if (array_key_exists('email', $data)) {
            $config['email'] = ! empty($data['email']) ? (string) $data['email'] : null;
        }

        if (isset($data['aiProvider']) && array_key_exists($data['aiProvider'], self::AI_PROVIDERS)) {
            $config['aiProvider'] = $data['aiProvider'];
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

        if (! empty($data['doToken'])) {
            $config['doToken'] = (string) $data['doToken'];
        }

        if (! empty($data['hetznerToken'])) {
            $config['hetznerToken'] = (string) $data['hetznerToken'];
        }

        if (array_key_exists('shareToken', $data)) {
            $config['shareToken'] = ! empty($data['shareToken']) ? (string) $data['shareToken'] : null;
        }

        if (array_key_exists('hideProjects', $data)) {
            $config['hideProjects'] = (bool) $data['hideProjects'];
        }

        if (! empty($data['aiKey']) && is_string($data['aiKey'])) {
            $provider = $config['aiProvider'] ?? 'anthropic';
            $config['aiKeys'][$provider] = $data['aiKey'];
        }

        $this->writeConfig($config);
    }

    public function bridge(string $agent): bool
    {
        $home = ToolLocator::home();
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
        $path = $this->configPath();
        if (! is_file($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function writeConfig(array $config): void
    {
        $path = $this->configPath();
        $dir = dirname($path);

        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    private function configPath(): string
    {
        $home = ToolLocator::home();

        return $home !== '' ? "{$home}/.larakube/config.json" : storage_path('larakube/config.json');
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
