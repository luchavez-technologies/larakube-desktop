<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

function fakeCloudAccountCli(string $result): void
{
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake([
        '*which*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*' => Process::result(output: $result),
    ]);
}

test('setDefault calls cloud:accounts --set-default with provider and account id', function () {
    fakeCloudAccountCli(json_encode(['success' => true]));

    $response = $this->post(route('setup.cloud.accounts.default'), [
        'provider' => 'do',
        'account_id' => 'do-work',
    ]);

    $response->assertRedirect()->assertSessionHas('success');

    Process::assertRan(fn ($process): bool => in_array('cloud:accounts', (array) $process->command, true)
        && in_array('--provider=do', (array) $process->command, true)
        && in_array('--set-default=do-work', (array) $process->command, true));
});

test('setDefault returns json response when requested', function () {
    fakeCloudAccountCli(json_encode(['success' => true]));

    $response = $this->postJson(route('setup.cloud.accounts.default'), [
        'provider' => 'aws',
        'account_id' => 'client-acme',
    ]);

    $response->assertOk()->assertJson(['ok' => true]);
});

test('add account calls cloud:accounts --add with token for digitalocean', function () {
    fakeCloudAccountCli(json_encode(['success' => true]));

    $response = $this->post(route('setup.cloud.accounts.add'), [
        'provider' => 'do',
        'name' => 'Agency Main',
        'token' => 'dop_v1_secret_token_123',
    ]);

    $response->assertRedirect()->assertSessionHas('success');

    Process::assertRan(fn ($process): bool => in_array('cloud:accounts', (array) $process->command, true)
        && in_array('--provider=do', (array) $process->command, true)
        && in_array('--name=Agency Main', (array) $process->command, true)
        && in_array('--token=dop_v1_secret_token_123', (array) $process->command, true)
        && in_array('--add', (array) $process->command, true));
});

test('remove account calls cloud:accounts --remove', function () {
    fakeCloudAccountCli(json_encode(['success' => true]));

    $response = $this->delete(route('setup.cloud.accounts.remove'), [
        'provider' => 'hetzner',
        'account_id' => 'hz-old',
    ]);

    $response->assertRedirect()->assertSessionHas('success');

    Process::assertRan(fn ($process): bool => in_array('cloud:accounts', (array) $process->command, true)
        && in_array('--provider=hetzner', (array) $process->command, true)
        && in_array('--remove=hz-old', (array) $process->command, true));
});
