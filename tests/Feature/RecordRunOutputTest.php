<?php

use App\Enums\RunKind;
use App\Jobs\Sync\SyncLocalClusterJob;
use App\Jobs\Sync\SyncLocalWorkloadsJob;
use App\Jobs\Sync\SyncServerClusterUsersJob;
use App\Jobs\Sync\SyncServerExternalDnsJob;
use App\Jobs\Sync\SyncServersJob;
use App\Jobs\Sync\SyncServerTlsJob;
use App\Listeners\RecordRunOutput;
use App\Models\ClusterTool;
use App\Models\Run;
use App\Models\Server;
use App\Services\Elevation;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Native\Desktop\Events\ChildProcess\ProcessExited;

test('elevation is revoked once a local up run finishes, since that is the only reason it was granted', function () {
    $run = Run::create([
        'label' => 'Up shop (local)',
        'kind' => RunKind::UpProject,
        'subject' => 'project:1',
        'environment' => 'local',
        'command' => ['larakube', 'up', 'local'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('revoke')->once();
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is left alone for a cloud up run, which never requested it', function () {
    $run = Run::create([
        'label' => 'Up shop (production)',
        'kind' => RunKind::UpProject,
        'subject' => 'project:1',
        'environment' => 'production',
        'command' => ['larakube', 'up', 'production'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldNotReceive('revoke');
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is revoked once a dnsmasq install/update finishes', function () {
    $run = Run::create([
        'label' => 'Install dnsmasq',
        'kind' => RunKind::InstallTool,
        'subject' => 'dnsmasq',
        'tool' => 'dnsmasq',
        'environment' => 'local',
        'command' => ['larakube', 'trust'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('revoke')->once();
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is left alone for installing a non-dnsmasq tool, which never requested it', function () {
    $run = Run::create([
        'label' => 'Install Podman',
        'kind' => RunKind::InstallTool,
        'subject' => 'podman',
        'tool' => 'podman',
        'environment' => 'local',
        'command' => ['larakube', 'runtime:install', '--runtime=podman'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldNotReceive('revoke');
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('elevation is revoked once local setup finishes', function () {
    $run = Run::create([
        'label' => 'Set up local development',
        'kind' => RunKind::SetupLocal,
        'subject' => 'local-cluster',
        'command' => ['larakube', 'setup', '--profile=local'],
    ]);

    $elevation = mock(Elevation::class);
    $elevation->shouldReceive('revoke')->once();
    app()->instance(Elevation::class, $elevation);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));
});

test('a local up/down/start/stop queues an immediate local cluster and workloads re-sync instead of waiting for the next scheduled tick', function (RunKind $kind) {
    Queue::fake();
    // A local UpProject also triggers Elevation::revoke() (see the dedicated
    // elevation tests above) — faked here so it can never shell out to a
    // real `osascript`/`pkexec`/sudo prompt on the machine running this suite.
    Process::fake();

    $run = Run::create([
        'label' => 'Local project action',
        'kind' => $kind,
        'subject' => 'project:1',
        'environment' => 'local',
        'command' => ['larakube', 'up', 'local'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(SyncLocalClusterJob::class, 1);
    Queue::assertPushed(SyncLocalWorkloadsJob::class, 1);
})->with([RunKind::UpProject, RunKind::DownProject, RunKind::StartProject, RunKind::StopProject]);

test('a cloud up/down/start/stop does not queue a local cluster or workloads re-sync', function () {
    Queue::fake();

    $run = Run::create([
        'label' => 'Up shop (production)',
        'kind' => RunKind::UpProject,
        'subject' => 'project:1',
        'environment' => 'production',
        'command' => ['larakube', 'up', 'production'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    Queue::assertNotPushed(SyncLocalClusterJob::class);
    Queue::assertNotPushed(SyncLocalWorkloadsJob::class);
});

test('connecting or disconnecting a domain queues an external-dns re-sync for the matching server', function (RunKind $kind) {
    Queue::fake();

    Server::create(['name' => 'cloud-prod', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-cloud-prod', 'status' => 'ready']);

    $run = Run::create([
        'label' => 'Domain run',
        'kind' => $kind,
        'subject' => 'cloud-prod',
        'meta' => ['server' => 'cloud-prod', 'context' => 'ctx-cloud-prod'],
        'context' => 'ctx-cloud-prod',
        'command' => ['larakube', 'tool:init'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(SyncServerExternalDnsJob::class, 1);
})->with([RunKind::ConnectDomain, RunKind::DisconnectDomain]);

test('enabling SSL or pruning TLS queues a tls and external-dns re-sync for the matching server', function (RunKind $kind) {
    Queue::fake();

    Server::create(['name' => 'cloud-prod', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-cloud-prod', 'status' => 'ready']);

    $run = Run::create([
        'label' => 'TLS run',
        'kind' => $kind,
        'subject' => 'cloud-prod',
        'meta' => ['server' => 'cloud-prod', 'context' => 'ctx-cloud-prod'],
        'context' => 'ctx-cloud-prod',
        'command' => ['larakube', 'tls:init'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(SyncServerTlsJob::class, 1);
    Queue::assertPushed(SyncServerExternalDnsJob::class, 1);
})->with([RunKind::EnableSsl, RunKind::PruneTls]);

test('granting or revoking cluster access queues a cluster-users re-sync, even though those runs carry no context in their own meta', function (RunKind $kind) {
    Queue::fake();

    $server = Server::create(['name' => 'cloud-prod', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-cloud-prod', 'status' => 'ready']);

    $run = Run::create([
        'label' => 'Cluster access run',
        'kind' => $kind,
        'subject' => 'server:cloud-prod',
        'meta' => ['server' => 'cloud-prod', 'teammate' => 'alice'],
        'context' => 'ctx-cloud-prod',
        'command' => ['larakube', 'cluster:grant'],
    ]);

    expect($run->server_id)->toBe($server->id);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    Queue::assertPushed(fn (SyncServerClusterUsersJob $job): bool => $job->serverId === $server->id);
})->with([RunKind::ClusterGrant, RunKind::ClusterRevoke]);

test('successful wire and unwire runs update cluster tool wiring data optimistically', function (RunKind $kind, string $capability, string $expectedStatus) {
    Queue::fake();

    $server = Server::create(['name' => 'cloud-prod', 'provider' => 'gcp', 'kind' => 'vps', 'context' => 'ctx-cloud-prod', 'status' => 'ready']);
    $tool = ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'forgejo',
        'host' => 'git.example.com',
        'installed' => true,
        'position' => 0,
        'data' => ['sso' => 'unwired', 'mail' => 'unwired', 'rotation' => 'unwired'],
    ]);

    $run = Run::create([
        'label' => 'Wire run',
        'kind' => $kind,
        'subject' => 'forgejo',
        'meta' => [
            'server' => 'cloud-prod',
            'context' => 'ctx-cloud-prod',
            'tool' => 'forgejo',
            'domain' => 'git.example.com',
            'capability' => $capability,
        ],
        'context' => 'ctx-cloud-prod',
        'command' => ['larakube', 'sso:wire'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    $tool->refresh();
    expect($tool->data[$capability])->toBe($expectedStatus);
})->with([
    [RunKind::SsoWire, 'sso', 'wired'],
    [RunKind::SsoUnwire, 'sso', 'unwired'],
    [RunKind::MailWire, 'mail', 'wired'],
    [RunKind::MailUnwire, 'mail', 'unwired'],
    [RunKind::OpenBaoWire, 'rotation', 'wired'],
    [RunKind::OpenBaoUnwire, 'rotation', 'unwired'],
]);

test('successful create-server run updates server status to ready and dispatches SyncServersJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'new-vps',
        'provider' => 'gcp',
        'kind' => 'vps',
        'status' => 'provisioning',
    ]);

    $run = Run::create([
        'label' => 'Create server new-vps',
        'kind' => RunKind::CreateServer,
        'server_name' => 'new-vps',
        'target_name' => 'new-vps',
        'stdout' => json_encode([
            'success' => true,
            'stackName' => 'new-vps',
            'kind' => 'vps',
            'ip' => '34.100.1.2',
            'context' => 'larakube-34.100.1.2',
        ]),
        'command' => ['larakube', 'cloud:create'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    $server->refresh();
    expect($server->status)->toBe('ready')
        ->and($server->ip)->toBe('34.100.1.2')
        ->and($server->context)->toBe('larakube-34.100.1.2');

    Queue::assertPushed(SyncServersJob::class);
});

test('failed create-server run updates server status to failed and dispatches SyncServersJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'failing-vps',
        'provider' => 'gcp',
        'kind' => 'vps',
        'status' => 'provisioning',
    ]);

    $run = Run::create([
        'label' => 'Create server failing-vps',
        'kind' => RunKind::CreateServer,
        'server_name' => 'failing-vps',
        'target_name' => 'failing-vps',
        'stdout' => json_encode(['success' => false, 'error' => 'Quota exceeded']),
        'command' => ['larakube', 'cloud:create'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 1));

    $server->refresh();
    expect($server->status)->toBe('failed');

    Queue::assertPushed(SyncServersJob::class);
});

test('successful destroy-server run updates server status to destroyed and dispatches SyncServersJob', function () {
    Queue::fake();

    $server = Server::create([
        'name' => 'old-vps',
        'provider' => 'gcp',
        'kind' => 'vps',
        'context' => 'ctx-old-vps',
        'status' => 'ready',
    ]);

    $run = Run::create([
        'label' => 'Destroy server old-vps',
        'kind' => RunKind::DestroyServer,
        'server_name' => 'old-vps',
        'target_name' => 'old-vps',
        'stdout' => json_encode(['success' => true]),
        'command' => ['larakube', 'cloud:destroy'],
    ]);

    (new RecordRunOutput)->handleExit(new ProcessExited($run->alias(), 0));

    $server->refresh();
    expect($server->status)->toBe('destroyed');

    Queue::assertPushed(SyncServersJob::class);
});
