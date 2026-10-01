<?php

use App\Enums\RunKind;
use App\Models\Project;
use App\Models\Run;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function plexSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    $app = "{$home}/code/shop";
    File::ensureDirectoryExists($bin);
    File::ensureDirectoryExists($app);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin, 'app' => realpath($app)];
}

test('server plex lifecycle commands run plex:init, plex:start, and plex:stop', function () {
    $sandbox = plexSandbox();
    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('demo-vps')->andReturn([
        'name' => 'demo-vps',
        'provider' => 'gcp',
        'context' => 'larakube-34.27.253.31',
        'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('servers.plex.init', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:init', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::PlexInit);

    $this->post(route('servers.plex.start', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:start', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);

    $this->post(route('servers.plex.stop', ['server' => 'demo-vps']))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:stop', '--context=larakube-34.27.253.31', '--no-interaction',
    ]);

    File::deleteDirectory($sandbox['home']);
});

test('project plex commands run plex:join and plex:leave', function () {
    $sandbox = plexSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('projects.plex.join', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:join', '--fast', '--no-interaction',
    ] && $cwd === $sandbox['app']);
    expect(Run::sole()->kind)->toBe(RunKind::PlexJoin);

    $this->post(route('projects.plex.leave', $project))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:leave', '--force', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});

test('project plex commands accept optional environment', function () {
    $sandbox = plexSandbox();
    $project = Project::create(['path' => $sandbox['app']]);
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('projects.plex.join', $project), ['environment' => 'staging'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:join', 'staging', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    $this->post(route('projects.plex.leave', $project), ['environment' => 'staging'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'plex:leave', 'staging', '--force', '--no-interaction',
    ] && $cwd === $sandbox['app']);

    File::deleteDirectory($sandbox['home']);
});
