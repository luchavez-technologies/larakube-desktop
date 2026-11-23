<?php

use App\Enums\RunKind;
use App\Http\Controllers\CompanionController;
use App\Models\Run;
use App\Services\LaraKube\GlobalSettings;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Native\Desktop\Facades\ChildProcess;

function companionControllerFakeCli(): string
{
    $bin = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    File::put("{$bin}/larakube", "#!/bin/sh\n");
    chmod("{$bin}/larakube", 0755);
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    return $bin;
}

test('installing a companion from the project page stays on that page — the floating RunDrawer shows progress, not a redirect to Activity', function () {
    $bin = companionControllerFakeCli();
    ChildProcess::fake();

    $this->from('/projects/1')
        ->withHeader('X-Inertia', 'true')
        ->post('/companions/add', ['companion' => 'pgadmin'])
        ->assertRedirect('/projects/1');

    File::deleteDirectory($bin);
});

test('installing a companion from outside Inertia (e.g. a direct link) still lands on the run\'s Activity page', function () {
    $bin = companionControllerFakeCli();
    ChildProcess::fake();

    $this->post('/companions/add', ['companion' => 'pgadmin'])
        ->assertRedirectContains('/runs/');

    File::deleteDirectory($bin);
});

test('each companion shows the image it runs and the one this CLI build installs', function () {
    $bin = storage_path('framework/testing/companion-bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($bin);
    foreach (['kubectl', 'larakube'] as $tool) {
        File::put("{$bin}/{$tool}", "#!/bin/sh\n");
        chmod("{$bin}/{$tool}", 0755);
    }
    app()->instance(ToolLocator::class, new ToolLocator([$bin]));

    Process::fake([
        '*get*deployment*larakube-companions*' => Process::result(output: (string) json_encode(['items' => [[
            'metadata' => ['name' => 'pgadmin'],
            'spec' => ['replicas' => 1, 'template' => ['spec' => ['containers' => [['image' => 'dpage/pgadmin4:9.1']]]]],
            'status' => ['readyReplicas' => 1],
        ]]])),
        '*companion:list*' => Process::result(output: "banner\n".json_encode([
            'success' => true,
            'companions' => [],
            'catalog' => [['slug' => 'pgadmin', 'image' => 'dpage/pgadmin4:9.4'], ['slug' => 'adminer', 'image' => 'adminer:5.3.0']],
        ])),
    ]);

    $list = collect(app(CompanionController::class)->all(app(ToolLocator::class), app(GlobalSettings::class)))->keyBy('slug');

    expect($list['pgadmin'])->toMatchArray(['installed' => true, 'image' => 'dpage/pgadmin4:9.1', 'available' => 'dpage/pgadmin4:9.4'])
        ->and($list['adminer'])->toMatchArray(['installed' => false, 'image' => null, 'available' => 'adminer:5.3.0']);

    File::deleteDirectory($bin);
});

test('Update re-applies a companion with the image this CLI build pins', function () {
    $bin = companionControllerFakeCli();
    $fake = ChildProcess::fake();

    $this->post(route('companions.update'), ['companion' => 'pgadmin'])->assertRedirect();

    $fake->assertStarted(fn (array|string $cmd, string $alias, ?string $cwd, mixed ...$rest): bool => array_slice($cmd, -4) === [
        'companion:update', 'pgadmin', '--json', '--no-interaction',
    ]);
    expect(Run::sole()->kind)->toBe(RunKind::CompanionUpdate);

    File::deleteDirectory($bin);
});
