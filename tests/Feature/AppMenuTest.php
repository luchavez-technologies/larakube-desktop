<?php

use App\Models\Project;
use App\Models\Server;
use App\Services\LaraKube\AppMenu;

test('AppMenu::register executes cleanly without errors', function () {
    // Should run with empty database
    AppMenu::register();
    expect(true)->toBeTrue();
});

test('AppMenu::register executes with projects and servers populated', function () {
    Project::create(['path' => '/home/user/projects/my-laravel-app']);
    Server::create([
        'name' => 'test-server',
        'role' => 'cluster',
        'provider' => 'doks',
        'kind' => 'kubernetes',
        'status' => 'ready',
        'sync_status' => 'synced',
        'domains_sync_status' => 'synced',
        'port' => 22,
    ]);

    AppMenu::register();
    expect(true)->toBeTrue();
});
