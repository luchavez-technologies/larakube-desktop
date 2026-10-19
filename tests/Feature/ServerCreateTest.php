<?php

use App\Models\CloudProvider;
use App\Models\CloudRegion;
use App\Models\CloudSize;
use App\Models\Server;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ReadinessCheck;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;

test('the create server page is told the default cloud provider, to pre-select it', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    app(GlobalSettings::class)->update(['defaultCloudProvider' => 'aws']);

    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('providers')->andReturn([]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('servers.create'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('servers/create')
            ->where('defaultProvider', 'aws')
            ->has('providers'));
});

test('provider-catalog endpoint returns catalog for a single provider', function () {
    $readiness = mock(ReadinessCheck::class);
    $readiness->shouldReceive('providerCatalog')->with('aws')->andReturn([
        'slug' => 'aws',
        'label' => 'Amazon Web Services',
        'regions' => [['value' => 'us-east-1', 'label' => 'us-east-1']],
        'vpsSizes' => [['value' => 't3.medium', 'label' => 't3.medium']],
    ]);
    app()->instance(ReadinessCheck::class, $readiness);

    $this->get(route('servers.provider_catalog', 'aws'))
        ->assertOk()
        ->assertJson([
            'slug' => 'aws',
            'label' => 'Amazon Web Services',
        ]);
});

test('saving a server automatically associates foreign keys for provider, region, and size', function () {
    $provider = CloudProvider::firstOrCreate(
        ['slug' => 'aws'],
        [
            'label' => 'Amazon Web Services',
            'default_region' => 'us-east-1',
            'default_vps_size' => 't3.medium',
            'source' => 'builtin',
        ]
    );

    $region = CloudRegion::firstOrCreate(
        ['cloud_provider_id' => $provider->id, 'slug' => 'us-east-1'],
        ['label' => 'N. Virginia', 'is_recommended' => true]
    );

    $size = CloudSize::firstOrCreate(
        ['cloud_provider_id' => $provider->id, 'slug' => 't3.medium', 'target_kind' => 'vps'],
        [
            'label' => 't3.medium',
            'vcpu' => 2,
            'memory_mb' => 4096,
            'currency' => 'USD',
            'is_recommended' => true,
        ]
    );

    $server = Server::create([
        'name' => 'test-linking-server',
        'provider' => 'aws',
        'kind' => 'vps',
        'region' => 'us-east-1',
        'size' => 't3.medium',
        'status' => 'provisioning',
    ]);

    expect($server->cloud_provider_id)->toBe($provider->id)
        ->and($server->cloud_region_id)->toBe($region->id)
        ->and($server->cloud_size_id)->toBe($size->id)
        ->and($server->cloudProvider->slug)->toBe('aws')
        ->and($server->cloudRegion->slug)->toBe('us-east-1')
        ->and($server->cloudSize->slug)->toBe('t3.medium');
});
