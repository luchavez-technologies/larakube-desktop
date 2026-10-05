<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

function cloudAuthCli(string $result): void
{
    putenv('SystemRoot=C:\\Windows');
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));
    Process::fake([
        '*which*' => Process::result(output: "/usr/local/bin/larakube\n"),
        '*' => Process::result(output: $result),
    ]);
}

test('saving aws credentials asks the CLI, with the keys in the environment and never in the command', function () {
    cloudAuthCli(json_encode(['success' => true, 'provider' => 'aws', 'region' => 'ap-southeast-1', 'verified' => true]));

    $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'AKIAIOSFODNN7EXAMPLE',
        'secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'region' => 'ap-southeast-1',
    ])->assertRedirect()->assertSessionHas('success');

    Process::assertRan(fn ($process): bool => in_array('cloud:credentials', (array) $process->command, true)
        && in_array('--provider=aws', (array) $process->command, true)
        && in_array('--region=ap-southeast-1', (array) $process->command, true)
        && $process->environment['AWS_SECRET_ACCESS_KEY'] === 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        && ! str_contains(implode(' ', (array) $process->command), 'wJalrXUtnFEMI'));
});

test('keys that AWS does not accept are reported', function () {
    cloudAuthCli(json_encode(['success' => true, 'provider' => 'aws', 'region' => 'us-east-1', 'verified' => false]));

    $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'AKIAIOSFODNN7EXAMPLE',
        'secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'region' => 'us-east-1',
    ])->assertSessionHasErrors('aws');
});

test('a CLI that does not know the command is reported as too old', function () {
    cloudAuthCli('Command "cloud:credentials" is not defined.');

    $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'AKIAIOSFODNN7EXAMPLE',
        'secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'region' => 'us-east-1',
    ])->assertSessionHasErrors(['aws' => 'This LaraKube CLI is too old for that. Update it, then try again.']);
});

test('saving invalid aws access key fails validation', function () {
    $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'invalid-key!',
        'secret_access_key' => 'short',
        'region' => 'us-east-1',
    ])->assertSessionHasErrors(['access_key_id', 'secret_access_key']);
});

test('the gcp project is set by the CLI', function () {
    cloudAuthCli(json_encode(['success' => true, 'provider' => 'gcp', 'project' => 'my-gcp-project']));

    $this->postJson(route('setup.cloud.gcp.project'), ['project_id' => 'my-gcp-project'])->assertOk()->assertJson(['ok' => true]);

    Process::assertRan(fn ($process): bool => in_array('cloud:project', (array) $process->command, true)
        && in_array('--project=my-gcp-project', (array) $process->command, true));
});
