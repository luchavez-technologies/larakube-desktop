<?php

use App\Services\LaraKube\KubeconfigDiscovery;
use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

test('kubeconfig discovery discovers external clusters from kubectl config view', function () {
    $dir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/kubectl", "#!/bin/sh\nexit 0\n");
    chmod("{$dir}/kubectl", 0755);

    $locator = new ToolLocator([$dir]);
    app()->instance(ToolLocator::class, $locator);

    $fakeKubeconfig = [
        'kind' => 'Config',
        'current-context' => 'orbstack',
        'contexts' => [
            ['name' => 'existing-stack', 'context' => ['cluster' => 'existing-cluster']],
            ['name' => 'orbstack', 'context' => ['cluster' => 'orbstack']],
            ['name' => 'minikube', 'context' => ['cluster' => 'minikube']],
        ],
        'clusters' => [
            ['name' => 'orbstack', 'cluster' => ['server' => 'https://127.0.0.1:26443']],
            ['name' => 'minikube', 'cluster' => ['server' => 'https://192.168.49.2:8443']],
        ],
    ];

    Process::fake([
        '*kubectl*config*view*-o*json*' => Process::result(output: json_encode($fakeKubeconfig)),
        '*get*svc*-n*traefik*traefik*' => Process::result(output: 'service/traefik'),
    ]);

    $discovery = new KubeconfigDiscovery($locator, new LocalCluster($locator));
    $discovered = $discovery->discover(['existing-stack']);

    expect($discovered)->toHaveCount(2)
        ->and($discovered[0]['name'])->toBe('orbstack')
        ->and($discovered[0]['provider'])->toBe('orbstack')
        ->and($discovered[0]['kind'])->toBe('discovered')
        ->and($discovered[0]['status'])->toBe('ready')
        ->and($discovered[0]['isCurrent'])->toBeTrue()
        ->and($discovered[1]['name'])->toBe('minikube')
        ->and($discovered[1]['provider'])->toBe('minikube');

    File::deleteDirectory($dir);
});

test('a discovered local cluster with no Traefik on it yet is reported incomplete, not ready', function () {
    $dir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/kubectl", "#!/bin/sh\nexit 0\n");
    chmod("{$dir}/kubectl", 0755);

    $locator = new ToolLocator([$dir]);
    app()->instance(ToolLocator::class, $locator);

    Process::fake([
        '*kubectl*config*view*-o*json*' => Process::result(output: json_encode([
            'current-context' => 'orbstack',
            'contexts' => [['name' => 'orbstack', 'context' => ['cluster' => 'orbstack']]],
            'clusters' => [['name' => 'orbstack', 'cluster' => ['server' => 'https://127.0.0.1:26443']]],
        ])),
        // Neither the named nor the labelled Traefik lookup finds anything —
        // a bare, freshly-enabled OrbStack cluster nobody has run setup on.
        '*get*svc*' => Process::result(output: '', exitCode: 1),
    ]);

    $discovery = new KubeconfigDiscovery($locator, new LocalCluster($locator));
    $discovered = $discovery->discover();

    expect($discovered)->toHaveCount(1)
        ->and($discovered[0]['name'])->toBe('orbstack')
        ->and($discovered[0]['status'])->toBe('incomplete');

    File::deleteDirectory($dir);
});

test('stack catalog includes both provisioned stacks and discovered clusters', function () {
    $dir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/larakube", "#!/bin/sh\nexit 0\n");
    File::put("{$dir}/kubectl", "#!/bin/sh\nexit 0\n");
    chmod("{$dir}/larakube", 0755);
    chmod("{$dir}/kubectl", 0755);

    $locator = new ToolLocator([$dir]);
    app()->instance(ToolLocator::class, $locator);

    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode([
            'success' => true,
            'stacks' => [
                ['name' => 'prod-server', 'provider' => 'do', 'kind' => 'vps', 'context' => 'prod-context', 'status' => 'ready'],
            ],
        ])),
        '*kubectl*config*view*' => Process::result(output: json_encode([
            'current-context' => 'orbstack',
            'contexts' => [
                ['name' => 'prod-context', 'context' => ['cluster' => 'prod-cluster']],
                ['name' => 'orbstack', 'context' => ['cluster' => 'orbstack']],
            ],
            'clusters' => [
                ['name' => 'orbstack', 'cluster' => ['server' => 'https://127.0.0.1:26443']],
            ],
        ])),
        '*get*svc*-n*traefik*traefik*' => Process::result(output: 'service/traefik'),
    ]);

    $catalog = new StackCatalog($locator);
    $all = $catalog->all();

    expect($all)->toHaveCount(2)
        ->and($all[0]['name'])->toBe('prod-server')
        ->and($all[1]['name'])->toBe('orbstack')
        ->and($all[1]['kind'])->toBe('discovered')
        ->and($catalog->find('orbstack'))->not->toBeNull();

    File::deleteDirectory($dir);
});
