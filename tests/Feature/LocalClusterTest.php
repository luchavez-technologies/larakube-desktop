<?php

use App\Services\LaraKube\LocalCluster;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function localClusterFakeBin(): string
{
    $dir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/kubectl", "#!/bin/sh\n");
    chmod("{$dir}/kubectl", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$dir]));

    return $dir;
}

test('returns kubectl missing when kubectl cannot be found', function () {
    app()->instance(ToolLocator::class, new ToolLocator([]));

    $cluster = app(LocalCluster::class)->detect();

    expect($cluster['engine'])->toBe('None')
        ->and($cluster['context'])->toBeNull()
        ->and($cluster['status'])->toBe('kubectl missing')
        ->and($cluster['tone'])->toBe('muted');
});

test('returns No local cluster running when only a remote cloud server context exists', function () {
    $bin = localClusterFakeBin();

    $configJson = json_encode([
        'current-context' => 'larakube-34.142.199.251',
        'contexts' => [
            [
                'name' => 'larakube-34.142.199.251',
                'context' => [
                    'cluster' => 'larakube-34.142.199.251',
                    'user' => 'default',
                ],
            ],
        ],
        'clusters' => [
            [
                'name' => 'larakube-34.142.199.251',
                'cluster' => [
                    'server' => 'https://34.142.199.251:6443',
                ],
            ],
        ],
    ]);

    Process::fake([
        '*config*view*-o*json*' => Process::result(output: $configJson),
    ]);

    $cluster = app(LocalCluster::class)->detect();

    expect($cluster['engine'])->toBe('None')
        ->and($cluster['context'])->toBeNull()
        ->and($cluster['status'])->toBe('No local cluster running')
        ->and($cluster['tone'])->toBe('muted');

    File::deleteDirectory($bin);
});

test('returns No local cluster running when only devbox contexts exist', function () {
    $bin = localClusterFakeBin();

    $configJson = json_encode([
        'current-context' => 'larakube-devbox-mybox',
        'contexts' => [
            [
                'name' => 'larakube-devbox-mybox',
                'context' => [
                    'cluster' => 'larakube-devbox-mybox',
                    'user' => 'default',
                ],
            ],
        ],
        'clusters' => [
            [
                'name' => 'larakube-devbox-mybox',
                'cluster' => [
                    'server' => 'https://127.0.0.1:49152',
                ],
            ],
        ],
    ]);

    Process::fake([
        '*config*view*-o*json*' => Process::result(output: $configJson),
    ]);

    $cluster = app(LocalCluster::class)->detect();

    expect($cluster['engine'])->toBe('None')
        ->and($cluster['context'])->toBeNull()
        ->and($cluster['status'])->toBe('No local cluster running')
        ->and($cluster['tone'])->toBe('muted');

    File::deleteDirectory($bin);
});

test('detects reachable local k3s-larakube even when current context is set to a remote server', function () {
    $bin = localClusterFakeBin();

    $configJson = json_encode([
        'current-context' => 'larakube-34.142.199.251',
        'contexts' => [
            [
                'name' => 'larakube-34.142.199.251',
                'context' => [
                    'cluster' => 'larakube-34.142.199.251',
                ],
            ],
            [
                'name' => 'k3s-larakube',
                'context' => [
                    'cluster' => 'k3s-larakube',
                ],
            ],
        ],
        'clusters' => [
            [
                'name' => 'larakube-34.142.199.251',
                'cluster' => [
                    'server' => 'https://34.142.199.251:6443',
                ],
            ],
            [
                'name' => 'k3s-larakube',
                'cluster' => [
                    'server' => 'https://127.0.0.1:6443',
                ],
            ],
        ],
    ]);

    Process::fake([
        '*config*view*-o*json*' => Process::result(output: $configJson),
        '*cluster-info*--context=k3s-larakube*' => Process::result(output: 'Kubernetes control plane is running at https://127.0.0.1:6443'),
    ]);

    $cluster = app(LocalCluster::class)->detect();

    expect($cluster['engine'])->toBe('k3s')
        ->and($cluster['context'])->toBe('k3s-larakube')
        ->and($cluster['status'])->toBe('Ready for up')
        ->and($cluster['tone'])->toBe('ok');

    File::deleteDirectory($bin);
});

test('reports offline when k3s-larakube exists but is not reachable', function () {
    $bin = localClusterFakeBin();

    $configJson = json_encode([
        'current-context' => 'k3s-larakube',
        'contexts' => [
            [
                'name' => 'k3s-larakube',
                'context' => [
                    'cluster' => 'k3s-larakube',
                ],
            ],
        ],
        'clusters' => [
            [
                'name' => 'k3s-larakube',
                'cluster' => [
                    'server' => 'https://127.0.0.1:6443',
                ],
            ],
        ],
    ]);

    Process::fake([
        '*config*view*-o*json*' => Process::result(output: $configJson),
        '*cluster-info*--context=k3s-larakube*' => Process::result(exitCode: 1, errorOutput: 'The connection to the server 127.0.0.1:6443 was refused'),
    ]);

    $cluster = app(LocalCluster::class)->detect();

    expect($cluster['engine'])->toBe('k3s')
        ->and($cluster['context'])->toBe('k3s-larakube')
        ->and($cluster['status'])->toBe('Offline / not reachable')
        ->and($cluster['tone'])->toBe('warn');

    File::deleteDirectory($bin);
});

test('detects Docker Desktop and OrbStack distributions correctly', function () {
    $local = app(LocalCluster::class);

    expect($local->resolveLocalEngine('docker-desktop', 'https://127.0.0.1:6443'))->toBe('Docker Desktop')
        ->and($local->resolveLocalEngine('orbstack', 'https://127.0.0.1:6443'))->toBe('OrbStack')
        ->and($local->resolveLocalEngine('colima', 'https://127.0.0.1:6443'))->toBe('Colima')
        ->and($local->resolveLocalEngine('minikube', 'https://192.168.49.2:8443'))->toBe('Minikube')
        ->and($local->resolveLocalEngine('kind-dev', 'https://127.0.0.1:6443'))->toBe('Kind')
        ->and($local->resolveLocalEngine('k3d-cluster', 'https://127.0.0.1:6443'))->toBe('k3d')
        ->and($local->resolveLocalEngine('rancher-desktop', 'https://127.0.0.1:6443'))->toBe('Rancher Desktop')
        ->and($local->resolveLocalEngine('microk8s', 'https://127.0.0.1:6443'))->toBe('MicroK8s')
        ->and($local->resolveLocalEngine('larakube-34.142.199.251', 'https://34.142.199.251:6443'))->toBeNull()
        ->and($local->resolveLocalEngine('doks-prod', 'https://...digitalocean.com'))->toBeNull()
        ->and($local->resolveLocalEngine('eks-prod', 'https://...amazonaws.com'))->toBeNull();
});
