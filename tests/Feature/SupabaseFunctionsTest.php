<?php

use App\Enums\RunKind;
use App\Enums\RunStatus;
use App\Models\Run;
use App\Services\FolderPicker;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function supabaseFunctionsCli(array $fakes = []): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => 'asia-east1', 'ip' => '203.0.113.21', 'context' => 'larakube-203.0.113.21', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        ...$fakes,
    ]);

    return $directory;
}

function supabaseFunctionsPicker(?string $answer): void
{
    $picker = mock(FolderPicker::class);
    $picker->shouldReceive('pick')->andReturn($answer);
    app()->instance(FolderPicker::class, $picker);
}

test('the Edge Functions card lists what supabase:functions:list reports, and the folder last deployed from', function () {
    $listed = ['success' => true, 'instance' => 'db-example-com', 'host' => 'db.example.com', 'enabled' => true, 'functions' => [
        ['name' => 'hello', 'shared' => false, 'url' => 'https://db.example.com/functions/v1/hello', 'updatedAt' => null],
    ]];
    $bin = supabaseFunctionsCli(['*supabase:functions:list*' => Process::result(output: json_encode($listed))]);
    Run::create([
        'label' => 'Deploy Edge Functions to db.example.com',
        'kind' => RunKind::DeploySupabaseFunctions,
        'status' => RunStatus::Succeeded,
        'meta' => ['server' => 'workshop-demo', 'host' => 'db.example.com', 'path' => '/Users/me/app/supabase/functions'],
        'command' => ['larakube', 'supabase:functions:deploy'],
    ]);

    $this->getJson(route('servers.apps.supabase.functions', ['server' => 'workshop-demo', 'domain' => 'db.example.com']))
        ->assertOk()
        ->assertJsonPath('functions.0.name', 'hello')
        ->assertJsonPath('lastDeploy.path', '/Users/me/app/supabase/functions');

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'supabase:functions:list production --context=larakube-203.0.113.21 --json')
        && str_contains(implode(' ', (array) $process->command), '--domain=db.example.com'));

    File::deleteDirectory($bin);
});

test('deploying asks for a folder, then runs supabase:functions:deploy with it as a run', function () {
    $bin = supabaseFunctionsCli();
    $folder = storage_path('framework/testing/functions-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($folder);
    supabaseFunctionsPicker($folder);
    $fake = ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.functions.deploy', ['server' => 'workshop-demo']), ['domain' => 'db.example.com'])
        ->assertOk()
        ->assertJsonPath('started', true);

    expect(Run::sole()->kind)->toBe(RunKind::DeploySupabaseFunctions)
        ->and(Run::sole()->meta['path'])->toBe($folder);
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('supabase:functions:deploy', (array) $cmd, true)
        && in_array("--path={$folder}", (array) $cmd, true)
        && in_array('--domain=db.example.com', (array) $cmd, true)
        && in_array('--context=larakube-203.0.113.21', (array) $cmd, true));

    File::deleteDirectory($folder);
    File::deleteDirectory($bin);
});

test('closing the folder picker starts nothing', function () {
    $bin = supabaseFunctionsCli();
    supabaseFunctionsPicker(null);
    ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.functions.deploy', ['server' => 'workshop-demo']), ['domain' => 'db.example.com'])
        ->assertOk()
        ->assertExactJson(['started' => false, 'cancelled' => true]);

    expect(Run::count())->toBe(0);
    File::deleteDirectory($bin);
});

test('deploying again from a folder that is gone says so instead of starting a run', function () {
    $bin = supabaseFunctionsCli();
    ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.functions.deploy', ['server' => 'workshop-demo']), ['domain' => 'db.example.com', 'path' => '/no/such/folder'])
        ->assertStatus(422)
        ->assertJsonPath('error', 'No folder at /no/such/folder.');

    expect(Run::count())->toBe(0);
    File::deleteDirectory($bin);
});

test('deleting a function runs supabase:functions:delete with --force, since the card already asked', function () {
    $bin = supabaseFunctionsCli();
    $fake = ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.functions.delete', ['server' => 'workshop-demo']), ['domain' => 'db.example.com', 'function' => 'functions'])
        ->assertOk()
        ->assertJsonPath('started', true);

    expect(Run::sole()->kind)->toBe(RunKind::DeleteSupabaseFunction)
        ->and(Run::sole()->meta['function'])->toBe('functions');
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => in_array('supabase:functions:delete', (array) $cmd, true)
        && in_array('--function=functions', (array) $cmd, true)
        && in_array('--force', (array) $cmd, true)
        && in_array('--domain=db.example.com', (array) $cmd, true)
        && in_array('--context=larakube-203.0.113.21', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('deleting refuses main and anything that is not a plain function name', function (string $name) {
    $bin = supabaseFunctionsCli();
    ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.functions.delete', ['server' => 'workshop-demo']), ['domain' => 'db.example.com', 'function' => $name])
        ->assertStatus(422);

    expect(Run::count())->toBe(0);
    File::deleteDirectory($bin);
})->with(['main', '../etc', 'a b', '']);
