<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Events\ChildProcess\ErrorReceived;
use Native\Desktop\Events\ChildProcess\MessageReceived;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Window;

function runLifecycleRun(bool $json = true): Run
{
    return Run::create(['label' => 'Create server demo', 'command' => $json ? ['larakube', 'cloud:create', '--json'] : ['larakube', 'dns:init']]);
}

test('stderr streams into output and the stdout JSON line becomes the result', function () {
    $run = runLifecycleRun();

    event(new ErrorReceived($run->alias(), "\e[32mProvisioning droplet...\e[0m\n"));
    event(new ErrorReceived($run->alias(), "Installing k3s...\n"));
    event(new MessageReceived($run->alias(), '{"success":true,"stackName":"demo","ip":"203.0.113.10"}'."\n"));
    event(new ProcessExited($run->alias(), 0));

    $run->refresh();

    expect($run->output)->toBe("Provisioning droplet...\nInstalling k3s...\n")
        ->and($run->status)->toBe(RunStatus::Succeeded)
        ->and($run->exit_code)->toBe(0)
        ->and($run->result)->toMatchArray(['stackName' => 'demo', 'ip' => '203.0.113.10'])
        ->and($run->finished_at)->not->toBeNull();
});

test('a success:false result fails the run even on exit code 0', function () {
    $run = runLifecycleRun();

    event(new MessageReceived($run->alias(), '{"success":false,"error":"No DigitalOcean API token."}'));
    event(new ProcessExited($run->alias(), 0));

    expect($run->refresh()->status)->toBe(RunStatus::Failed);
});

test('events for unknown aliases are ignored', function () {
    event(new ErrorReceived('queue_default', 'noise'));
    event(new ProcessExited('run-999', 1));

    expect(Run::count())->toBe(0);
});

test('cancelling stops the child process and the exit keeps the cancelled status', function () {
    $fake = ChildProcess::fake();
    app()->instance(ToolLocator::class, new ToolLocator([]));
    $run = runLifecycleRun();

    $this->post(route('runs.cancel', $run))->assertRedirect(route('runs.show', $run));
    $fake->assertStop($run->alias());

    event(new ProcessExited($run->alias(), 143));

    expect($run->refresh()->status)->toBe(RunStatus::Cancelled);
});

test('installing a tool delegates to larakube setup', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));
    $fake = ChildProcess::fake();

    $this->post(route('setup.tools.install', 'tofu'))->assertRedirect(route('runs.show', Run::sole()));
    $this->post(route('setup.tools.install', 'git'))->assertNotFound();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$directory}/larakube", 'setup', '--tools=tofu', '--no-interaction']);

    File::deleteDirectory($directory);
});

test('installing Podman runs the runtime installer, not the tool setup', function () {
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));
    $fake = ChildProcess::fake();

    $this->post(route('setup.tools.install', 'podman'))->assertRedirect(route('runs.show', Run::sole()));

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === ["{$directory}/larakube", 'runtime:install', '--runtime=podman', '--no-interaction']);

    File::deleteDirectory($directory);
});

test('output posted back by NativePHP keeps its newlines', function () {
    $run = runLifecycleRun();
    $secret = 'test-secret';
    config(['nativephp-internal.secret' => $secret]);

    $this->withHeader('X-NativePHP-Secret', $secret)->postJson('/_native/api/events', [
        'event' => ErrorReceived::class,
        'payload' => ['alias' => $run->alias(), 'data' => "Installing k3s...\n"],
    ])->assertOk();

    $this->withHeader('X-NativePHP-Secret', $secret)->postJson('/_native/api/events', [
        'event' => MessageReceived::class,
        'payload' => ['alias' => $run->alias(), 'data' => '{"success":true,"ip":"203.0.113.10"}'."\n"],
    ])->assertOk();

    $run->refresh();

    expect($run->output)->toBe("Installing k3s...\n")
        ->and($run->stdout)->toBe('{"success":true,"ip":"203.0.113.10"}'."\n");
});

test('without --json, stdout is the log rather than a result', function () {
    $run = runLifecycleRun(json: false);

    event(new MessageReceived($run->alias(), "Reusing the stored Cloudflare token.\n"));
    event(new ProcessExited($run->alias(), 0));

    $run->refresh();

    expect($run->output)->toBe("Reusing the stored Cloudflare token.\n")
        ->and($run->stdout)->toBe('')
        ->and($run->status)->toBe(RunStatus::Succeeded);
});

test('a run that stops for a missing flag explains which one', function () {
    $run = runLifecycleRun(json: false);

    event(new MessageReceived($run->alias(), "\n  Missing --group\n\n  a stable name for this multi-zone instance (one.example, two.example)\n\n  Pass --group=… explicitly.\n"));
    event(new ProcessExited($run->alias(), 1));

    $run->refresh();

    expect($run->status)->toBe(RunStatus::Failed)
        ->and($run->result['error'])->toBe('The CLI needs --group: a stable name for this multi-zone instance (one.example, two.example).');
});

test('a run that crashes quotes the CLI\'s exception message', function () {
    $run = runLifecycleRun(json: false);

    event(new ErrorReceived($run->alias(), "\n\n\nIn Interactivity.php line 32:\n\n  Required.\n\n"));
    event(new ProcessExited($run->alias(), 1));

    $run->refresh();

    expect($run->status)->toBe(RunStatus::Failed)
        ->and($run->result['error'])->toBe('The LaraKube CLI stopped with: Required.');
});

test('runs.stream returns live output and run details as JSON', function () {
    $run = runLifecycleRun();
    $run->update(['output' => "Building containers...\n", 'status' => RunStatus::Running]);

    $this->getJson(route('runs.stream', $run))
        ->assertOk()
        ->assertJson([
            'id' => $run->id,
            'label' => 'Create server demo',
            'status' => 'running',
            'output' => "Building containers...\n",
        ]);
});

test('runs.detach returns success JSON', function () {
    // Window:: isn't fakeable via Http::fake() the way most NativePHP facades
    // are here — it talks to the Electron IPC bridge directly, which isn't
    // running at all under `php artisan test` (locally or in CI), so a real
    // call fails with a cURL connection error rather than a clean HTTP fake.
    // Mockery expectations are this codebase's own established way around it
    // (see FocusOnMenuClickTest).
    $run = runLifecycleRun();

    Window::shouldReceive('open')
        ->with("run-{$run->id}")
        ->once()
        ->andReturnSelf();
    Window::shouldReceive('title')->once()->andReturnSelf();
    Window::shouldReceive('url')->once()->andReturnSelf();
    Window::shouldReceive('width')->once()->andReturnSelf();
    Window::shouldReceive('height')->once()->andReturnSelf();
    Window::shouldReceive('minWidth')->once()->andReturnSelf();
    Window::shouldReceive('minHeight')->once()->andReturnSelf();
    Window::shouldReceive('rememberState')->once()->andReturnSelf();

    $this->postJson(route('runs.detach', $run))
        ->assertOk()
        ->assertJson(['detached' => true]);
});

test('runs.show renders the run details page with Inertia', function () {
    $run = runLifecycleRun();
    $run->update([
        'kind' => RunKind::UpdateDevBoxCli,
        'subject' => 'test-dev-box',
        'server_name' => 'test-dev-box',
        'meta' => ['server' => 'test-dev-box', 'role' => 'dev'],
    ]);

    $this->get(route('runs.show', $run))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('runs/show')
            ->where('run.id', $run->id)
            ->where('run.serverName', 'test-dev-box')
            ->where('run.meta.server', 'test-dev-box')
        );
});
