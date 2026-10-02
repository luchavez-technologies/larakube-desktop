<?php

use App\Enums\RunKind;
use App\Models\Run;
use App\Services\LaraKube\ClusterStatus;
use App\Services\LaraKube\StackCatalog;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Events\ChildProcess\ProcessExited;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Shell;

function backupServer(): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    $stacks = mock(StackCatalog::class);
    $stacks->shouldReceive('find')->with('prod-vps')->andReturn([
        'name' => 'prod-vps', 'provider' => 'digitalocean', 'context' => 'larakube-do-ams3', 'status' => 'ready',
    ]);
    app()->instance(StackCatalog::class, $stacks);

    return "{$bin}/larakube";
}

test('setting up backups hands the keys to the CLI by environment, never as arguments', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.setup', 'prod-vps'), [
        'endpoint' => 'https://abc.r2.cloudflarestorage.com',
        'bucket' => 'my-backups',
        'access_key' => 'AKEY-123',
        'secret_key' => 'SKEY-456',
        'create_bucket' => true,
        'cloudflare_token' => 'CF-789',
    ])->assertRedirect();

    $fake->assertStarted(function (array|string $cmd, string $alias, ?string $cwd, ?array $env, bool $persistent, mixed ...$rest) use ($bin): bool {
        $command = implode(' ', (array) $cmd);

        return array_slice($cmd, 4) === [
            $bin, 'backup:init', 'production', '--context=larakube-do-ams3',
            '--endpoint=https://abc.r2.cloudflarestorage.com', '--bucket=my-backups', '--region=auto', '--json',
            '--create-bucket', '--no-interaction',
        ]
            && ! str_contains($command, 'AKEY-123') && ! str_contains($command, 'SKEY-456') && ! str_contains($command, 'CF-789')
            && ($env['LARAKUBE_BACKUP_ACCESS_KEY'] ?? null) === 'AKEY-123'
            && ($env['LARAKUBE_BACKUP_SECRET_KEY'] ?? null) === 'SKEY-456'
            && ($env['LARAKUBE_CLOUDFLARE_TOKEN'] ?? null) === 'CF-789';
    });

    $run = Run::sole();
    expect($run->kind)->toBe(RunKind::BackupInit)
        ->and(json_encode($run->toArray()))->not->toContain('AKEY-123')->not->toContain('SKEY-456')->not->toContain('CF-789');
});

test('the destination must be an https endpoint with a valid bucket name', function () {
    backupServer();
    ChildProcess::fake();

    $this->post(route('servers.backups.setup', 'prod-vps'), [
        'endpoint' => 'http://insecure.example.com', 'bucket' => 'Bad Bucket', 'access_key' => 'a', 'secret_key' => 's',
    ])->assertSessionHasErrors(['endpoint', 'bucket']);

    expect(Run::count())->toBe(0);
});

test('a schedule preset becomes a cron expression in the chosen timezone', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.schedule', 'prod-vps'), ['schedule' => 'nightly', 'timezone' => 'Asia/Manila'])->assertRedirect();
    $this->post(route('servers.backups.schedule', 'prod-vps'), ['schedule' => 'every-second', 'timezone' => 'Asia/Manila'])->assertSessionHasErrors('schedule');

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'backup:schedule', 'production', '--context=larakube-do-ams3', '--cron=0 3 * * *', '--timezone=Asia/Manila', '--no-interaction',
    ]);
    expect(Run::count())->toBe(1);
});

test('back up now and stop scheduling start the matching commands', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.run', 'prod-vps'))->assertRedirect();
    $this->post(route('servers.backups.unschedule', 'prod-vps'))->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'backup:run', 'production', '--context=larakube-do-ams3', '--json', '--no-interaction']);
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'backup:unschedule', 'production', '--context=larakube-do-ams3', '--force', '--no-interaction']);
});

test('checking a backup reads everything and changes nothing', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.check', 'prod-vps'), ['backup' => '2026-10-02-030000'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'backup:restore', 'production', '--context=larakube-do-ams3', '--deep', '--dry-run', '--force', '--backup=2026-10-02-030000', '--no-interaction',
    ]);
});

test('restoring needs the item name typed back exactly', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.restore', 'prod-vps'), ['kind' => 'database', 'name' => 'forgejo', 'confirm' => 'forgjo'])
        ->assertSessionHasErrors('confirm');
    expect(Run::count())->toBe(0);

    $this->post(route('servers.backups.restore', 'prod-vps'), ['kind' => 'database', 'name' => 'forgejo', 'confirm' => 'forgejo', 'backup' => '2026-10-02-030000'])
        ->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [
        $bin, 'backup:restore', 'production', '--context=larakube-do-ams3', '--database=forgejo', '--force', '--backup=2026-10-02-030000', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::BackupRestore);
});

test('cleaning up only shows what would go until it is applied', function () {
    $bin = backupServer();
    $fake = ChildProcess::fake();

    $this->post(route('servers.backups.prune', 'prod-vps'))->assertRedirect();
    $this->post(route('servers.backups.prune', 'prod-vps'), ['apply' => true])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'backup:prune', 'production', '--context=larakube-do-ams3', '--no-interaction']);
    $fake->assertStarted(fn (array|string $cmd, mixed ...$rest): bool => array_slice($cmd, 4) === [$bin, 'backup:prune', 'production', '--context=larakube-do-ams3', '--apply', '--force', '--no-interaction']);
    expect(Run::query()->orderBy('id')->pluck('kind')->all())->toBe([RunKind::BackupCheck, RunKind::BackupPrune]);
});

test('the recovery card is shown in the file manager, never read', function () {
    backupServer();
    $card = storage_path('framework/testing/card-'.bin2hex(random_bytes(4)).'.txt');
    File::put($card, 'PASSPHRASE-SECRET');
    Cache::put('cluster-status:backup:larakube-do-ams3', ['success' => true, 'recoveryCard' => ['exists' => true, 'path' => $card]], 600);
    Shell::shouldReceive('showInFolder')->once()->with($card);

    $this->post(route('servers.backups.recovery-card', 'prod-vps'))->assertRedirect();

    File::delete($card);
});

test('a server is only asked about backups once, until a backup run ends', function () {
    backupServer();
    Cache::flush();
    Process::fake();
    $status = app(ClusterStatus::class);

    Cache::put('cluster-status:backup:larakube-do-ams3', ['success' => true, 'configured' => true], 600);
    expect($status->backup('larakube-do-ams3'))->toBe(['success' => true, 'configured' => true]);

    $run = Run::create(['label' => 'Back up prod-vps now', 'command' => ['larakube', 'backup:run'], 'kind' => RunKind::BackupRun, 'meta' => ['context' => 'larakube-do-ams3', 'server' => 'prod-vps']]);
    event(new ProcessExited($run->alias(), 0));

    expect(Cache::has('cluster-status:backup:larakube-do-ams3'))->toBeFalse();
});
