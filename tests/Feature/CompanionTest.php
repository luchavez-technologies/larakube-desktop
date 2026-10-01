<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function companionSandbox(): array
{
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    $bin = "{$home}/bin";
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    $_SERVER['HOME'] = realpath($home);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return ['home' => realpath($home), 'bin' => $bin];
}

test('companion add runs companion:add with target companion slug', function () {
    $sandbox = companionSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('companions.add'), ['companion' => 'adminer'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'companion:add', 'adminer', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::CompanionAdd);

    File::deleteDirectory($sandbox['home']);
});

test('companion start runs companion:start', function () {
    $sandbox = companionSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('companions.start'), ['companion' => 'redisinsight'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'companion:start', 'redisinsight', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::CompanionStart);

    File::deleteDirectory($sandbox['home']);
});

test('companion stop runs companion:stop', function () {
    $sandbox = companionSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('companions.stop'), ['companion' => 'redisinsight'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'companion:stop', 'redisinsight', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::CompanionStop);

    File::deleteDirectory($sandbox['home']);
});

test('companion remove runs companion:remove with force', function () {
    $sandbox = companionSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('companions.remove'), ['companion' => 'redisinsight'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'companion:remove', 'redisinsight', '--force', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::CompanionRemove);

    File::deleteDirectory($sandbox['home']);
});
