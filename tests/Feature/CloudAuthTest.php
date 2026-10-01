<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

test('saving aws credentials writes credentials and config files', function () {
    $tempHome = storage_path('framework/testing/home-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($tempHome);

    putenv("HOME={$tempHome}");
    $_SERVER['HOME'] = $tempHome;

    Process::fake([
        '*aws*sts*get-caller-identity*' => Process::result(output: json_encode(['Account' => '123456789012', 'Arn' => 'arn:aws:iam::123456789012:user/demo'])),
    ]);

    $response = $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'AKIAIOSFODNN7EXAMPLE',
        'secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'region' => 'ap-southeast-1',
    ]);

    $response->assertRedirect()
        ->assertSessionHas('success');

    $credsPath = "{$tempHome}/.aws/credentials";
    $configPath = "{$tempHome}/.aws/config";

    expect(file_exists($credsPath))->toBeTrue()
        ->and(file_get_contents($credsPath))->toContain('AKIAIOSFODNN7EXAMPLE')
        ->and(file_exists($configPath))->toBeTrue()
        ->and(file_get_contents($configPath))->toContain('ap-southeast-1');

    File::deleteDirectory($tempHome);
});

test('saving invalid aws access key fails validation', function () {
    $this->post(route('setup.cloud.aws'), [
        'access_key_id' => 'invalid-key!',
        'secret_access_key' => 'short',
        'region' => 'us-east-1',
    ])->assertSessionHasErrors(['access_key_id', 'secret_access_key']);
});

test('gcp project can be set via controller', function () {
    $dir = storage_path('framework/testing/bin-'.bin2hex(random_bytes(4)));
    File::ensureDirectoryExists($dir);
    File::put("{$dir}/gcloud", "#!/bin/sh\nexit 0\n");
    chmod("{$dir}/gcloud", 0755);

    app()->instance(ToolLocator::class, new ToolLocator([$dir]));

    Process::fake([
        '*gcloud*config*set*project*' => Process::result(),
    ]);

    $this->post(route('setup.cloud.gcp.project'), ['project_id' => 'my-gcp-project'])
        ->assertRedirect()
        ->assertSessionHas('success');

    File::deleteDirectory($dir);
});
