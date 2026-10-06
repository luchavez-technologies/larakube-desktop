<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\FilePicker;
use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;
use Native\Desktop\Facades\ChildProcess;

function devBoxSharingCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function devBoxSharingExperimental(bool $on): void
{
    $settings = mock(GlobalSettings::class);
    $settings->shouldReceive('hideProjects')->andReturnFalse();
    $settings->shouldReceive('experimental')->andReturn($on);
    $settings->shouldReceive('get')->andReturn(['cliChannel' => 'stable']);
    app()->instance(GlobalSettings::class, $settings);
}

function devBoxSharingStacks(): void
{
    Process::fake(['*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
        ['name' => 'remote-box', 'provider' => 'hetzner', 'kind' => 'vps', 'region' => 'fsn1', 'ip' => '203.0.113.88', 'sshKey' => '/tmp/key', 'context' => null, 'role' => 'dev', 'account' => null, 'projectId' => null, 'status' => 'ready'],
    ]]))]);
}

test('pickBundle returns chosen path from FilePicker', function () {
    devBoxSharingExperimental(true);
    $picker = mock(FilePicker::class);
    $picker->shouldReceive('pick')->with('Select Dev Box Bundle (.devbox)', ['devbox'], 'Dev Box Bundles')->andReturn('/Users/alice/Downloads/my-box.devbox');
    app()->instance(FilePicker::class, $picker);

    $this->get(route('devboxes.pick-bundle'))
        ->assertOk()
        ->assertJson(['path' => '/Users/alice/Downloads/my-box.devbox']);
});

test('exporting a dev box starts devbox:export with passphrase and output path', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    devBoxSharingStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.export', ['box' => 'remote-box']), [
        'passphrase' => 'Secret1234',
        'output' => '/tmp/remote-box.devbox',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ExportDevBox)
        ->and($run->target_name)->toBe('remote-box');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('devbox:export', (array) $cmd, true)
        && in_array('remote-box', (array) $cmd, true)
        && in_array('--output=/tmp/remote-box.devbox', (array) $cmd, true)
        && in_array('--passphrase=Secret1234', (array) $cmd, true)
        && in_array('--json', (array) $cmd, true)
    );

    File::deleteDirectory($bin);
});

test('importing a dev box starts devbox:import with bundle path and passphrase', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    $fake = ChildProcess::fake();

    $bundleFile = storage_path('framework/testing/test-'.bin2hex(random_bytes(4)).'.devbox');
    File::put($bundleFile, 'encrypted-content');

    $this->post(route('devboxes.import'), [
        'file' => $bundleFile,
        'name' => 'imported-box',
        'passphrase' => 'Secret1234',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ImportDevBox)
        ->and($run->target_name)->toBe('imported-box');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('devbox:import', (array) $cmd, true)
        && in_array($bundleFile, (array) $cmd, true)
        && in_array('--name=imported-box', (array) $cmd, true)
        && in_array('--passphrase=Secret1234', (array) $cmd, true)
        && in_array('--json', (array) $cmd, true)
    );

    File::delete($bundleFile);
    File::deleteDirectory($bin);
});

test('importing a dev box supports file uploads', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    $fake = ChildProcess::fake();

    $uploaded = UploadedFile::fake()->create('uploaded.devbox', 10);

    $this->post(route('devboxes.import'), [
        'bundle' => $uploaded,
        'passphrase' => 'Secret1234',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::ImportDevBox);

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('devbox:import', (array) $cmd, true)
        && in_array('--passphrase=Secret1234', (array) $cmd, true)
    );

    File::deleteDirectory($bin);
});

test('granting access to a dev box runs devbox:grant with github or pubkey', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    devBoxSharingStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.access.grant', ['box' => 'remote-box']), [
        'github' => 'octocat',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::GrantDevBoxAccess)
        ->and($run->target_name)->toBe('remote-box');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('devbox:grant', (array) $cmd, true)
        && in_array('remote-box', (array) $cmd, true)
        && in_array('--github=octocat', (array) $cmd, true)
    );

    File::deleteDirectory($bin);
});

test('revoking access from a dev box runs devbox:revoke', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    devBoxSharingStacks();
    $fake = ChildProcess::fake();

    $this->post(route('devboxes.access.revoke', ['box' => 'remote-box']), [
        'github' => 'octocat',
    ])->assertRedirect(route('runs.show', Run::sole()));

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::RevokeDevBoxAccess)
        ->and($run->target_name)->toBe('remote-box');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('devbox:revoke', (array) $cmd, true)
        && in_array('remote-box', (array) $cmd, true)
        && in_array('--github=octocat', (array) $cmd, true)
    );

    File::deleteDirectory($bin);
});

test('dev box show page defers collaborators query', function () {
    $bin = devBoxSharingCli();
    devBoxSharingExperimental(true);
    devBoxSharingStacks();

    $shell = mock(DevBoxShell::class);
    $shell->shouldReceive('json')->andReturn(['projects' => []]);
    $shell->shouldReceive('collaborators')->andReturn([
        ['type' => 'github', 'name' => 'alice', 'key' => 'ssh-ed25519 AAAAC3...'],
    ]);
    app()->instance(DevBoxShell::class, $shell);

    $this->get(route('devboxes.show', ['box' => 'remote-box']))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('devboxes/show')
            ->loadDeferredProps(fn (AssertableInertia $page) => $page
                ->has('collaborators', 1)
                ->where('collaborators.0.name', 'alice')
                ->where('collaborators.0.type', 'github')
            )
        );

    File::deleteDirectory($bin);
});
