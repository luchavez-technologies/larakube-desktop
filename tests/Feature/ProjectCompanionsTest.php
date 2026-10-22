<?php

use App\Services\LaraKube\ProjectCompanions;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function projectCompanionsFakeCli(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $project = "{$home}/code/demo";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($project);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => $home, 'project' => realpath($project)];
}

test('credentials returns the parsed companions list from companion:list --json', function () {
    $sandbox = projectCompanionsFakeCli();

    Process::fake([
        '*companion:list*' => Process::result(output: json_encode([
            'success' => true,
            'companions' => [
                ['companion' => 'Mailpit', 'url' => 'https://mailpit.test', 'host' => null, 'user' => null, 'password' => null, 'database' => null],
                ['companion' => 'pgAdmin', 'url' => 'https://pgadmin.test', 'host' => 'postgres.demo.svc.cluster.local', 'user' => 'demo', 'password' => 'secret', 'database' => 'demo'],
            ],
        ])),
    ]);

    $credentials = app(ProjectCompanions::class)->credentials($sandbox['project']);

    expect($credentials)->toHaveCount(2)
        ->and($credentials[1]['companion'])->toBe('pgAdmin')
        ->and($credentials[1]['host'])->toBe('postgres.demo.svc.cluster.local');

    File::deleteDirectory($sandbox['home']);
});

test('credentials returns empty on a project path that does not exist', function () {
    $sandbox = projectCompanionsFakeCli();

    $credentials = app(ProjectCompanions::class)->credentials($sandbox['home'].'/no-such-project');

    expect($credentials)->toBe([]);

    File::deleteDirectory($sandbox['home']);
});

test('credentials returns empty when companion:list does not report success', function () {
    $sandbox = projectCompanionsFakeCli();

    Process::fake([
        '*companion:list*' => Process::result(output: json_encode(['success' => false])),
    ]);

    $credentials = app(ProjectCompanions::class)->credentials($sandbox['project']);

    expect($credentials)->toBe([]);

    File::deleteDirectory($sandbox['home']);
});
