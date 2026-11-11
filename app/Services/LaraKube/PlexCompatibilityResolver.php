<?php

namespace App\Services\LaraKube;

use App\Enums\DatabaseDriver;
use App\Enums\ToolSource;
use App\Models\CatalogTool;
use App\Models\ClusterTool;
use Illuminate\Support\Collection;

/**
 * Shared compatibility analyzer bridging Cluster Tools (`commonsCapabilities` + `initFields`)
 * and live server Plex Commons state (`PlexCatalog`).
 *
 * Used identically by MCP tools (`list-cluster-tools`, `show-cluster-tool`,
 * `install-cluster-tool`) and Desktop UI controllers (`PlexController`,
 * `ClusterToolController`) so storage mode logic and DB recommendations never drift.
 */
class PlexCompatibilityResolver
{
    public function __construct(
        private PlexCatalog $plexCatalog,
        private ToolCatalog $toolCatalog,
    ) {}

    /**
     * Canonical relational database drivers active in Plex Commons for this context.
     *
     * @return list<string> Values from DatabaseDriver (e.g. ['postgresql', 'mysql'])
     */
    public function activeDatabasesForContext(string $context): array
    {
        if ($context === '') {
            return [];
        }

        $plex = $this->plexCatalog->forContext($context);
        if ($plex === null || empty($plex['initialized'])) {
            return [];
        }

        $active = [];
        $services = $plex['services'];

        foreach ($services as $key => $meta) {
            if (! is_array($meta) || empty($meta['enabled'])) {
                continue;
            }

            $driver = DatabaseDriver::fromPlexService((string) $key);
            if ($driver !== null && $driver !== DatabaseDriver::SQLITE) {
                $active[] = $driver->value;
            }
        }

        return array_values(array_unique($active));
    }

    /**
     * Normalized list of Plex relational database engines this tool supports.
     *
     * @param  array<string, mixed>  $toolRow
     * @return list<string>
     */
    public function compatiblePlexDatabases(array $toolRow): array
    {
        $caps = is_array($toolRow['commonsCapabilities'] ?? null) ? $toolRow['commonsCapabilities'] : [];
        $raw = is_array($caps['plexDatabases'] ?? null)
            ? $caps['plexDatabases']
            : array_filter((array) ($caps['databases'] ?? []), fn (mixed $d): bool => strtolower((string) $d) !== DatabaseDriver::SQLITE->value);

        $normalized = [];
        foreach ($raw as $entry) {
            $driver = DatabaseDriver::fromPlexService((string) $entry);
            if ($driver !== null && $driver !== DatabaseDriver::SQLITE) {
                $normalized[] = $driver->value;
            }
        }

        return array_values(array_unique($normalized));
    }

    /**
     * @param  array<string, mixed>  $toolRow
     */
    public function supportsNoPlex(array $toolRow): bool
    {
        if (array_key_exists('supportsNoPlex', $toolRow)) {
            return (bool) $toolRow['supportsNoPlex'];
        }

        foreach ((array) ($toolRow['initFields'] ?? []) as $field) {
            if (is_array($field) && ($field['key'] ?? null) === 'noPlex') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $toolRow
     */
    public function supportsSqlite(array $toolRow): bool
    {
        $caps = is_array($toolRow['commonsCapabilities'] ?? null) ? $toolRow['commonsCapabilities'] : [];
        if (array_key_exists('supportsSqlite', $caps)) {
            return (bool) $caps['supportsSqlite'];
        }

        return in_array(DatabaseDriver::SQLITE->value, array_map('strtolower', array_map('strval', (array) ($caps['databases'] ?? []))), true);
    }

    /**
     * Evaluate optimal storage topology for deploying `$toolRow` onto `$context`.
     *
     * @param  array<string, mixed>  $toolRow
     * @return array{
     *     compatiblePlexDatabases: list<string>,
     *     activePlexDatabases: list<string>,
     *     matchingActivePlexDatabases: list<string>,
     *     supportsNoPlex: bool,
     *     supportsSqlite: bool,
     *     recommendedMode: 'plex'|'standalone',
     *     recommendedDatabase: ?string,
     *     recommendedOptions: array<string, mixed>,
     *     reason: string,
     * }
     */
    public function analyzeTool(array $toolRow, string $context): array
    {
        $compat = $this->compatiblePlexDatabases($toolRow);
        $active = $this->activeDatabasesForContext($context);
        $matches = array_values(array_intersect($compat, $active));
        $canNoPlex = $this->supportsNoPlex($toolRow);
        $hasSqlite = $this->supportsSqlite($toolRow);

        if ($compat === []) {
            return [
                'compatiblePlexDatabases' => [],
                'activePlexDatabases' => $active,
                'matchingActivePlexDatabases' => [],
                'supportsNoPlex' => $canNoPlex,
                'supportsSqlite' => $hasSqlite,
                'recommendedMode' => 'standalone',
                'recommendedDatabase' => $hasSqlite ? DatabaseDriver::SQLITE->value : null,
                'recommendedOptions' => [],
                'reason' => 'Tool operates standalone without requiring a Plex Commons relational database.',
            ];
        }

        if ($matches !== []) {
            $best = DatabaseDriver::from($matches[0]);

            return [
                'compatiblePlexDatabases' => $compat,
                'activePlexDatabases' => $active,
                'matchingActivePlexDatabases' => $matches,
                'supportsNoPlex' => $canNoPlex,
                'supportsSqlite' => $hasSqlite,
                'recommendedMode' => 'plex',
                'recommendedDatabase' => $best->value,
                'recommendedOptions' => $canNoPlex ? ['noPlex' => false] : [],
                'reason' => "Reusing active {$best->plexLabel()} from server's Plex Commons (zero extra database containers).",
            ];
        }

        if ($canNoPlex) {
            $needed = implode(' or ', array_map(
                fn (string $d): string => DatabaseDriver::from($d)->label(),
                $compat,
            ));

            return [
                'compatiblePlexDatabases' => $compat,
                'activePlexDatabases' => $active,
                'matchingActivePlexDatabases' => [],
                'supportsNoPlex' => true,
                'supportsSqlite' => $hasSqlite,
                'recommendedMode' => 'standalone',
                'recommendedDatabase' => $hasSqlite ? DatabaseDriver::SQLITE->value : null,
                'recommendedOptions' => ['noPlex' => true],
                'reason' => "No compatible Plex database ({$needed}) active on server; defaulting to standalone "
                    .($hasSqlite ? 'SQLite ' : '').'(--no-plex) to avoid provisioning a new DB container.',
            ];
        }

        $primary = DatabaseDriver::from($compat[0]);

        return [
            'compatiblePlexDatabases' => $compat,
            'activePlexDatabases' => $active,
            'matchingActivePlexDatabases' => [],
            'supportsNoPlex' => false,
            'supportsSqlite' => $hasSqlite,
            'recommendedMode' => 'plex',
            'recommendedDatabase' => $primary->value,
            'recommendedOptions' => [],
            'reason' => "Requires {$primary->plexLabel()}; CLI will ensure Plex Commons {$primary->label()} is provisioned.",
        ];
    }

    /**
     * Aggregated Database -> Cluster Tools compatibility matrix keyed by Plex service slug
     * (`postgres`, `mysql`, `mariadb`) for the Plex Commons setup & service cards.
     *
     * Uses `CatalogTool` (SQLite) so hundreds of community apps summarize without bloating props.
     *
     * @return array<string, array{
     *     driver: string,
     *     serviceKey: string,
     *     label: string,
     *     counts: array{official: int, community: int, total: int},
     *     highlights: list<array{slug: string, name: string, logo: ?string, icon: string, source: string, supportsNoPlex: bool, supportsSqlite: bool}>,
     * }>
     */
    public function databaseSummaryMatrix(?string $fallbackContext = null): array
    {
        $this->toolCatalog->ensureCatalogSeeded();
        $rows = $this->catalogRows($fallbackContext);

        $matrix = [];

        foreach (DatabaseDriver::plexDrivers() as $driver) {
            $serviceKey = (string) $driver->plexServiceKey();
            $officialCount = 0;
            $communityCount = 0;
            $highlights = [];

            foreach ($rows as $row) {
                $compat = $this->compatiblePlexDatabases($row);
                if (! in_array($driver->value, $compat, true)) {
                    continue;
                }

                $source = (string) ($row['source'] ?? ToolSource::OFFICIAL->value);
                if ($source === ToolSource::COMMUNITY->value) {
                    $communityCount++;
                } else {
                    $officialCount++;
                }

                if (count($highlights) < 8) {
                    $highlights[] = [
                        'slug' => (string) ($row['tool'] ?? ''),
                        'name' => (string) ($row['name'] ?? $row['label'] ?? $row['tool'] ?? ''),
                        'logo' => is_string($row['logo'] ?? null) ? $row['logo'] : null,
                        'icon' => (string) ($row['icon'] ?? '📦'),
                        'source' => $source,
                        'supportsNoPlex' => $this->supportsNoPlex($row),
                        'supportsSqlite' => $this->supportsSqlite($row),
                    ];
                }
            }

            $matrix[$serviceKey] = [
                'driver' => $driver->value,
                'serviceKey' => $serviceKey,
                'label' => $driver->label(),
                'counts' => [
                    'official' => $officialCount,
                    'community' => $communityCount,
                    'total' => $officialCount + $communityCount,
                ],
                'highlights' => $highlights,
            ];
        }

        return $matrix;
    }

    /**
     * Search tools for the Plex Commons "planned apps" compatibility selector.
     *
     * @return list<array{slug: string, name: string, logo: ?string, icon: string, source: string, plexDatabases: list<string>, supportsNoPlex: bool, supportsSqlite: bool}>
     */
    public function searchTools(?string $query = null, int $limit = 40, ?string $fallbackContext = null): array
    {
        $this->toolCatalog->ensureCatalogSeeded();

        if (CatalogTool::exists()) {
            /** @var Collection<int, CatalogTool> $items */
            $items = CatalogTool::query()
                ->search($query)
                ->orderByRaw("CASE WHEN source = 'official' THEN 0 ELSE 1 END")
                ->orderBy('position')
                ->orderBy('name')
                ->limit($limit)
                ->get();

            return array_values($items
                ->map(fn (CatalogTool $t): array => $t->toToolRow())
                ->filter(fn (array $row): bool => $this->compatiblePlexDatabases($row) !== [])
                ->map(fn (array $row): array => $this->toCompatibilityChip($row))
                ->all());
        }

        $q = strtolower(trim((string) $query));
        $results = [];

        foreach ($this->catalogRows($fallbackContext) as $row) {
            if ($this->compatiblePlexDatabases($row) === []) {
                continue;
            }
            if ($q !== '') {
                $haystack = strtolower(implode(' ', [
                    (string) ($row['tool'] ?? ''),
                    (string) ($row['name'] ?? ''),
                    (string) ($row['tagline'] ?? ''),
                ]));
                if (! str_contains($haystack, $q)) {
                    continue;
                }
            }
            $results[] = $this->toCompatibilityChip($row);
            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{slug: string, name: string, logo: ?string, icon: string, source: string, plexDatabases: list<string>, supportsNoPlex: bool, supportsSqlite: bool}
     */
    private function toCompatibilityChip(array $row): array
    {
        return [
            'slug' => (string) ($row['tool'] ?? ''),
            'name' => (string) ($row['name'] ?? $row['label'] ?? $row['tool'] ?? ''),
            'logo' => is_string($row['logo'] ?? null) ? $row['logo'] : null,
            'icon' => (string) ($row['icon'] ?? '📦'),
            'source' => (string) ($row['source'] ?? ToolSource::OFFICIAL->value),
            'plexDatabases' => $this->compatiblePlexDatabases($row),
            'supportsNoPlex' => $this->supportsNoPlex($row),
            'supportsSqlite' => $this->supportsSqlite($row),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function catalogRows(?string $fallbackContext = null): array
    {
        if (CatalogTool::exists()) {
            return array_values(CatalogTool::query()
                ->orderByRaw("CASE WHEN source = 'official' THEN 0 ELSE 1 END")
                ->orderBy('position')
                ->orderBy('name')
                ->get()
                ->map(fn (CatalogTool $tool): array => $tool->toToolRow())
                ->all());
        }

        if ($fallbackContext !== null && $fallbackContext !== '') {
            $ctxRows = $this->toolCatalog->cached($fallbackContext) ?? $this->toolCatalog->registered($fallbackContext);
            if (is_array($ctxRows)) {
                return $ctxRows;
            }
        }

        return array_values(ClusterTool::query()
            ->orderBy('position')
            ->get()
            ->unique('tool')
            ->map(fn (ClusterTool $tool): array => $tool->toToolArray())
            ->all());
    }
}
