<?php

use App\Services\LaraKube\DevBoxShell;
use App\Services\LaraKube\ToolLocator;

test('DevBoxShell command uses custom port when provided', function () {
    $shell = new DevBoxShell(new ToolLocator(['/usr/bin']));
    $cmd = $shell->command([
        'ip' => '203.0.113.10',
        'sshKey' => '/fake/id_ed25519',
        'port' => 8443,
    ], ['status']);

    expect($cmd)->toContain('-p', '8443');
});

test('DevBoxShell command defaults to port 22 when port not provided', function () {
    $shell = new DevBoxShell(new ToolLocator(['/usr/bin']));
    $cmd = $shell->command([
        'ip' => '203.0.113.10',
        'sshKey' => '/fake/id_ed25519',
    ], ['status']);

    expect($cmd)->not->toContain('-p');
});
