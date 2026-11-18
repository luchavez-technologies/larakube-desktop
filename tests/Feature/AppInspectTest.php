<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function appInspectFakeCli(array $fakes): string
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

test('the Configuration tab lists what tool:resources reports for the instance', function () {
    $resources = ['success' => true, 'instance' => 'flow-example-com', 'namespace' => 'larakube-shared', 'resources' => [
        ['kind' => 'Secret', 'name' => 'n8n-smtp-flow-example-com', 'keys' => [['key' => 'N8N_SMTP_PASS', 'owner' => 'managed']]],
    ]];
    $bin = appInspectFakeCli(['*tool:resources*' => Process::result(output: json_encode($resources))]);

    $this->getJson(route('servers.apps.resources', ['server' => 'workshop-demo', 'tool' => 'n8n', 'domain' => 'flow.example.com']))
        ->assertOk()
        ->assertExactJson($resources);

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'tool:resources production --tool=n8n --context=larakube-203.0.113.21 --json')
        && str_contains(implode(' ', (array) $process->command), '--domain=flow.example.com'));

    File::deleteDirectory($bin);
});

test('revealing a value asks tool:secret for exactly that Secret and key', function () {
    $bin = appInspectFakeCli(['*tool:secret*' => Process::result(output: json_encode(['success' => true, 'name' => 'n8n-smtp-flow-example-com', 'key' => 'N8N_SMTP_PASS', 'value' => 'hunter2']))]);

    $this->postJson(route('servers.apps.resources.reveal', ['server' => 'workshop-demo', 'tool' => 'n8n']), [
        'domain' => 'flow.example.com', 'name' => 'n8n-smtp-flow-example-com', 'key' => 'N8N_SMTP_PASS',
    ])->assertOk()->assertJson(['success' => true, 'value' => 'hunter2']);

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), '--name=n8n-smtp-flow-example-com --key=N8N_SMTP_PASS'));

    File::deleteDirectory($bin);
});

test('revealing a value needs both the Secret and the key', function () {
    $bin = appInspectFakeCli([]);

    $this->postJson(route('servers.apps.resources.reveal', ['server' => 'workshop-demo', 'tool' => 'n8n']), ['name' => 'n8n-smtp-flow-example-com'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('key');

    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'tool:secret'));

    File::deleteDirectory($bin);
});

test('the Logs tab asks only for lines after the last one shown, for the chosen component', function () {
    $bin = appInspectFakeCli(['*matrix:logs*' => Process::result(output: json_encode(['success' => true, 'components' => ['synapse'], 'lines' => []]))]);

    $this->getJson(route('servers.apps.logs', ['server' => 'workshop-demo', 'tool' => 'matrix', 'domain' => 'chat.example.com', 'component' => 'synapse', 'since_time' => '2026-11-18T01:00:00Z']))
        ->assertOk()
        ->assertJson(['success' => true, 'components' => ['synapse']]);

    Process::assertRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'matrix:logs production')
        && str_contains(implode(' ', (array) $process->command), '--component=synapse')
        && str_contains(implode(' ', (array) $process->command), '--since-time=2026-11-18T01:00:00Z'));

    File::deleteDirectory($bin);
});
