<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Process;

test('isolated commands see only the allowlisted environment, not the parent app env', function () {
    putenv('DB_CONNECTION=sqlite');
    putenv('APP_CONFIG_CACHE=/tmp/desktop-config.php');

    try {
        $isolated = (new ToolLocator(['/usr/bin', '/bin']))->isolate(['/usr/bin/env'], ['TF_VAR_do_token' => 'dop_v1_secret']);

        $result = Process::env($isolated['environment'])->run($isolated['command'])->throw();

        $variables = array_filter(explode("\n", trim($result->output())));

        expect($variables)->toContain('TF_VAR_do_token=dop_v1_secret')
            ->toContain('PATH=/usr/bin:/bin')
            ->and(implode("\n", $variables))->not->toContain('DB_CONNECTION')
            ->not->toContain('APP_CONFIG_CACHE')
            ->and(implode(' ', $isolated['command']))->not->toContain('dop_v1_secret');
    } finally {
        putenv('DB_CONNECTION');
        putenv('APP_CONFIG_CACHE');
    }
});

test('invalid variable names are rejected before reaching the shell', function () {
    (new ToolLocator(['/usr/bin']))->isolate(['/usr/bin/true'], ['BAD;NAME' => 'x']);
})->throws(InvalidArgumentException::class);
