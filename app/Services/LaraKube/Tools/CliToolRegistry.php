<?php

namespace App\Services\LaraKube\Tools;

use App\Contracts\CliToolContract;
use App\Services\LaraKube\ToolLocator;

class CliToolRegistry
{
    /** @var array<string, CliToolContract> */
    private array $tools = [];

    public function __construct()
    {
        $definitions = [
            new LaraKubeCliTool,
            new LaraKubeWslCliTool,
            new KubectlTool,
            new K9sTool,
            new OpenTofuTool,
            new SshTool,
            new AwsCliTool,
            new GcloudCliTool,
            new GhCliTool,
            new TeaCliTool,
            new GitTool,
            new DockerTool,
            new PodmanTool,
            new DnsmasqTool,
        ];

        foreach ($definitions as $tool) {
            $this->tools[$tool->slug()] = $tool;
        }
    }

    /**
     * @return array<string, CliToolContract>
     */
    public function all(): array
    {
        return $this->tools;
    }

    public function find(string $slug): ?CliToolContract
    {
        return $this->tools[$slug] ?? null;
    }

    /**
     * @param  ?list<string>  $intendedProviders
     * @return list<array{slug: string, label: string, purpose: string, required: bool, installable: bool, localOnly: bool, environment: ?string}>
     */
    public function catalog(ToolLocator $locator, ?array $intendedProviders = null): array
    {
        $catalog = [];

        foreach ($this->tools as $tool) {
            if (! $tool->isSupported($locator)) {
                continue;
            }

            $provider = $tool->provider();
            if (! empty($intendedProviders) && $provider !== null && ! in_array($provider, $intendedProviders, true)) {
                continue;
            }

            $catalog[] = $tool->toCatalogEntry($locator);
        }

        return $catalog;
    }
}
