<?php

use App\Enums\CloudProviderSlug;
use App\Enums\DatabaseDriver;
use App\Enums\DnsProvider;
use App\Enums\ServerTargetKind;
use App\Enums\ToolCategory;
use App\Enums\ToolSource;
use App\Models\CatalogTool;
use App\Models\Server;
use App\Services\LaraKube\PlexCompatibilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('backed enums expose canonical values and labels', function (): void {
    expect(CloudProviderSlug::values())->toBe(['gcp', 'aws', 'do', 'hetzner', 'custom'])
        ->and(ServerTargetKind::values())->toBe(['vps', 'managed'])
        ->and(DnsProvider::values())->toBe(['cloudflare', 'route53', 'google', 'none'])
        ->and(DatabaseDriver::fromPlexService('postgresql'))->toBe(DatabaseDriver::POSTGRESQL)
        ->and(DatabaseDriver::fromPlexService('postgres'))->toBe(DatabaseDriver::POSTGRESQL)
        ->and(DatabaseDriver::fromPlexService('mysql'))->toBe(DatabaseDriver::MYSQL)
        ->and(DatabaseDriver::fromPlexService('mariadb'))->toBe(DatabaseDriver::MARIADB)
        ->and(ToolCategory::values())->toContain('productivity')
        ->and(ToolCategory::PRODUCTIVITY->label())->toBe('Productivity & Office')
        ->and(ToolSource::values())->toBe(['official', 'community']);
});

test('plex compatibility resolver suggests SQLite --no-plex when no compatible engine is active, and reuses Postgres when active', function (): void {
    $resolver = app(PlexCompatibilityResolver::class);

    $n8n = [
        'tool' => 'n8n',
        'brand' => 'n8n',
        'supportsNoPlex' => true,
        'commonsCapabilities' => [
            'database' => true,
            'plexDatabases' => ['postgres'],
            'supportsSqlite' => true,
        ],
    ];

    // No server / no Plex active -> defaults to standalone sqlite (--no-plex)
    $noPlex = $resolver->analyzeTool($n8n, 'missing-context');
    expect($noPlex['recommendedMode'])->toBe('standalone')
        ->and($noPlex['recommendedDatabase'])->toBe('sqlite')
        ->and($noPlex['recommendedOptions'])->toBe(['noPlex' => true]);

    // Server with MySQL only -> still falls back to SQLite because n8n needs Postgres for Plex
    Server::create([
        'name' => 'mysql-box',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'ctx-mysql',
        'status' => 'ready',
        'plex_sync_status' => 'fresh',
        'plex_last_synced_at' => now(),
        'plex_data' => [
            'initialized' => true,
            'services' => ['mysql' => ['enabled' => true]],
        ],
    ]);

    $mysqlAnalysis = $resolver->analyzeTool($n8n, 'ctx-mysql');
    expect($mysqlAnalysis['recommendedMode'])->toBe('standalone')
        ->and($mysqlAnalysis['recommendedDatabase'])->toBe('sqlite')
        ->and($mysqlAnalysis['matchingActivePlexDatabases'])->toBe([]);

    // Server with PostgreSQL active -> reuses Plex PostgreSQL
    Server::create([
        'name' => 'pg-box',
        'provider' => 'do',
        'kind' => 'vps',
        'context' => 'ctx-pg',
        'status' => 'ready',
        'plex_sync_status' => 'fresh',
        'plex_last_synced_at' => now(),
        'plex_data' => [
            'initialized' => true,
            'services' => ['postgresql' => ['enabled' => true]],
        ],
    ]);

    $pgAnalysis = $resolver->analyzeTool($n8n, 'ctx-pg');
    expect($pgAnalysis['recommendedMode'])->toBe('plex')
        ->and($pgAnalysis['recommendedDatabase'])->toBe('postgresql')
        ->and($pgAnalysis['recommendedOptions'])->toBe(['noPlex' => false])
        ->and($pgAnalysis['matchingActivePlexDatabases'])->toBe(['postgresql']);
});

test('plex compatibility resolver aggregates database summary counts across official and community catalog tools', function (): void {
    CatalogTool::upsertFromPayload([
        'tool' => 'n8n',
        'brand' => 'n8n',
        'label' => 'n8n',
        'source' => 'official',
        'supportsNoPlex' => true,
        'commonsCapabilities' => ['plexDatabases' => ['postgres'], 'supportsSqlite' => true],
    ]);
    CatalogTool::upsertFromPayload([
        'tool' => 'ghost',
        'brand' => 'Ghost',
        'label' => 'Ghost Blog',
        'source' => 'official',
        'commonsCapabilities' => ['plexDatabases' => ['mysql'], 'supportsSqlite' => false],
    ]);
    CatalogTool::upsertFromPayload([
        'tool' => 'community-erp',
        'brand' => 'Community ERP',
        'label' => 'Community ERP',
        'source' => 'community',
        'commonsCapabilities' => ['plexDatabases' => ['postgres', 'mysql'], 'supportsSqlite' => false],
    ]);

    $matrix = app(PlexCompatibilityResolver::class)->databaseSummaryMatrix();

    expect($matrix['postgres']['counts'])->toBe(['official' => 1, 'community' => 1, 'total' => 2])
        ->and($matrix['mysql']['counts'])->toBe(['official' => 1, 'community' => 1, 'total' => 2])
        ->and($matrix['mariadb']['counts'])->toBe(['official' => 0, 'community' => 0, 'total' => 0]);
});
