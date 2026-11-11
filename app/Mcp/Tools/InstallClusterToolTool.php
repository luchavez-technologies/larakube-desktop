<?php

namespace App\Mcp\Tools;

use App\Enums\RunKind;
use App\Models\CatalogTool;
use App\Models\ClusterTool;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\LaraKube\CliRunner;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\FrameworkForm;
use App\Services\LaraKube\PlexCompatibilityResolver;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Completions\CompletionResponse;
use Laravel\Mcp\Server\Contracts\Completable;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsIdempotent;

#[Name('install-cluster-tool')]
#[Title('Install Cluster Tool')]
#[Description('Installs a Cluster Tool on a server using CLI-described initFields options (e.g. SQLite --no-plex vs Plex Commons reuse). Additive — safe to call without confirmation.')]
#[IsIdempotent]
class InstallClusterToolTool extends Tool implements Completable
{
    use PollsRun, ResolvesServerContext;

    private const int TIMEOUT_SECONDS = 120;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        if ($argument === 'tool') {
            $catalog = app(ToolCatalog::class);
            $catalog->ensureCatalogSeeded();

            $fromCatalog = CatalogTool::query()->search($value)->limit(20)->pluck('slug')->all();
            $fromInstalled = ClusterTool::query()->distinct()->pluck('tool')->filter()->values()->all();
            $candidates = array_values(array_unique([...$fromCatalog, ...$fromInstalled]));

            if ($candidates === []) {
                $registered = $catalog->registered('') ?? [];
                $candidates = array_values(array_filter(array_column($registered, 'tool'), 'is_string'));
            }

            return CompletionResponse::match(array_slice($candidates, 0, 20));
        }

        if ($argument === 'domain') {
            $arguments = is_array($context['arguments'] ?? null) ? $context['arguments'] : [];
            $serverName = (string) ($arguments['server'] ?? '');
            $toolName = (string) ($arguments['tool'] ?? 'app');

            $server = Server::where('name', $serverName)->orWhere('ip', $serverName)->first();
            $domains = $server !== null
                ? $server->domains->pluck('domain')->all()
                : ServerDomain::distinct()->pluck('domain')->all();

            $suggestions = [];
            foreach ($domains as $baseDomain) {
                if (is_string($baseDomain) && $baseDomain !== '') {
                    $suggestions[] = "{$toolName}.{$baseDomain}";
                }
            }

            if ($suggestions !== []) {
                return CompletionResponse::match(array_values(array_unique($suggestions)));
            }
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $server = (string) $request->get('server');
        $contextParam = trim((string) $request->get('context'));
        $tool = trim((string) $request->get('tool'));
        $domain = trim((string) $request->get('domain'));
        $adminEmail = $request->get('admin_email');
        $wireSso = (bool) $request->get('wire_sso', false);
        $wireMail = (bool) $request->get('wire_mail', false);
        $rawOptions = $request->get('options');
        $options = is_array($rawOptions) ? $rawOptions : [];

        [$serverModel, $context] = $this->resolveServerAndContext($server, $contextParam);

        if ($domain === '') {
            $connectedDomains = $serverModel instanceof Server ? $serverModel->domains->pluck('domain')->all() : [];

            if ($connectedDomains === [] && $context !== '') {
                $liveDomains = app(ClusterStatus::class)->domains($context);
                $connectedDomains = array_column($liveDomains, 'domain');
            }

            if (count($connectedDomains) === 1) {
                $domain = "{$tool}.{$connectedDomains[0]}";
            } elseif (count($connectedDomains) > 1) {
                $candidates = implode(', ', array_map(fn (string $d): string => "{$tool}.{$d}", $connectedDomains));

                return Response::error("Please specify a 'domain' parameter. Server '{$server}' has multiple connected domains: {$candidates}");
            } else {
                return Response::error("Please specify a 'domain' parameter (e.g. {$tool}.yourdomain.com). No connected base domains were found on server '{$server}'.");
            }
        }

        if ($context === '') {
            return Response::error("Could not resolve Kubernetes context for server '{$server}'. Please provide an explicit 'context' parameter.");
        }

        $catalog = app(ToolCatalog::class);
        $resolver = app(PlexCompatibilityResolver::class);
        $definition = $catalog->findDefinition($tool, $context);
        $optionFlags = [];
        $storageDecision = null;

        if ($definition !== null) {
            $optionFields = array_values(array_filter(
                is_array($definition['initFields'] ?? null) ? $definition['initFields'] : [],
                fn (mixed $field): bool => is_array($field) && ! in_array($field['role'] ?? 'option', ['host', 'account'], true),
            ));

            $storageAnalysis = $resolver->analyzeTool($definition, $context);
            $hasNoPlexField = collect($optionFields)->contains(fn (array $f): bool => ($f['key'] ?? null) === 'noPlex');

            if ($hasNoPlexField && ! array_key_exists('noPlex', $options) && array_key_exists('noPlex', $storageAnalysis['recommendedOptions'])) {
                $options['noPlex'] = $storageAnalysis['recommendedOptions']['noPlex'];
            }

            if ($optionFields !== []) {
                $resolved = app(FrameworkForm::class)->resolve($optionFields, $options);
                if ($resolved['errors'] !== []) {
                    return Response::error('Invalid options: '.implode('; ', $resolved['errors']));
                }
                $optionFlags = $resolved['flags'];
            }

            $storageDecision = [
                'mode' => ($options['noPlex'] ?? null) === true ? 'standalone' : $storageAnalysis['recommendedMode'],
                'database' => ($options['noPlex'] ?? null) === true
                    ? ($storageAnalysis['supportsSqlite'] ? 'sqlite' : 'bundled')
                    : $storageAnalysis['recommendedDatabase'],
                'reason' => ($options['noPlex'] ?? null) === true && $storageAnalysis['recommendedMode'] === 'plex'
                    ? 'Explicitly bypassed Plex Commons via options.noPlex = true.'
                    : $storageAnalysis['reason'],
            ];
        } elseif (($options['noPlex'] ?? null) === true) {
            $optionFlags[] = '--no-plex';
        }

        $run = app(CliRunner::class)->start(
            label: "Install {$tool} on {$server}",
            arguments: [
                'tool:add',
                "--tool={$tool}",
                "--context={$context}",
                "--domain={$domain}",
                ...($adminEmail ? ["--admin-email={$adminEmail}"] : []),
                $wireSso ? '--wire-sso' : '--no-wire-sso',
                $wireMail ? '--wire-mail' : '--no-wire-mail',
                ...$optionFlags,
                '--force',
            ],
            kind: RunKind::InstallClusterTool,
            subject: $tool,
            meta: array_filter([
                'tool' => $tool,
                'host' => $domain,
                'storage_mode' => $storageDecision['mode'] ?? null,
                'storage_database' => $storageDecision['database'] ?? null,
                'storage_reason' => $storageDecision['reason'] ?? null,
            ], fn (mixed $v): bool => $v !== null),
            serverName: $server,
            context: $context,
            tool: $tool,
        );

        return $this->pollRun($run, self::TIMEOUT_SECONDS);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'server' => $schema->string()->description('The server/stack name, from list-servers'),
            'context' => $schema->string()->description("The server's kube context (optional; auto-resolved from server name if omitted)")->nullable(),
            'tool' => $schema->string()->description('The tool slug to install (from list-cluster-tools / show-cluster-tool)'),
            'domain' => $schema->string()->description('The domain/host to install the tool under (e.g. n8n.example.com). Optional; auto-derived as <tool>.<domain> if the server has a connected domain.')->nullable(),
            'admin_email' => $schema->string()->description('An admin email, for tools that need one')->nullable(),
            'wire_sso' => $schema->boolean()->description('Whether to wire SSO (Zitadel) for this tool if available (default: false)')->nullable(),
            'wire_mail' => $schema->boolean()->description('Whether to wire mail (Stalwart) for this tool if available (default: false)')->nullable(),
            'options' => $schema->object()->description('Tool-specific initFields answers from show-cluster-tool (e.g. {"noPlex": true} for n8n SQLite mode, {"db": "mysql"} for WordPress, {"vpnOnly": true}, {"proxied": false}). When noPlex is omitted on dual-mode tools, reuses active compatible Plex Commons or defaults to standalone SQLite.')->nullable(),
        ];
    }
}
