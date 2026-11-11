<?php

namespace App\Mcp\Tools;

use App\Models\CatalogTool;
use App\Models\ClusterTool;
use App\Models\Server;
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
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('show-cluster-tool')]
#[Title('Show Cluster Tool')]
#[Description('Returns full schema details for a single Cluster Tool: initFields options, database/Plex compatibility matrix, smart storage recommendation for the target server, and live instance status.')]
#[IsReadOnly]
class ShowClusterToolTool extends Tool implements Completable
{
    use ResolvesServerContext;

    public function complete(string $argument, string $value, array $context): CompletionResponse
    {
        if ($argument === 'server') {
            return CompletionResponse::match(Server::pluck('name')->all());
        }

        if ($argument === 'tool') {
            $fromCatalog = CatalogTool::query()->search($value)->limit(20)->pluck('slug')->all();
            $fromInstalled = ClusterTool::query()->distinct()->pluck('tool')->filter()->values()->all();

            return CompletionResponse::match(array_slice(array_values(array_unique([...$fromCatalog, ...$fromInstalled])), 0, 20));
        }

        return CompletionResponse::empty();
    }

    public function handle(Request $request): Response
    {
        $toolSlug = trim((string) $request->get('tool'));
        if ($toolSlug === '') {
            return Response::error("A 'tool' slug is required.");
        }

        $serverName = (string) $request->get('server', '');
        $contextParam = (string) $request->get('context', '');
        [, $resolvedContext] = $this->resolveServerAndContext($serverName, $contextParam);
        if ($resolvedContext === '' && $contextParam !== '') {
            $resolvedContext = trim($contextParam);
        }

        $catalog = app(ToolCatalog::class);
        $catalog->ensureCatalogSeeded();

        $definition = $catalog->findDefinition($toolSlug, $resolvedContext);
        if ($definition === null) {
            return Response::error("Cluster tool '{$toolSlug}' was not found in the catalog.");
        }

        $resolver = app(PlexCompatibilityResolver::class);
        $recommendation = $resolvedContext !== ''
            ? $resolver->analyzeTool($definition, $resolvedContext)
            : null;

        $payload = [
            ...$definition,
            'supportsNoPlex' => $resolver->supportsNoPlex($definition),
            'storageRecommendation' => $recommendation,
        ];

        return Response::text(json_encode($payload, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'tool' => $schema->string()->description('The tool slug (from list-cluster-tools, e.g. n8n, wordpress, pocketbase)'),
            'server' => $schema->string()->description('Optional server/stack name from list-servers to evaluate live Plex Commons compatibility')->nullable(),
            'context' => $schema->string()->description('Optional kube context override')->nullable(),
        ];
    }
}
