<?php

use App\Services\LaraKube\FrameworkCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Process\Exception\ProcessSignaledException;

test('framework catalog returns null when process is signaled or fails', function () {
    $locator = mock(ToolLocator::class);
    $locator->shouldReceive('find')->with('larakube')->andReturn('/usr/local/bin/larakube');
    $locator->shouldReceive('isolate')->andReturn([
        'command' => ['/usr/local/bin/larakube', 'new:frameworks', '--json', '--no-interaction'],
        'environment' => [],
    ]);

    Process::fake([
        '*' => function () {
            $process = new Symfony\Component\Process\Process(['mock']);
            throw new ProcessSignaledException($process);
        },
    ]);

    $catalog = new FrameworkCatalog($locator);
    expect($catalog->catalog())->toBeNull();
});
