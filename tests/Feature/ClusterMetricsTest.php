<?php

use App\Services\LaraKube\ClusterMetrics;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

test('cluster metrics returns empty when kubectl is missing', function () {
    $empty = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($empty);
    $locator = new ToolLocator([$empty]);

    $metrics = new ClusterMetrics($locator);
    $result = $metrics->nodeMetrics('default');

    expect($result)->toBeNull();

    File::deleteDirectory($empty);
});

test('cluster metrics parses top nodes and pvc capacity', function () {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/kubectl", "#!/bin/sh\nexit 0\n");
    chmod("{$bin}/kubectl", 0755);
    $locator = new ToolLocator([$bin]);

    Cache::flush();
    Process::fake([
        '*top*nodes*' => Process::result(
            "node-1   250m   12%   1200Mi   30%\n".
            "node-2   350m   18%   1600Mi   40%\n"
        ),
        '*get*pvc*' => Process::result(json_encode([
            'items' => [
                ['spec' => ['resources' => ['requests' => ['storage' => '10Gi']]]],
                ['spec' => ['resources' => ['requests' => ['storage' => '20Gi']]]],
            ],
        ])),
    ]);

    $metrics = new ClusterMetrics($locator);
    $result = $metrics->nodeMetrics('ctx-test');

    expect($result)->not->toBeNull()
        ->and($result['available'])->toBeTrue()
        ->and($result['cpuPercent'])->toBe(15) // round((12+18)/2)
        ->and($result['memoryPercent'])->toBe(35) // round((30+40)/2)
        ->and(count($result['nodes']))->toBe(2)
        ->and($result['pvcCount'])->toBe(2)
        ->and($result['pvcCapacity'])->toContain('GiB');

    File::deleteDirectory($bin);
});

test('cluster metrics parses top pods grouped by component', function () {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/kubectl", "#!/bin/sh\nexit 0\n");
    chmod("{$bin}/kubectl", 0755);
    $locator = new ToolLocator([$bin]);

    Cache::flush();
    Process::fake([
        '*top*pods*' => Process::result(
            "my-app-web-7c4d5f9b-abc12    45m   150Mi\n".
            "my-app-web-7c4d5f9b-xyz34    55m   160Mi\n".
            "my-app-worker-6b9f8d-klm56   120m  320Mi\n"
        ),
    ]);

    $metrics = new ClusterMetrics($locator);
    $result = $metrics->podMetrics('ctx-test', 'my-app');

    expect($result)->not->toBeNull()
        ->and($result['available'])->toBeTrue()
        ->and(array_keys($result['components']))->toContain('web', 'worker')
        ->and($result['components']['web']['podCount'])->toBe(2)
        ->and($result['components']['worker']['podCount'])->toBe(1);

    File::deleteDirectory($bin);
});
