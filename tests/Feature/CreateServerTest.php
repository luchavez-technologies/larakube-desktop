<?php

use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function createServerFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('creating a server starts a non-interactive cloud:create child process', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $response = $this->post(route('servers.store'), [
        'provider' => 'do',
        'stack_name' => 'my-first-server',
        'region' => 'sgp1',
        'size' => 's-1vcpu-2gb',
        'api_token' => 'dop_v1_secret',
    ]);

    $run = Run::sole();
    $response->assertRedirect(route('runs.show', $run));

    expect($run->status)->toBe(RunStatus::Running)
        ->and($run->label)->toBe('Create server my-first-server')
        ->and(implode(' ', $run->command))->not->toContain('dop_v1_secret');

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest): bool => $alias === $run->alias()
        && array_slice($cmd, 0, 2) === ['/bin/sh', '-c']
        && str_contains($cmd[2], 'env -i ')
        && str_contains($cmd[2], 'TF_VAR_do_token="$TF_VAR_do_token"')
        && array_slice($cmd, 4) === [
            "{$bin}/larakube", 'cloud:create', '--provider=do', '--vps', '--stack-name=my-first-server',
            '--region=sgp1', '--size=s-1vcpu-2gb', '--json', '--no-interaction',
        ]
        && ! str_contains(implode(' ', $cmd), 'dop_v1_secret')
        && ($env['TF_VAR_do_token'] ?? null) === 'dop_v1_secret'
        && ($env['PATH'] ?? null) === $bin);

    File::deleteDirectory($bin);
});

test('server fields are validated before anything runs', function () {
    $bin = createServerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('servers.store'), [
        'provider' => 'linode',
        'stack_name' => 'My Server!',
        'region' => 'sgp1; rm -rf',
        'size' => '',
    ])->assertSessionHasErrors(['provider', 'stack_name', 'region', 'size']);

    expect(Run::count())->toBe(0);
    expect($fake->starts)->toBe([]);

    File::deleteDirectory($bin);
});
