<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Process\FakeProcessResult;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function clusterToolEnvSandbox(string $context = 'fake-ctx'): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return $context;
}

/** @return array<string, FakeProcessResult|Closure> */
function clusterToolEnvStackFake(string $context = 'fake-ctx'): array
{
    return [
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'workshop-demo', 'provider' => 'gcp', 'kind' => 'vps', 'region' => null, 'ip' => '203.0.113.21', 'context' => $context, 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
    ];
}

test('status shells out to tool:env --json and returns the decoded status', function (): void {
    $context = clusterToolEnvSandbox();

    Process::fake([
        ...clusterToolEnvStackFake($context),
        '*tool:env*production*' => Process::result(output: json_encode([
            'success' => true,
            'exists' => true,
            'instance' => 'pb-example-com',
            'namespace' => 'larakube-shared',
            'vaulted' => true,
            'items' => [
                ['key' => 'FEATURE_X', 'secret' => false, 'value' => 'true'],
            ],
        ])),
    ]);

    $response = $this->getJson('/servers/workshop-demo/apps/pocketbase/env?domain=pb.example.com');

    $response->assertOk()
        ->assertJson([
            'status' => [
                'exists' => true,
                'instance' => 'pb-example-com',
                'vaulted' => true,
                'items' => [
                    ['key' => 'FEATURE_X', 'secret' => false, 'value' => 'true'],
                ],
            ],
        ]);

    Process::assertRan(function ($process) use ($context) {
        $cmd = implode(' ', (array) $process->command);

        return str_contains($cmd, 'tool:env')
            && str_contains($cmd, '--tool=pocketbase')
            && str_contains($cmd, "--context={$context}")
            && str_contains($cmd, '--domain=pb.example.com')
            && ! str_contains($cmd, '--reveal');
    });
});

test('status passes --reveal through when requested', function (): void {
    $context = clusterToolEnvSandbox();

    Process::fake([
        ...clusterToolEnvStackFake($context),
        '*tool:env*production*' => Process::result(output: json_encode([
            'success' => true, 'exists' => true, 'instance' => 'pb', 'namespace' => 'ns', 'vaulted' => false, 'items' => [],
        ])),
    ]);

    $this->getJson('/servers/workshop-demo/apps/pocketbase/env?domain=pb.example.com&reveal=1')->assertOk();

    Process::assertRan(fn ($process) => str_contains(implode(' ', (array) $process->command), '--reveal'));
});

test('update builds --set, --set-secret, --unset, and --restart from the posted batch', function (): void {
    $context = clusterToolEnvSandbox();

    Process::fake([
        ...clusterToolEnvStackFake($context),
        '*tool:env:set*production*' => Process::result(output: json_encode([
            'success' => true, 'vaulted' => true, 'restarted' => true,
        ])),
    ]);

    $response = $this->postJson('/servers/workshop-demo/apps/pocketbase/env', [
        'domain' => 'pb.example.com',
        'set' => ['FEATURE_X' => 'true'],
        'setSecret' => ['WEBHOOK_SECRET' => 'super-secret'],
        'unset' => ['OLD_KEY'],
        'restart' => true,
    ]);

    $response->assertOk()->assertJson(['success' => true, 'vaulted' => true, 'restarted' => true]);

    Process::assertRan(function ($process) {
        $cmd = implode(' ', (array) $process->command);

        return str_contains($cmd, 'tool:env:set')
            && str_contains($cmd, '--tool=pocketbase')
            && str_contains($cmd, '--domain=pb.example.com')
            && str_contains($cmd, '--set=FEATURE_X=true')
            && str_contains($cmd, '--set-secret=WEBHOOK_SECRET=super-secret')
            && str_contains($cmd, '--unset=OLD_KEY')
            && str_contains($cmd, '--restart');
    });
});

test('update surfaces a CLI-reported error', function (): void {
    $context = clusterToolEnvSandbox();

    Process::fake([
        ...clusterToolEnvStackFake($context),
        '*tool:env:set*production*' => Process::result(output: json_encode([
            'success' => false, 'error' => "Unknown tool 'pocketbase'.",
        ])),
    ]);

    $this->postJson('/servers/workshop-demo/apps/pocketbase/env', [
        'domain' => 'pb.example.com',
        'set' => ['FEATURE_X' => 'true'],
    ])->assertOk()->assertJson(['success' => false, 'error' => "Unknown tool 'pocketbase'."]);
});

test('env routes 404 when the server is not ready', function (): void {
    clusterToolEnvSandbox();

    Process::fake(clusterToolEnvStackFake());

    $this->getJson('/servers/does-not-exist/apps/pocketbase/env')->assertNotFound();
});
