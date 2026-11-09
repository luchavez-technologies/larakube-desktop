<?php

use Illuminate\Support\Facades\File;

test('mcp:serve-http fails when token is not configured', function (): void {
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);

    $this->artisan('mcp:serve-http')
        ->expectsOutput('No MCP HTTP bearer token configured.')
        ->assertFailed();

    File::deleteDirectory($home);
});
