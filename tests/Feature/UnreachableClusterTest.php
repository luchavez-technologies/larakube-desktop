<?php

use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Process\Exception\ProcessTimedOutException as SymfonyTimedOut;
use Symfony\Component\Process\Process as SymfonyProcess;

/**
 * A server that is being destroyed, or has not finished starting, does not
 * answer kubectl. The page must load and say it does not know, not die with a
 * timeout exception.
 */
test('a cluster that never answers reads as unknown, not as an error page', function (): void {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/kubectl", "#!/bin/sh\n");
    chmod("{$bin}/kubectl", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    Process::fake(['*' => fn () => throw new ProcessTimedOutException(
        new SymfonyTimedOut(new SymfonyProcess(['kubectl']), SymfonyTimedOut::TYPE_GENERAL),
        Process::result(),
    )]);

    $status = app(ClusterStatus::class);

    expect($status->plex('larakube-203.0.113.9'))->toBeNull()
        ->and($status->clusterUsers('larakube-203.0.113.9'))->toBeNull()
        ->and($status->domains('larakube-203.0.113.9'))->toBeArray();

    File::deleteDirectory($bin);
});
