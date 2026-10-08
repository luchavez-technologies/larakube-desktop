<?php

use App\Enums\ActivityType;
use App\Jobs\Sync\SyncServerDomainsJob;
use App\Models\Activity;
use App\Models\Server;
use App\Models\ServerDomain;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

function syncServerDomainsFakeCli(): string
{
    // ClusterStatus caches dns()/tls()/domains() per context for 10 minutes;
    // every test here reuses the same "larakube-alpha" context, so a prior
    // test's cached (often empty) result would otherwise silently mask this
    // one's fakes.
    Cache::flush();

    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);
    File::put("{$directory}/larakube", "#!/bin/sh\n");
    File::put("{$directory}/kubectl", "#!/bin/sh\n");
    chmod("{$directory}/larakube", 0755);
    chmod("{$directory}/kubectl", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('syncing domains upserts rows and marks the server fresh', function () {
    $bin = syncServerDomainsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    // A closure, not array patterns: the kubectl ingress command contains a
    // jsonpath expression ({.items[*]...}) that array-pattern glob matching
    // does not reliably match against, the same reason fakeFlowInitCluster()
    // elsewhere in this suite routes on the command string itself.
    Process::fake(function ($process) {
        $cmd = implode(' ', (array) $process->command);

        return match (true) {
            str_contains($cmd, 'external-dns:list') => Process::result(output: json_encode([
                ['slug' => 'cf1', 'zone' => 'example.com', 'ready' => true],
            ])),
            str_contains($cmd, 'tls:show') => Process::result(output: json_encode(['success' => true, 'zones' => ['secure.example.com']])),
            str_contains($cmd, 'get') && str_contains($cmd, 'ingress') => Process::result(output: 'app.other.net'),
            default => Process::result(output: ''),
        };
    });

    SyncServerDomainsJob::dispatchSync($server->id);

    $server->refresh();
    expect($server->domains_sync_status)->toBe('fresh')
        ->and($server->domains_last_synced_at)->not->toBeNull()
        ->and($server->domains)->toHaveCount(3);

    $exampleCom = ServerDomain::where('server_id', $server->id)->where('domain', 'example.com')->sole();
    expect($exampleCom->external_dns)->toBeTrue()
        ->and($exampleCom->in_use)->toBeFalse();

    $otherNet = ServerDomain::where('server_id', $server->id)->where('domain', 'other.net')->sole();
    expect($otherNet->in_use)->toBeTrue()
        ->and($otherNet->external_dns)->toBeFalse();

    File::deleteDirectory($bin);
});

test('a server with zero connected domains still ends up fresh, not perpetually unsynced', function () {
    $bin = syncServerDomainsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake(['*' => Process::result(output: '')]);

    SyncServerDomainsJob::dispatchSync($server->id);

    $server->refresh();
    expect($server->domains_sync_status)->toBe('fresh')
        ->and($server->domains_last_synced_at)->not->toBeNull()
        ->and($server->domains)->toHaveCount(0);

    File::deleteDirectory($bin);
});

test('a domain no longer reported is dropped, not kept as history', function () {
    $bin = syncServerDomainsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);
    ServerDomain::create(['server_id' => $server->id, 'domain' => 'gone.example.com', 'external_dns' => true]);

    Process::fake(['*' => Process::result(output: '')]);

    SyncServerDomainsJob::dispatchSync($server->id);

    expect(ServerDomain::where('server_id', $server->id)->count())->toBe(0);

    File::deleteDirectory($bin);
});

test('a missing server row is a no-op', function () {
    syncServerDomainsFakeCli();
    Process::fake(['*' => Process::result(output: '')]);

    SyncServerDomainsJob::dispatchSync(999999);

    expect(ServerDomain::count())->toBe(0);
});

test('re-syncing does not record an activity when nothing failed', function () {
    $bin = syncServerDomainsFakeCli();
    $server = Server::create(['name' => 'alpha', 'provider' => 'do', 'kind' => 'vps', 'context' => 'larakube-alpha', 'status' => 'ready']);

    Process::fake(['*' => Process::result(output: '')]);

    SyncServerDomainsJob::dispatchSync($server->id);
    SyncServerDomainsJob::dispatchSync($server->id);

    expect(Activity::where('type', ActivityType::DomainsSyncFailed)->count())->toBe(0);

    File::deleteDirectory($bin);
});
