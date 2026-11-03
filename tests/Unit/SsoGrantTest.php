<?php

use App\Models\ClusterTool;
use App\Models\Server;
use App\Models\SsoGrant;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('an sso grant can be created via factory and persisted', function (): void {
    $grant = SsoGrant::factory()->create();

    expect($grant->exists)->toBeTrue()
        ->and($grant->id)->toBeGreaterThan(0);

    $this->assertDatabaseHas('sso_grants', [
        'id' => $grant->id,
        'email' => $grant->email,
        'slug' => $grant->slug,
        'tool' => $grant->tool,
        'role' => $grant->role,
        'project' => $grant->project,
    ]);
});

test('the unique constraint rejects duplicate insert for server email slug role and project', function (): void {
    $server = Server::create([
        'name' => 'test-server-unique',
        'provider' => 'gcp',
        'kind' => 'vps',
        'status' => 'ready',
    ]);

    SsoGrant::create([
        'server_id' => $server->id,
        'cluster_tool_id' => null,
        'email' => 'jane@example.com',
        'tool' => 'Forgejo (Git Forge & CI/CD)',
        'slug' => 'forgejo',
        'role' => 'admin',
        'project' => 'main',
    ]);

    expect(fn () => SsoGrant::create([
        'server_id' => $server->id,
        'cluster_tool_id' => null,
        'email' => 'jane@example.com',
        'tool' => 'Forgejo (Git Forge & CI/CD)',
        'slug' => 'forgejo',
        'role' => 'admin',
        'project' => 'main',
    ]))->toThrow(QueryException::class);
});

test('server ssoGrants relation returns a has many relation with rows for that server', function (): void {
    $server1 = Server::create(['name' => 'srv-1', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    $server2 = Server::create(['name' => 'srv-2', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);

    expect($server1->ssoGrants())->toBeInstanceOf(HasMany::class);

    $grant1 = SsoGrant::factory()->create(['server_id' => $server1->id, 'email' => 'one@example.com']);
    $grant2 = SsoGrant::factory()->create(['server_id' => $server1->id, 'email' => 'two@example.com']);
    $grant3 = SsoGrant::factory()->create(['server_id' => $server2->id, 'email' => 'three@example.com']);

    $server1Grants = $server1->ssoGrants()->get();

    expect($server1Grants)->toHaveCount(2)
        ->and($server1Grants->pluck('id')->all())->toEqualCanonicalizing([$grant1->id, $grant2->id])
        ->and($server1Grants->pluck('id')->all())->not->toContain($grant3->id);
});

test('sso grant belongs to server and cluster tool relations resolve correctly', function (): void {
    $server = Server::create(['name' => 'srv-rel', 'provider' => 'gcp', 'kind' => 'vps', 'status' => 'ready']);
    $tool = ClusterTool::create([
        'server_id' => $server->id,
        'tool' => 'forgejo',
        'installed' => true,
        'sync_status' => 'fresh',
        'data' => [],
    ]);

    $grant = SsoGrant::factory()->create([
        'server_id' => $server->id,
        'cluster_tool_id' => $tool->id,
    ]);

    expect($grant->server())->toBeInstanceOf(BelongsTo::class)
        ->and($grant->clusterTool())->toBeInstanceOf(BelongsTo::class)
        ->and($grant->server)->toBeInstanceOf(Server::class)
        ->and($grant->server->id)->toBe($server->id)
        ->and($grant->clusterTool)->toBeInstanceOf(ClusterTool::class)
        ->and($grant->clusterTool->id)->toBe($tool->id);
});

test('sso grant cluster tool relation resolves to null when cluster_tool_id is null', function (): void {
    $grant = SsoGrant::factory()->create(['cluster_tool_id' => null]);

    expect($grant->clusterTool)->toBeNull();
});
