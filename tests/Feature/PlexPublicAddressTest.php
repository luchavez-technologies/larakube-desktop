<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\PlexCommonsServices;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function publicAddressSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

/** A Commons on one server with Postgres and SeaweedFS live; SeaweedFS's public address as given. */
function publicAddressFakes(?string $seaweedPublic = null): array
{
    return [
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'hello-cloud', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'us-east4', 'ip' => '35.236.161.146', 'context' => 'larakube-35.236.161.146', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*plex:show*' => Process::result(output: json_encode([
            'initialized' => true,
            'context' => 'larakube-35.236.161.146',
            'services' => ['postgres' => ['enabled' => true, 'port' => 5432], 'seaweedfs' => ['enabled' => true, 'port' => 8333]],
            'serviceCatalog' => [
                'database' => ['active' => 'postgres', 'options' => ['postgres' => ['label' => 'PostgreSQL', 'enabled' => true, 'ready' => true]]],
                'storage' => ['active' => 'seaweedfs', 'options' => ['seaweedfs' => ['label' => 'SeaweedFS', 'enabled' => true, 'ready' => true]]],
            ],
            'endpoints' => [
                'postgres' => ['internal' => 'postgres.larakube-plex.svc.cluster.local:5432', 'public' => null, 'publicCapable' => false],
                'seaweedfs' => ['internal' => 'seaweedfs.larakube-plex.svc.cluster.local:8333', 'public' => $seaweedPublic, 'publicCapable' => true],
            ],
            'tenants' => ['tool' => [], 'project' => [], 'custom' => []],
        ])),
        '*' => Process::result(output: ''),
    ];
}

test('object storage without a public address asks for one; the in-cluster address comes from the CLI', function () {
    $endpoints = json_decode((string) publicAddressFakes()['*plex:show*']->output(), true);
    $described = app(PlexCommonsServices::class)->describe($endpoints['serviceCatalog'], $endpoints['services'], $endpoints['endpoints']);
    $options = collect($described['categories'])->flatMap(fn (array $category): array => $category['options'])->keyBy('driver');

    expect($options['seaweedfs']['needsPublicAddress'])->toBeTrue()
        ->and($options['seaweedfs']['details'])->toBe([['label' => 'Internal', 'value' => 'seaweedfs.larakube-plex.svc.cluster.local:8333', 'secret' => false]])
        ->and($options['postgres']['needsPublicAddress'])->toBeFalse();

    $withPublic = json_decode((string) publicAddressFakes('https://s3-hello-cloud.example.com')['*plex:show*']->output(), true);
    $described = app(PlexCommonsServices::class)->describe($withPublic['serviceCatalog'], $withPublic['services'], $withPublic['endpoints']);
    $seaweed = collect($described['categories'])->flatMap(fn (array $category): array => $category['options'])->keyBy('driver')['seaweedfs'];

    expect($seaweed['needsPublicAddress'])->toBeFalse()
        ->and(collect($seaweed['details'])->firstWhere('label', 'Public')['value'])->toBe('https://s3-hello-cloud.example.com');
});

test('adding a public address re-runs plex:init with the active engines and --s3-host', function () {
    $sandbox = publicAddressSandbox();
    Process::fake(publicAddressFakes());
    $fake = ChildProcess::fake();

    $this->post(route('servers.plex.services.public-host', ['hello-cloud', 'seaweedfs']), ['host' => 'S3-Hello-Cloud.example.com'])
        ->assertRedirect(route('servers.plex.index', 'hello-cloud'));

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        "{$sandbox['bin']}/larakube", 'plex:init', '--context=larakube-35.236.161.146', '--services=postgres,seaweedfs', '--s3-host=s3-hello-cloud.example.com', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::PlexInit);

    File::deleteDirectory($sandbox['home']);
});

test('a public address is refused for an engine that cannot have one, or for a malformed address', function () {
    $sandbox = publicAddressSandbox();
    ChildProcess::fake();
    Process::fake(publicAddressFakes());

    $this->post(route('servers.plex.services.public-host', ['hello-cloud', 'postgres']), ['host' => 'db.example.com'])->assertStatus(422);
    $this->post(route('servers.plex.services.public-host', ['hello-cloud', 'seaweedfs']), ['host' => 'https://s3.example.com'])->assertSessionHasErrors('host');

    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});

test('an engine that already has a public address is not given another', function () {
    $sandbox = publicAddressSandbox();
    ChildProcess::fake();
    Process::fake(publicAddressFakes('https://s3-hello-cloud.example.com'));

    $this->post(route('servers.plex.services.public-host', ['hello-cloud', 'seaweedfs']), ['host' => 's3-other.example.com'])->assertStatus(422);

    expect(Run::count())->toBe(0);

    File::deleteDirectory($sandbox['home']);
});
