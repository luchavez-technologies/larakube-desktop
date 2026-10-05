<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

test('on Windows the AWS keys are written inside the distro, with the secret on stdin and never in a command line', function () {
    putenv('SystemRoot=C:\\Windows');
    Process::fake(['*' => Process::result(output: '')]);
    app()->instance(ToolLocator::class, new ToolLocator(windows: true));

    $this->post('/setup/cloud/aws', [
        'access_key_id' => 'AKIAIOSFODNN7EXAMPLE',
        'secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'region' => 'us-east-1',
    ])->assertRedirect();

    Process::assertRan(fn ($process): bool => in_array('/usr/bin/tee', (array) $process->command, true)
        && in_array('/home/larakube/.aws/credentials', (array) $process->command, true)
        && str_contains((string) $process->input, 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'));

    Process::assertRan(fn ($process): bool => in_array('/usr/bin/install', (array) $process->command, true)
        && in_array('600', (array) $process->command, true));

    Process::assertNotRan(fn ($process): bool => str_contains(implode(' ', (array) $process->command), 'wJalrXUtnFEMI'));
});
