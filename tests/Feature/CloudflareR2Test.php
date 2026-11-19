<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

test('POST /cloudflare/configure-r2 returns configured state when CLI succeeds', function (): void {
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    Process::fake([
        '*cloud:state:r2*' => Process::result(output: json_encode([
            'success' => true,
            'configured' => true,
            'hasR2Permission' => true,
            'bucket' => 'larakube-tofu-state',
            'endpoint' => 'https://acct-123.r2.cloudflarestorage.com',
            'accountId' => 'acct-123',
        ])),
    ]);

    $this->postJson('/cloudflare/configure-r2', ['token' => 'cf-test-token'])
        ->assertOk()
        ->assertJson([
            'configured' => true,
            'hasR2Permission' => true,
            'bucket' => 'larakube-tofu-state',
        ]);
});

test('POST /cloudflare/configure-r2 validates non-empty token', function (): void {
    $this->postJson('/cloudflare/configure-r2', ['token' => ''])
        ->assertStatus(422)
        ->assertJson([
            'configured' => false,
            'hasR2Permission' => false,
        ]);
});
