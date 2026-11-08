<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function projectPreviewSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $app = "{$home}/code/portal";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($app);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin, 'app' => realpath($app)];
}

test('projects.preview.up dispatches preview:up CLI run', function () {
    $sandbox = projectPreviewSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $response = $this->post(route('projects.preview.up', $project));
    $response->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'preview:up', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $run = Run::query()->where('kind', RunKind::PreviewUpProject)->first();
    expect($run)->not->toBeNull()
        ->and($run->environment)->toBe('local');

    File::deleteDirectory($sandbox['home']);
});

test('projects.preview.down dispatches preview:down CLI run', function () {
    $sandbox = projectPreviewSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $response = $this->post(route('projects.preview.down', $project));
    $response->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'preview:down', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $run = Run::query()->where('kind', RunKind::PreviewDownProject)->first();
    expect($run)->not->toBeNull()
        ->and($run->environment)->toBe('local');

    File::deleteDirectory($sandbox['home']);
});

test('projects.preview aborts 404 when project path does not exist', function () {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $project = Project::create(['path' => "{$home}/code/missing-portal"]);

    $this->post(route('projects.preview.up', $project))->assertNotFound();
    $this->post(route('projects.preview.down', $project))->assertNotFound();

    File::deleteDirectory($home);
});
