<?php

use App\Services\LaraKube\ProjectPods;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

test('ProjectPods::pods parses running pod items and derives status, restarts, age, and tone', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    mkdir($directory, 0755, true);
    file_put_contents("{$directory}/kubectl", "#!/bin/sh\n");
    chmod("{$directory}/kubectl", 0755);

    $locator = new ToolLocator([$directory]);
    $service = new ProjectPods($locator);

    $fakeJson = json_encode([
        'items' => [
            [
                'metadata' => [
                    'name' => 'shop-web-5b7bc4bd4f-8p9d4',
                    'creationTimestamp' => now()->subMinutes(15)->toIso8601String(),
                    'labels' => ['app' => 'web'],
                ],
                'spec' => [
                    'containers' => [['name' => 'php']],
                ],
                'status' => [
                    'phase' => 'Running',
                    'containerStatuses' => [
                        [
                            'name' => 'php',
                            'ready' => true,
                            'restartCount' => 0,
                            'state' => ['running' => ['startedAt' => now()->subMinutes(15)->toIso8601String()]],
                        ],
                    ],
                ],
            ],
            [
                'metadata' => [
                    'name' => 'shop-queue-7c8df9ae5a-2k4m1',
                    'creationTimestamp' => now()->subHours(2)->toIso8601String(),
                    'labels' => ['app' => 'queue'],
                ],
                'spec' => [
                    'containers' => [['name' => 'worker']],
                ],
                'status' => [
                    'phase' => 'Running',
                    'containerStatuses' => [
                        [
                            'name' => 'worker',
                            'ready' => false,
                            'restartCount' => 4,
                            'state' => [
                                'waiting' => [
                                    'reason' => 'CrashLoopBackOff',
                                    'message' => 'Back-off 5m0s restarting failed container',
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    Process::fake([
        '*get*pods*' => Process::result(output: $fakeJson),
        '*' => Process::result(),
    ]);

    $pods = $service->pods('k3d-larakube', 'shop-local', fresh: true);

    expect($pods)->toHaveCount(2);

    $web = collect($pods)->firstWhere('component', 'web');
    expect($web['name'])->toBe('shop-web-5b7bc4bd4f-8p9d4')
        ->and($web['componentLabel'])->toBe('Web Server')
        ->and($web['statusText'])->toBe('Running')
        ->and($web['statusTone'])->toBe('ok')
        ->and($web['ready'])->toBe('1/1')
        ->and($web['restarts'])->toBe(0)
        ->and($web['age'])->toBe('15m')
        ->and($web['containers'])->toBe(['php']);

    $queue = collect($pods)->firstWhere('component', 'queue');
    expect($queue['name'])->toBe('shop-queue-7c8df9ae5a-2k4m1')
        ->and($queue['statusText'])->toBe('CrashLoopBackOff')
        ->and($queue['statusTone'])->toBe('bad')
        ->and($queue['ready'])->toBe('0/1')
        ->and($queue['restarts'])->toBe(4)
        ->and($queue['age'])->toBe('2h');

    unlink("{$directory}/kubectl");
    rmdir($directory);
});

test('ProjectPods::logs fetches logs with tail and optional container', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    mkdir($directory, 0755, true);
    file_put_contents("{$directory}/kubectl", "#!/bin/sh\n");
    chmod("{$directory}/kubectl", 0755);

    $locator = new ToolLocator([$directory]);
    $service = new ProjectPods($locator);

    Process::fake([
        '*logs*' => Process::result(output: "Starting worker...\nProcessing job #42\n"),
    ]);

    $output = $service->logs('k3d-larakube', 'shop-local', 'shop-web-123', 'php', 50);

    expect($output)->toContain('Processing job #42');

    Process::assertRan(fn ($p) => str_contains(implode(' ', $p->command), 'logs')
        && str_contains(implode(' ', $p->command), 'shop-web-123')
        && str_contains(implode(' ', $p->command), '-c=php')
        && str_contains(implode(' ', $p->command), '--tail=50'));

    unlink("{$directory}/kubectl");
    rmdir($directory);
});

test('ProjectPods::restartPod deletes the pod so the deployment rolls a fresh one', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    mkdir($directory, 0755, true);
    file_put_contents("{$directory}/kubectl", "#!/bin/sh\n");
    chmod("{$directory}/kubectl", 0755);

    $locator = new ToolLocator([$directory]);
    $service = new ProjectPods($locator);

    Process::fake([
        '*delete*pod*' => Process::result(),
        '*' => Process::result(),
    ]);

    $result = $service->restartPod('k3d-larakube', 'shop-local', 'shop-web-123');

    expect($result)->toBeTrue();

    Process::assertRan(fn ($p) => str_contains(implode(' ', $p->command), 'delete')
        && str_contains(implode(' ', $p->command), 'pod')
        && str_contains(implode(' ', $p->command), 'shop-web-123'));

    unlink("{$directory}/kubectl");
    rmdir($directory);
});
