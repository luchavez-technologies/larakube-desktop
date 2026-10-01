<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\FilePicker;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Native\Desktop\Facades\ChildProcess;

function contextSandbox(): array
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

test('context pick-file opens native picker and returns path', function () {
    $picker = mock(FilePicker::class);
    $picker->shouldReceive('pick')->with('Select Kubeconfig File')->andReturn('/home/user/.kube/config');
    app()->instance(FilePicker::class, $picker);

    $this->postJson(route('context.pick-file'))
        ->assertOk()
        ->assertJson(['path' => '/home/user/.kube/config']);
});

test('context import accepts uploaded file', function () {
    $sandbox = contextSandbox();
    ChildProcess::fake();

    $file = UploadedFile::fake()->create('custom-cluster.yaml', 100);

    $this->post(route('context.import'), ['file' => $file])->assertRedirect();
    expect(Run::sole()->kind)->toBe(RunKind::ContextImport);

    File::deleteDirectory($sandbox['home']);
});

test('context import expands tilde in file path', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $dummyKubeconfig = "{$sandbox['home']}/cluster.yaml";
    File::put($dummyKubeconfig, "apiVersion: v1\nkind: Config\n");

    $this->post(route('context.import'), ['file' => '~/cluster.yaml'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context:import', $dummyKubeconfig, '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextImport);

    File::deleteDirectory($sandbox['home']);
});

test('context import accepts file path', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $dummyKubeconfig = "{$sandbox['home']}/cluster.yaml";
    File::put($dummyKubeconfig, "apiVersion: v1\nkind: Config\n");

    $this->post(route('context.import'), ['file' => $dummyKubeconfig])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context:import', $dummyKubeconfig, '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextImport);

    File::deleteDirectory($sandbox['home']);
});

test('context import accepts raw YAML content', function () {
    $sandbox = contextSandbox();
    ChildProcess::fake();

    $this->post(route('context.import'), ['content' => "apiVersion: v1\nclusters: []\n"])->assertRedirect();
    expect(Run::sole()->kind)->toBe(RunKind::ContextImport);

    File::deleteDirectory($sandbox['home']);
});

test('context switch starts run with target context', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('context.switch'), ['context' => 'prod-cluster'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context', 'prod-cluster', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextSwitch);

    File::deleteDirectory($sandbox['home']);
});

test('context backup runs context:backup', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('context.backup'))->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context:backup', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextBackup);

    File::deleteDirectory($sandbox['home']);
});

test('context restore runs context:restore with file', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('context.restore'), ['file' => '/tmp/backup.yaml'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context:restore', '/tmp/backup.yaml', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextRestore);

    File::deleteDirectory($sandbox['home']);
});

test('context remove runs context:remove with force', function () {
    $sandbox = contextSandbox();
    $fake = ChildProcess::fake();
    $bin = "{$sandbox['bin']}/larakube";

    $this->post(route('context.remove'), ['context' => 'old-cluster'])->assertRedirect();
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'context:remove', 'old-cluster', '--force', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::ContextRemove);

    File::deleteDirectory($sandbox['home']);
});
