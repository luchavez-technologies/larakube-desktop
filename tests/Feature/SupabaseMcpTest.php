<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function supabaseMcpCli(): string
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
    ]);

    return $directory;
}

test('the MCP card starts off, with the local URL it will use', function () {
    $bin = supabaseMcpCli();

    $this->getJson(route('servers.apps.supabase.mcp', ['server' => 'workshop-demo', 'domain' => 'db.example.com']))
        ->assertOk()
        ->assertJsonPath('running', false)
        ->assertJsonPath('url', 'http://127.0.0.1:54321/api/mcp?features=docs%2Cdatabase%2Cdebugging%2Cdevelopment');

    File::deleteDirectory($bin);
});

test('turning MCP on runs supabase:mcp in the background on the fixed local port', function () {
    $bin = supabaseMcpCli();
    $fake = ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.mcp.start', ['server' => 'workshop-demo']), ['domain' => 'db.example.com'])
        ->assertOk()
        ->assertJsonPath('starting', true);

    $fake->assertStarted(fn (array|string $cmd, string $alias, mixed ...$rest): bool => $alias === 'supabase-mcp'
        && in_array('supabase:mcp', (array) $cmd, true)
        && in_array('--port=54321', (array) $cmd, true)
        && in_array('--domain=db.example.com', (array) $cmd, true)
        && in_array('--context=larakube-203.0.113.21', (array) $cmd, true));

    File::deleteDirectory($bin);
});

test('turning MCP off stops it', function () {
    $bin = supabaseMcpCli();
    $fake = ChildProcess::fake();

    $this->postJson(route('servers.apps.supabase.mcp.stop', ['server' => 'workshop-demo']), ['domain' => 'db.example.com'])
        ->assertOk()
        ->assertJsonPath('running', false);

    $fake->assertStop('supabase-mcp');

    File::deleteDirectory($bin);
});
