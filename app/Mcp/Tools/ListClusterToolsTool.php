<?php

namespace App\Mcp\Tools;

use App\Enums\ToolCategory;
use App\Enums\ToolSource;
use App\Models\CatalogTool;
use App\Models\ClusterTool;
use App\Services\LaraKube\PlexCompatibilityResolver;
use App\Services\LaraKube\ToolCatalog;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('list-cluster-tools')]
#[Title('List Cluster Tools')]
#[Description('Searches and paginates available Official & Community Cluster Tools and their install status on a server. Returns compact summaries; call show-cluster-tool for full initFields and compatibility details.')]
#[IsReadOnly]
class ListClusterToolsTool extends Tool
{
    use ResolvesServerContext;

    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 30;

    public function handle(Request $request): Response
    {
        $serverName = (string) $request->get('server', '');
        $contextParam = (string) $request->get('context', '');
        [, $resolvedContext] = $this->resolveServerAndContext($serverName, $contextParam);

        if ($resolvedContext === '' && $contextParam !== '') {
            $resolvedContext = trim($contextParam);
        }

        $page = max(1, (int) ($request->get('page') ?? 1));
        $perPage = min(self::MAX_PER_PAGE, max(1, (int) ($request->get('per_page') ?? self::DEFAULT_PER_PAGE)));

        $filters = [
            'q' => $request->get('query'),
            'category' => $request->get('category'),
            'source' => $request->get('source'),
            'installed_only' => (bool) $request->get('installed_only', false),
        ];

        $catalog = app(ToolCatalog::class);
        $resolver = app(PlexCompatibilityResolver::class);

        $activePlexDatabases = $resolvedContext !== ''
            ? $resolver->activeDatabasesForContext($resolvedContext)
            : [];

        // Preserve empty result when caller specifies an unknown context and no global CatalogTool seed exists
        $hasServerRows = $resolvedContext !== '' && ClusterTool::query()->whereHas('server', fn ($q) => $q->where('context', $resolvedContext))->exists();
        $result = ($resolvedContext !== '' || $hasServerRows || CatalogTool::exists())
            ? $catalog->paginatedCatalog($resolvedContext, $filters, $page, $perPage)
            : ['data' => [], 'meta' => ['current_page' => $page, 'last_page' => 1, 'per_page' => $perPage, 'total' => 0, 'has_more' => false]];

        $compactRows = array_map(function (array $row) use ($resolver, $resolvedContext): array {
            $analysis = $resolvedContext !== '' ? $resolver->analyzeTool($row, $resolvedContext) : null;

            return array_filter([
                'tool' => $row['tool'] ?? null,
                'name' => $row['name'] ?? $row['label'] ?? $row['tool'] ?? null,
                'tagline' => $row['tagline'] ?? null,
                'source' => $row['source'] ?? ToolSource::OFFICIAL->value,
                'categories' => $row['categories'] ?? [],
                'installed' => (bool) ($row['installed'] ?? false),
                'host' => $row['host'] ?? null,
                'url' => $row['url'] ?? null,
                'multi_instance' => (bool) ($row['multiInstance'] ?? true),
                'supports_no_plex' => $resolver->supportsNoPlex($row),
                'plex_databases' => $resolver->compatiblePlexDatabases($row),
                'recommended_storage' => $analysis !== null ? [
                    'mode' => $analysis['recommendedMode'],
                    'database' => $analysis['recommendedDatabase'],
                    'reason' => $analysis['reason'],
                ] : null,
            ], fn (mixed $v): bool => $v !== null);
        }, $result['data']);

        $payload = [
            'data' => $compactRows,
            'meta' => $result['meta'],
            'active_plex_databases' => $activePlexDatabases,
        ];

        return Response::text(json_encode($payload, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'context' => $schema->string()->description("The server's kube context, from show-server's output (optional if server is given)")->nullable(),
            'server' => $schema->string()->description('The server/stack name from list-servers (optional alternative to context)')->nullable(),
            'query' => $schema->string()->description('Search keyword matching app slug, name, or tagline')->nullable(),
            'category' => $schema->string()->enum(ToolCategory::values())->description('Filter by functional category')->nullable(),
            'source' => $schema->string()->enum(ToolSource::values())->description('Filter by catalog source (official or community)')->nullable(),
            'installed_only' => $schema->boolean()->description('When true, return only tools currently installed on the server')->nullable(),
            'page' => $schema->integer()->description('Page number for paginated results (default: 1)')->nullable(),
            'per_page' => $schema->integer()->description('Items per page (default: 15, max: 30)')->nullable(),
        ];
    }
}
