<?php

test('the database lets several requests overlap without locking each other out', function () {
    expect(config('database.connections.sqlite.journal_mode'))->toBe('WAL')
        ->and(config('database.connections.sqlite.busy_timeout'))->toBeGreaterThanOrEqual(5000);
});

test('the desktop server is started with several workers, except on Windows', function () {
    $source = (string) file_get_contents(base_path('nativephp/electron/electron-plugin/src/server/php.ts'));

    expect($source)->toContain("variables.PHP_CLI_SERVER_WORKERS = '4'")
        ->and($source)->toContain("process.platform !== 'win32'");
});
