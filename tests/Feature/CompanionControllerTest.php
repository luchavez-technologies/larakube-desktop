<?php

use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
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
