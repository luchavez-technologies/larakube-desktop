<?php

use App\Models\Server;

function makeServerRow(array $overrides = []): Server
{
    return Server::withMissing()->create(array_merge([
        'name' => 'server-'.bin2hex(random_bytes(4)),
        'role' => 'deploy',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'larakube-203.0.113.9',
        'status' => 'ready',
    ], $overrides));
}

test('a missing server is excluded from default queries', function () {
    makeServerRow(['name' => 'ghost', 'status' => 'missing']);

    expect(Server::where('name', 'ghost')->first())->toBeNull()
        ->and(Server::withMissing()->where('name', 'ghost')->first())->not->toBeNull();
});

test('a destroyed server is excluded from default queries', function () {
    makeServerRow(['name' => 'gone', 'status' => 'destroyed']);

    expect(Server::where('name', 'gone')->first())->toBeNull()
        ->and(Server::withMissing()->where('name', 'gone')->first())->not->toBeNull();
});

test('two servers sharing a context resolve to the live one, not whichever row is older', function () {
    // Regression: a rename (or the cloud provider reassigning a freed IP to
    // a new droplet) can leave an old, now-missing server row sharing the
    // same context/IP as a new, ready one. Every lookup across the app
    // keyed by Server::firstWhere('context', ...) (ToolCatalog, Mail, SSO,
    // Drive, OpenBao, Plex, domains) must resolve to the live server, never
    // silently fall back to the dead one just because its id is lower.
    $dead = makeServerRow([
        'name' => 'desktop-demo',
        'context' => 'larakube-35.201.152.19',
        'status' => 'missing',
    ]);
    $live = makeServerRow([
        'name' => 'hello-larakube-desktop',
        'context' => 'larakube-35.201.152.19',
        'status' => 'ready',
    ]);

    expect($dead->id)->toBeLessThan($live->id);

    $resolved = Server::firstWhere('context', 'larakube-35.201.152.19');

    expect($resolved)->not->toBeNull()
        ->and($resolved->id)->toBe($live->id)
        ->and($resolved->name)->toBe('hello-larakube-desktop');
});
