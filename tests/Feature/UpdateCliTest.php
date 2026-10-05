<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

test('on Windows the CLI is updated by its own update command inside the distro, without asking', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake(['*' => Process::result(output: "/usr/local/bin/larakube\n")]);
    $fake = ChildProcess::fake();

    $this->post('/setup/cli/update', ['channel' => 'canary'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('update', (array) $cmd, true)
        && in_array('--canary', (array) $cmd, true)
        && in_array('--yes', (array) $cmd, true)
        && in_array('--exec', (array) $cmd, true));

    expect(Run::query()->latest('id')->first()->kind)->toBe(RunKind::InstallTool);
});

test('the stable channel updates without --canary', function () {
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake(['*' => Process::result(output: "/usr/local/bin/larakube\n")]);
    $fake = ChildProcess::fake();

    $this->post('/setup/cli/update', ['channel' => 'stable'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('update', (array) $cmd, true) && ! in_array('--canary', (array) $cmd, true));
});
