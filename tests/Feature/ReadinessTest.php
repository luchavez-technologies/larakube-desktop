<?php

use App\Services\LaraKube\ReadinessCheck;
use App\Services\LaraKube\ToolLocator;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Inertia\Testing\AssertableInertia;

/**
 * A throwaway bin directory holding empty executables named $binaries,
 * bound as the only place ToolLocator looks.
 *
 * @param  list<string>  $binaries
 */
function readinessFakeBinDirectory(array $binaries): string
{
    $directory = storage_path('framework/testing/bin-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($directory);

    foreach ($binaries as $binary) {
        File::put("{$directory}/{$binary}", "#!/bin/sh\n");
        chmod("{$directory}/{$binary}", 0755);
    }

    app()->instance(ToolLocator::class, new ToolLocator([$directory]));

    return $directory;
}

test('readiness reports installed tools with versions and missing ones as missing', function () {
    $bin = readinessFakeBinDirectory(['larakube', 'kubectl']);
    Process::fake([
        '*cloud:providers*' => Process::result(output: json_encode(['success' => true, 'providers' => []])),
        '*larakube*--version*' => Process::result(output: "LaraKube CLI v0.40.0\n"),
        '*kubectl*version*--client*' => Process::result(output: "Client Version: v1.34.1\nKustomize Version: v5.7.1\n"),
    ]);

    $this->get(route('readiness'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('readiness')
            ->missing('tools')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->where('tools.0.slug', 'larakube')
                ->where('tools.0.installed', true)
                ->where('tools.0.version', 'LaraKube CLI v0.40.0')
                ->where('tools.1.version', 'Client Version: v1.34.1')
                ->where('tools.2.slug', 'tofu')
                ->where('tools.2.installed', false)
                ->where('providers', [])));

    File::deleteDirectory($bin);
});

test('providers are null when the CLI is too old to know cloud:providers', function () {
    $bin = readinessFakeBinDirectory(['larakube']);
    Process::fake([
        '*cloud:providers*' => Process::result(errorOutput: 'Command "cloud:providers" is not defined.', exitCode: 1),
        '*' => Process::result(output: 'v1'),
    ]);

    $this->get(route('readiness'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload->where('providers', null)));

    File::deleteDirectory($bin);
});

test('the usage choice is saved and offered back to the Setup page', function () {
    readinessFakeBinDirectory(['larakube']);
    $home = storage_path('framework/testing/home-'.bin2hex(random_bytes(6)));
    File::ensureDirectoryExists($home);
    $_SERVER['HOME'] = realpath($home);
    Process::fake(['*' => Process::result(output: '')]);

    $this->post(route('setup.usage'), ['usage' => 'apps'])->assertRedirect();
    $this->post(route('setup.usage'), ['usage' => 'nonsense'])->assertSessionHasErrors('usage');

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page->where('usage', 'apps'));
});

test('the Setup page lists every tool at once, before any check has run', function () {
    readinessFakeBinDirectory(['larakube']);
    Process::fake(['*' => Process::result(output: '')]);

    $this->get(route('readiness'))->assertInertia(fn (AssertableInertia $page) => $page
        ->component('readiness')
        ->has('catalog', count(ReadinessCheck::TOOLS))
        ->where('catalog.0.slug', 'larakube')
        ->missing('tools'));
});
