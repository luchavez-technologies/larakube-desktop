<?php

use App\Services\CurrentServer;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function currentServerFakeCli(): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

function currentServerFakes(): void
{
    Process::fake([
        '*cloud:stacks*' => Process::result(output: json_encode(['success' => true, 'stacks' => [
            ['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'region' => 'ams3', 'ip' => '203.0.113.1', 'context' => 'larakube-alpha', 'account' => null, 'projectId' => null, 'status' => 'ready'],
            ['name' => 'beta', 'provider' => 'do', 'kind' => 'vps', 'region' => 'ams3', 'ip' => '203.0.113.2', 'context' => 'larakube-beta', 'account' => null, 'projectId' => null, 'status' => 'ready'],
        ]])),
        '*tool:list*' => Process::result(output: json_encode([])),
        '*mail:show*' => Process::result(output: json_encode(['installed' => false])),
    ]);
}

test('a server picked on Tools is the one Mail opens to', function () {
    $bin = currentServerFakeCli();
    currentServerFakes();

    // Both start out defaulting to the first ready server.
    $this->get(route('tools'))->assertRedirect(route('servers.tools.index', 'alpha'));
    $this->get(route('mail'))->assertRedirect(route('servers.mail.index', 'alpha'));

    // Picking "beta" on Tools...
    $this->get(route('servers.tools.index', 'beta'))->assertOk();

    // ...carries over to Mail, not just back to Tools.
    $this->get(route('mail'))->assertRedirect(route('servers.mail.index', 'beta'));

    File::deleteDirectory($bin);
});

test('CurrentServer falls back to the last remembered name, then the first ready one', function () {
    $resolver = new CurrentServer;

    expect($resolver->resolve(['alpha', 'beta']))->toBe('alpha');

    $resolver->remember('beta');
    expect($resolver->resolve(['alpha', 'beta']))->toBe('beta');

    // A request for a server that isn't ready keeps the remembered one instead.
    expect($resolver->resolve(['alpha', 'beta'], 'gone'))->toBe('beta');

    // Explicitly requesting a ready server updates what's remembered.
    expect($resolver->resolve(['alpha', 'beta'], 'alpha'))->toBe('alpha');
    expect($resolver->resolve(['alpha', 'beta']))->toBe('alpha');
});
