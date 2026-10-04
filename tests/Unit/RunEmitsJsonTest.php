<?php

use App\Models\Run;
use App\Services\LaraKube\DevBoxShell;

test('a run that asks the CLI for --json keeps stdout for the result, locally and on a dev box', function (): void {
    $local = new Run(['command' => ['/usr/local/bin/larakube', 'share', '--json', '--no-interaction']]);

    $shell = app(DevBoxShell::class);
    $box = ['ip' => '203.0.113.50', 'sshKey' => '/k'];
    $onBox = new Run(['command' => $shell->command($box, ['share:domain', '--domain=example.com', '--json'], 'shop')]);
    $fedOnBox = new Run(['command' => $shell->feeding($shell->command($box, ['share:domain', '--json'], 'shop', 'CLOUDFLARE_API_TOKEN'), 'CLOUDFLARE_API_TOKEN')]);

    expect($local->emitsJsonResult())->toBeTrue()
        ->and($onBox->emitsJsonResult())->toBeTrue()
        ->and($fedOnBox->emitsJsonResult())->toBeTrue();
});

test('a run without --json writes everything to the log', function (): void {
    $shell = app(DevBoxShell::class);
    $box = ['ip' => '203.0.113.50', 'sshKey' => '/k'];

    expect((new Run(['command' => ['/usr/local/bin/larakube', 'up', 'local']]))->emitsJsonResult())->toBeFalse()
        ->and((new Run(['command' => $shell->command($box, ['up', 'local', '--no-console'], 'shop')]))->emitsJsonResult())->toBeFalse()
        ->and((new Run(['command' => ['larakube', 'new', '--jsonish-flag']]))->emitsJsonResult())->toBeFalse();
});
