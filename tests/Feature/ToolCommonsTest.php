<?php

use App\Services\LaraKube\ToolCommons;

$plex = ['initialized' => true, 'services' => [], 'tenants' => [
    'outline_wiki' => ['db' => 'outline_wiki', 'db_service' => 'postgres', 'redis_index' => 4, 's3_bucket' => 'outline-wiki'],
    'other_app' => ['db' => 'other_app', 'db_service' => 'mysql', 'redis_index' => 5, 's3_bucket' => 'other-app'],
]];

test('a tool\'s names on the Commons become the same service tiles a project shows', function () use ($plex): void {
    $row = ['commons' => ['databases' => ['outline_wiki'], 'redis' => ['outline_wiki'], 'buckets' => ['outline-wiki']]];

    $result = (new ToolCommons)->describe($row, $plex);
    $services = collect($result['services'])->keyBy('kind');

    expect($result['commons'])->toBeTrue()
        ->and($services['database']['name'])->toBe('Postgres')
        ->and($services['database']['mode'])->toBe('commons')
        ->and(collect($services['database']['details'])->firstWhere('label', 'Database')['value'])->toBe('outline_wiki')
        ->and(collect($services['cache']['details'])->firstWhere('label', 'Database index')['value'])->toBe('4')
        ->and(collect($services['storage']['details'])->firstWhere('label', 'Bucket')['value'])->toBe('outline-wiki');
});

test('a tool that holds nothing on the Commons has no card', function () use ($plex): void {
    expect((new ToolCommons)->describe(['commons' => ['databases' => [], 'redis' => [], 'buckets' => []]], $plex))->toBeNull()
        ->and((new ToolCommons)->describe([], $plex))->toBeNull();
});

test('the names are shown even when the Commons cannot be read', function (): void {
    $result = (new ToolCommons)->describe(['commons' => ['databases' => ['outline_wiki'], 'redis' => [], 'buckets' => []]], null);

    expect($result['services'])->toHaveCount(1)
        ->and($result['services'][0]['details'][0]['value'])->toBe('outline_wiki');
});
